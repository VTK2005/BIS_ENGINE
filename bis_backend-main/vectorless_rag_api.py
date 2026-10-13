"""
BIS VECTORLESS RAG — FastAPI-compatible module (Agentic edition).

Reads credentials from environment variables (via .env).

Agentic pipeline:
    LLM decides whether retrieval is needed (tool-calling)
      -> If yes: 7-stage MongoDB PageIndex pipeline
           -> LLM category selection
           -> batched LLM product selection
           -> ALL PDFs for selected products
           -> ALL PageIndex trees/nodes
           -> local lexical ranking
           -> LLM node selection
           -> selected node content
           -> LLM final answer with sources
      -> If no: LLM answers directly (no DB call)
"""

import os
import json
import re
import time
import logging
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv
from pymongo import MongoClient
from openai import OpenAI

# ============================================================
# ENVIRONMENT
# ============================================================

load_dotenv()

GROQ_API_KEY_VL = os.getenv("GROQ_API_KEY")
MONGO_URI = os.getenv("MONGO_URI")

if not GROQ_API_KEY_VL:
    raise ValueError("GROQ_API_KEY is missing in .env")

if not MONGO_URI:
    raise ValueError("MONGO_URI is missing in .env (required for vectorless RAG)")


# ============================================================
# LOGGING
# ============================================================

logger = logging.getLogger(__name__)

# ============================================================
# MONGODB
# ============================================================

DATABASE_NAME = "vectorless_rag"

_mongo_client = MongoClient(MONGO_URI)
db = _mongo_client[DATABASE_NAME]

logger.info("Vectorless RAG connected to MongoDB database: %s", DATABASE_NAME)

# ============================================================
# GROQ CLIENT (OpenAI-compatible — supports tool-calling)
# ============================================================

_groq_client = OpenAI(
    base_url="https://api.groq.com/openai/v1",
    api_key=GROQ_API_KEY_VL,
    timeout=60,
)

# Model for internal pipeline stages (category / product / node selection).
# These are simple JSON extraction calls that don't need tool_calls API support.
GROQ_MODEL_VL = os.getenv("GROQ_MODEL", "openai/gpt-oss-120b")

# Model specifically for the agentic tool-calling turns.
# Must properly support OpenAI function-calling (returns tool_calls objects,
# NOT raw <tool_call> text).
# Verified: openai/gpt-oss-120b correctly populates tool_calls.
GROQ_AGENT_MODEL_VL = os.getenv(
    "GROQ_AGENT_MODEL",
    "openai/gpt-oss-120b",
)

# Retry settings for LLM API calls (handles rate limits on consecutive questions)
LLM_MAX_RETRIES = 3
LLM_RETRY_BASE_DELAY = 1.5  # seconds


def _llm_call_vl(
    messages: list,
    tools: Optional[list] = None,
    temperature: float = 0.0,
    model: Optional[str] = None,
    tool_choice: Optional[str] = None,
) -> Any:
    """
    Wrapper around _groq_client.chat.completions.create with retry + exponential backoff.
    Detects Groq 429 rate-limit responses and waits before retrying.
    """
    use_model = model or GROQ_AGENT_MODEL_VL
    kwargs: Dict[str, Any] = {
        "model": use_model,
        "messages": messages,
        "temperature": temperature,
    }
    if tools:
        kwargs["tools"] = tools
        kwargs["tool_choice"] = tool_choice if tool_choice else "auto"

    last_exc: Optional[Exception] = None
    for attempt in range(1, LLM_MAX_RETRIES + 1):
        try:
            return _groq_client.chat.completions.create(**kwargs)
        except Exception as exc:
            last_exc = exc
            exc_str = str(exc)

            # Check if Groq specified an exact wait time (e.g. "Please try again in 2.3s")
            retry_match = re.search(
                r"try again in ([\d\.]+)\s*s", exc_str, re.IGNORECASE
            )
            if retry_match:
                wait = float(retry_match.group(1)) + 0.5
            else:
                wait = LLM_RETRY_BASE_DELAY * (2 ** (attempt - 1))

            logger.warning(
                "LLM call (%s) failed (attempt %d/%d): %s — retrying in %.1fs",
                use_model,
                attempt,
                LLM_MAX_RETRIES,
                exc,
                wait,
            )
            if attempt < LLM_MAX_RETRIES:
                time.sleep(wait)

    raise last_exc


def ask_llm(system_prompt: str, user_prompt: str) -> str:
    """Simple two-message LLM call with retry and backoff (used inside pipeline stages)."""
    response = _llm_call_vl(
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        temperature=0.0,
        model=GROQ_MODEL_VL,
    )
    return response.choices[0].message.content or ""


def _format_direct_answer_vl(question: str, page_contents: List[Dict]) -> str:
    """
    When the LLM (Turn 2) is unavailable or rate-limited, format the retrieved
    page content directly into a readable answer with source citations.
    """
    if not page_contents:
        return (
            "I could not find relevant information in the BIS documents for your query. "
            "Please try rephrasing or use the Vector RAG mode."
        )

    lines = [
        "Here is the relevant BIS document content retrieved for your query:",
        "",
    ]
    for i, content in enumerate(page_contents, start=1):
        filename = content.get("filename", "")
        start_idx = content.get("start_index")
        end_idx = content.get("end_index")
        page_str = f"pages {start_idx}-{end_idx}" if start_idx else ""
        header = f"[Source {i}] {filename}"
        if page_str:
            header += f" ({page_str})"
        lines.append(header)
        text = (content.get("text", "") or "").strip()
        lines.append(text[:1200])
        lines.append("")

    lines.append(
        "*Note: This answer was formatted directly from retrieved document sections "
        "because the AI summariser was temporarily busy.*"
    )
    return "\n".join(lines)


# ============================================================
# AGENTIC TOOL DEFINITION
# ============================================================

SEARCH_TOOL_VL = {
    "type": "function",
    "function": {
        "name": "search_bis_documents",
        "description": (
            "Search the BIS document knowledge base using the MongoDB PageIndex "
            "pipeline. Navigates categories → products → documents → hierarchical "
            "page nodes to find relevant BIS standard content. "
            "Call this ONLY when the user's question requires specific BIS standard "
            "information, technical requirements, test procedures, tables, "
            "specifications, certification details, or factual information that "
            "must come from BIS documents. "
            "Do NOT call this for greetings, general chit-chat, or questions "
            "you can answer from general common knowledge."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": (
                        "The optimised search query to look up in the BIS "
                        "knowledge base. Should be a clear, specific question "
                        "or set of keywords that will best retrieve relevant "
                        "document sections."
                    ),
                }
            },
            "required": ["query"],
        },
    },
}

SYSTEM_PROMPT_VL = """\
You are a high-precision BIS (Bureau of Indian Standards) document assistant.

You have access to a tool called `search_bis_documents` that searches a MongoDB 
database of BIS technical documents using a hierarchical PageIndex pipeline.

DECISION RULES — when to call the tool:
- Call `search_bis_documents` when the user asks about BIS standards, technical 
  requirements, specifications, test methods, tables, certification details, 
  product requirements, clause references, or any specific factual information 
  that needs to come from the BIS document database.
- Do NOT call `search_bis_documents` for greetings, thanks, general conversation, 
  or questions you can answer from general common knowledge.
- If you are unsure whether the database has relevant information, call the 
  tool — it is better to search and find nothing than to guess.

ANSWERING RULES (after you have retrieved documents, if needed):
- Answer ONLY from the retrieved document evidence.
- Do not use outside knowledge or invent information.
- Preserve technical terms, standard numbers, section numbers, table 
  references, units, and numerical values exactly as found in the evidence.
- If the evidence does not contain the answer, say exactly: 
  "I could not find this information in the provided documents."
- Do not mention the database, MongoDB, PageIndex, or internal tools.
"""


# ============================================================
# TEXT-FALLBACK TOOL CALL DETECTOR
# ============================================================

_TEXT_TOOL_CALL_PATTERNS = [
    # Qwen3 / some models output raw XML-style tool calls as text
    "<tool_call>",
    "<function=search_bis_documents>",
    "search_bis_documents",
    # OpenAI-style inline text tool calls
    '"name": "search_bis_documents"',
]


def _text_contains_tool_call(text: str) -> bool:
    """Return True if the model accidentally embedded a tool call in its text output."""
    if not text:
        return False
    lower = text.lower()
    return any(p.lower() in lower for p in _TEXT_TOOL_CALL_PATTERNS)


def _extract_query_from_text(text: str, fallback: str) -> str:
    """
    Try to pull the query string from a text-embedded tool call.
    Handles both XML-style and JSON-style formats.
    Falls back to the original question.
    """
    # Try <parameter=query>.....</parameter>
    m = re.search(r"<parameter=query>\s*(.+?)\s*</parameter>", text, re.DOTALL)
    if m:
        return m.group(1).strip()

    # Try JSON "query": "..."
    m = re.search(r'"query"\s*:\s*"([^"]+)"', text)
    if m:
        return m.group(1).strip()

    # Try <query>...</query>
    m = re.search(r"<query>\s*(.+?)\s*</query>", text, re.DOTALL)
    if m:
        return m.group(1).strip()

    return fallback


# ============================================================
# AGENTIC VECTORLESS RAG — TOOL-CALLING LOOP
# ============================================================

def run_agentic_vectorless_rag(question: str) -> Dict[str, Any]:
    """
    Agentic two-turn loop with retry + graceful fallbacks:
      Turn 1 — LLM decides whether to call search_bis_documents (retried up to 3 times).
               If Turn 1 fails entirely, we run the vectorless pipeline directly.
      Turn 2 — LLM generates final answer from evidence (retried).
               If Turn 2 fails, raw retrieved page contents are formatted directly.
      If no retrieval needed — LLM answers directly.
    """

    messages: list = [
        {"role": "system", "content": SYSTEM_PROMPT_VL},
        {"role": "user", "content": question},
    ]

    retrieved_page_contents: List[Dict] = []
    turn1_failed = False
    assistant_message = None
    tool_calls = None
    text_content = ""

    # ── TURN 1: ask LLM with tool available ──────────────────
    logger.info(
        "Agentic Vectorless RAG — turn 1 (with retry) using model: %s",
        GROQ_AGENT_MODEL_VL,
    )

    try:
        response = _llm_call_vl(
            messages=messages,
            tools=[SEARCH_TOOL_VL],
            temperature=0.1,
            model=GROQ_AGENT_MODEL_VL,
        )
        assistant_message = response.choices[0].message
        tool_calls = assistant_message.tool_calls
        text_content = assistant_message.content or ""
    except Exception as exc:
        logger.error("Turn 1 failed after all retries: %s", exc)
        turn1_failed = True

    # ── FALLBACK: Turn 1 failed — run vectorless pipeline directly ─
    if turn1_failed:
        logger.info("Turn 1 fallback — running vectorless pipeline directly for: %r", question)
        tool_result, page_contents = _run_pipeline(question)
        retrieved_page_contents.extend(page_contents)
        if page_contents:
            answer = _generate_answer_from_evidence(question, page_contents, tool_result)
        else:
            answer = (
                "I could not find relevant information in the BIS documents for your query. "
                "Please try rephrasing or use the Vector RAG mode."
            )
        return {
            "answer": answer,
            "sources": _build_sources_from_contents(retrieved_page_contents),
            "used_retrieval": True,
        }

    # ── TEXT-FALLBACK: model leaked tool call as raw text ─────
    if not tool_calls and _text_contains_tool_call(text_content):
        search_query = _extract_query_from_text(text_content, question)
        logger.warning(
            "Text-fallback: model leaked tool call as text — "
            "extracting query %r and running pipeline directly",
            search_query,
        )
        tool_result, page_contents = _run_pipeline(search_query)
        retrieved_page_contents.extend(page_contents)
        answer = _generate_answer_from_evidence(
            question, page_contents, tool_result
        )
        return {
            "answer": answer,
            "sources": _build_sources_from_contents(retrieved_page_contents),
            "used_retrieval": True,
        }

    # ── PROPER TOOL EXECUTION via tool_calls API ─────────────
    if tool_calls:
        logger.info(
            "LLM requested %d tool call(s) — executing vectorless pipeline",
            len(tool_calls),
        )

        messages.append(assistant_message)

        for tool_call in tool_calls:
            if tool_call.function.name != "search_bis_documents":
                logger.warning("Unknown tool: %s — skipping", tool_call.function.name)
                continue

            try:
                args = json.loads(tool_call.function.arguments)
                search_query = args.get("query", question)
            except (json.JSONDecodeError, KeyError):
                search_query = question

            logger.info("Executing search_bis_documents with query: %r", search_query)

            tool_result, page_contents = _run_pipeline(search_query)
            retrieved_page_contents.extend(page_contents)

            messages.append({
                "role": "tool",
                "tool_call_id": tool_call.id,
                "content": tool_result,
            })

        # ── TURN 2: LLM generates final answer with evidence ──
        logger.info("Agentic Vectorless RAG — turn 2 (with retry)")

        try:
            final_response = _llm_call_vl(
                messages=messages,
                tools=[SEARCH_TOOL_VL],
                temperature=0.1,
                model=GROQ_AGENT_MODEL_VL,
                tool_choice="none",
            )
            answer = (final_response.choices[0].message.content or "").strip()
        except Exception as exc:
            logger.warning(
                "Turn 2 failed after all retries: %s — falling back to direct format",
                exc,
            )
            answer = _format_direct_answer_vl(question, retrieved_page_contents)

    else:
        # LLM chose NOT to call the tool — answer directly
        logger.info("Vectorless RAG — LLM answered directly (no retrieval needed)")
        answer = text_content.strip()

    if not answer:
        if retrieved_page_contents:
            answer = _format_direct_answer_vl(question, retrieved_page_contents)
        else:
            answer = (
                "I could not find relevant information in the BIS documents for your query. "
                "Please try rephrasing or use the Vector RAG mode."
            )

    return {
        "answer": answer,
        "sources": _build_sources_from_contents(retrieved_page_contents),
        "used_retrieval": bool(tool_calls or turn1_failed),
    }


def _generate_answer_from_evidence(
    question: str,
    page_contents: List[Dict],
    tool_result: str,
) -> str:
    """
    Generate a final answer from retrieved evidence.
    Used by the normal tool_calls path, text-fallback path, and Turn 1 fallback.
    """
    if not page_contents:
        return "I could not find relevant information in the BIS documents for your query."

    try:
        final_response = _llm_call_vl(
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT_VL},
                {"role": "user", "content": question},
                {
                    "role": "assistant",
                    "content": (
                        "I have retrieved the relevant BIS document sections. "
                        "Let me now answer based on this evidence."
                    ),
                },
                {
                    "role": "user",
                    "content": (
                        f"Retrieved document evidence:\n\n{tool_result}\n\n"
                        f"Please answer the original question thoroughly using ONLY this evidence."
                    ),
                },
            ],
            temperature=0.1,
            model=GROQ_AGENT_MODEL_VL,
        )
        return (final_response.choices[0].message.content or "").strip()
    except Exception as exc:
        logger.warning(
            "Evidence-based answer generation failed: %s — using direct format fallback",
            exc,
        )
        return _format_direct_answer_vl(question, page_contents)


def _run_pipeline(question: str):
    """
    Execute the full 7-stage MongoDB PageIndex retrieval pipeline.
    Returns (tool_result_text, page_contents_list).
    """

    # Stage 1
    selected_categories = retrieve_categories(question)
    if not selected_categories:
        logger.info("Pipeline Stage 1 failed — trying metadata fallback")
        fallback_result, fallback_contents = _metadata_fallback_answer(question)
        if fallback_contents:
            return fallback_result, fallback_contents
        return ("No relevant BIS category found for this query. The topic may not be indexed in the current document set.", [])

    # Stage 2
    selected_products = retrieve_products(question, selected_categories)
    if not selected_products:
        logger.info("Pipeline Stage 2 failed — trying metadata fallback")
        fallback_result, fallback_contents = _metadata_fallback_answer(question)
        if fallback_contents:
            return fallback_result, fallback_contents
        return ("No relevant BIS product found for this query in the selected category.", [])

    # Stage 3
    selected_documents = retrieve_documents(selected_products)
    if not selected_documents:
        return ("No BIS documents found for the selected product(s).", [])

    # Stage 4
    documents_with_trees = get_document_trees(selected_documents)
    if not documents_with_trees:
        return ("Selected documents have no usable PageIndex trees.", [])

    # Stage 5
    selected_nodes = retrieve_pageindex_nodes(question, documents_with_trees)
    if not selected_nodes:
        logger.info("Stage 5 found no nodes — trying top-nodes fallback")
        selected_nodes = _get_top_nodes_fallback(documents_with_trees, n=3)

    if not selected_nodes:
        return ("No relevant PageIndex nodes found in the BIS documents.", [])

    # Stage 6
    page_contents = get_selected_page_content(selected_nodes)
    if not page_contents:
        return ("Selected PageIndex nodes contained no usable text.", [])

    # Build the context text the LLM will receive as the tool result
    context_parts = []
    remaining_chars = FINAL_CONTEXT_MAX_CHARS

    for index, content in enumerate(page_contents, start=1):
        if remaining_chars <= 0:
            break
        text = truncate_to_token_budget(
            content.get("text", "") or "",
            MAX_FINAL_CHARS_PER_NODE // CHARS_PER_TOKEN,
        )
        block = (
            f"SOURCE {index}\n\n"
            f"DOCUMENT: {content['filename']}\n"
            f"DOCUMENT ID: {content['document_id']}\n"
            f"NODE ID: {content['node_id']}\n"
            f"PAGE RANGE: {content['start_index']} - {content['end_index']}\n\n"
            f"CONTENT:\n{text}\n"
        )
        if len(block) > remaining_chars:
            block = block[: max(0, remaining_chars - 200)] + "\n...[context budget reached]"
        context_parts.append(block)
        remaining_chars -= len(block)

    tool_result = (
        f"Retrieved {len(page_contents)} relevant document section(s) "
        f"from the BIS PageIndex database:\n\n"
        + "\n\n".join(context_parts)
    )

    logger.info("Pipeline complete — %d sections retrieved", len(page_contents))
    return tool_result, page_contents


# ============================================================
# METADATA-BASED FALLBACK ANSWER
# ============================================================

def _metadata_fallback_answer(question: str) -> tuple:
    """
    When the 7-stage PageIndex pipeline finds no relevant nodes,
    fall back to searching the products/categories/documents collections
    directly by name / text match.

    Returns (tool_result_text, page_contents_list).
    If nothing found, returns ("", []).
    """
    logger.info("Vectorless — attempting metadata fallback for: %r", question)

    q_lower = question.lower()
    # Build a set of meaningful query words (min 3 chars, skip stop words)
    stop_words = {
        "what", "give", "tell", "the", "for", "are", "is", "of", "a", "an",
        "to", "in", "on", "and", "or", "with", "from", "by", "as", "at",
        "be", "was", "were", "it", "this", "that", "can", "does", "do",
        "about", "brief", "please", "how", "which", "who", "where", "when",
        "why", "you", "me", "us", "we", "he", "she", "they", "requirements",
        "requirement", "required", "standard", "standards",
    }
    query_words = [
        w for w in re.findall(r"\b[a-zA-Z]{3,}\b", q_lower)
        if w not in stop_words
    ]

    if not query_words:
        return "", []

    # Step 1 — Try to find relevant products by name
    pattern = "|".join(re.escape(w) for w in query_words)
    matched_products = list(
        db.products.find(
            {"product_name": {"$regex": pattern, "$options": "i"}},
            {"_id": 1, "product_name": 1, "category_name": 1, "documents": 1},
            limit=5,
        )
    )

    # Step 2 — Try categories if no products found
    if not matched_products:
        matched_cats = list(
            db.categories.find(
                {"name": {"$regex": pattern, "$options": "i"}},
                {"_id": 1, "name": 1},
                limit=3,
            )
        )
        if matched_cats:
            cat_ids = [c["_id"] for c in matched_cats]
            matched_products = list(
                db.products.find(
                    {"category_id": {"$in": cat_ids}},
                    {"_id": 1, "product_name": 1, "category_name": 1, "documents": 1},
                    limit=5,
                )
            )

    # Step 3 — Try direct document search by filename / product_name
    if not matched_products:
        matched_docs = list(
            db.documents.find(
                {
                    "$or": [
                        {"filename": {"$regex": pattern, "$options": "i"}},
                        {"product_name": {"$regex": pattern, "$options": "i"}},
                        {"category_name": {"$regex": pattern, "$options": "i"}},
                    ]
                },
                {"_id": 1, "filename": 1, "product_name": 1, "category_name": 1, "tree_id": 1},
                limit=5,
            )
        )
        if matched_docs:
            # Synthesise fake product-like dicts so Stage 3–6 can run on them
            matched_products = [
                {
                    "_id": d.get("product_name", d["_id"]),
                    "product_name": d.get("product_name", ""),
                    "category_name": d.get("category_name", ""),
                    "documents": [{"document_id": d["_id"], "filename": d["filename"], "summary": ""}],
                }
                for d in matched_docs
            ]

    if not matched_products:
        logger.warning("Metadata fallback: no products or documents matched the query.")
        return "", []

    logger.info("Metadata fallback: found %d product(s)", len(matched_products))

    # Run Stages 3–6 on the matched products
    selected_documents = retrieve_documents(matched_products)
    if not selected_documents:
        return "", []

    documents_with_trees = get_document_trees(selected_documents)
    if not documents_with_trees:
        return "", []

    selected_nodes = retrieve_pageindex_nodes(question, documents_with_trees)
    if not selected_nodes:
        # Last resort: grab the very first node from the first tree
        selected_nodes = _get_top_nodes_fallback(documents_with_trees, n=3)

    if not selected_nodes:
        return "", []

    page_contents = get_selected_page_content(selected_nodes)
    if not page_contents:
        return "", []

    context_parts = []
    remaining_chars = FINAL_CONTEXT_MAX_CHARS
    for index, content in enumerate(page_contents, start=1):
        if remaining_chars <= 0:
            break
        text = truncate_to_token_budget(
            content.get("text", "") or "",
            MAX_FINAL_CHARS_PER_NODE // CHARS_PER_TOKEN,
        )
        block = (
            f"SOURCE {index}\n\n"
            f"DOCUMENT: {content['filename']}\n"
            f"DOCUMENT ID: {content['document_id']}\n"
            f"NODE ID: {content['node_id']}\n"
            f"PAGE RANGE: {content['start_index']} - {content['end_index']}\n\n"
            f"CONTENT:\n{text}\n"
        )
        if len(block) > remaining_chars:
            block = block[: max(0, remaining_chars - 200)] + "\n...[context budget reached]"
        context_parts.append(block)
        remaining_chars -= len(block)

    tool_result = (
        f"[Metadata fallback] Retrieved {len(page_contents)} section(s) from "
        f"BIS documents matching the query terms:\n\n"
        + "\n\n".join(context_parts)
    )
    return tool_result, page_contents


def _get_top_nodes_fallback(documents_with_trees: List[Dict], n: int = 3) -> List[Dict]:
    """
    Absolute last-resort fallback: return the first N leaf nodes from the
    trees associated with the selected documents, regardless of relevance score.
    Used only when the lexical ranking returns nothing.
    """
    collected: List[Dict] = []

    for document in documents_with_trees:
        if len(collected) >= n:
            break
        tree_doc = db.pageindex_trees.find_one({"_id": document["tree_id"]})
        if not tree_doc:
            continue
        tree = tree_doc.get("tree")
        if not tree:
            continue

        roots = tree if isinstance(tree, list) else [tree]

        def _walk(node):
            if len(collected) >= n:
                return
            if not isinstance(node, dict):
                return
            text = node.get("text", "") or ""
            if text.strip():
                collected.append({
                    "document_id": document["document_id"],
                    "filename": document["filename"],
                    "node_id": node.get("node_id"),
                    "title": node.get("title", ""),
                    "summary": node.get("summary", ""),
                    "start_index": node.get("start_index"),
                    "end_index": node.get("end_index"),
                    "text": text,
                    "parent_id": None,
                })
            for child in node.get("nodes", []) or []:
                _walk(child)

        for root in roots:
            _walk(root)

    logger.info("Top-nodes fallback collected %d nodes", len(collected))
    return collected


def _build_sources_from_contents(page_contents: List[Dict]) -> List[Dict]:
    """
    Convert raw page_contents to the sources list compatible with BISSourceComponent.

    Updated MongoDB documents schema (DB updated with real Drive URLs):
        _id, category_id, category_name, file_path, file_type,
        filename, product_id, product_name, tree_id,
        drive_file_id       → Google Drive file ID
        drive_link_access   → "anyone_with_link_viewer"
        drive_path          → "Category/Product/file.pdf"
        pdf_url             → "https://drive.google.com/file/d/<id>/view?usp=drivesdk"
    """
    sources = []
    seen: set = set()

    for content in page_contents:
        key = (content["document_id"], content["node_id"])
        if key in seen:
            continue
        seen.add(key)

        # Fetch all metadata from the updated documents collection
        doc_record = db.documents.find_one(
            {"_id": content["document_id"]},
            {
                "filename": 1,
                "category_name": 1,
                "product_name": 1,
                "drive_file_id": 1,
                "drive_path": 1,
                "pdf_url": 1,
            },
        ) or {}

        filename: str = doc_record.get("filename", content.get("filename", "")) or ""
        category_name: str = doc_record.get("category_name", "") or ""
        product_name: str = doc_record.get("product_name", "") or ""
        drive_file_id: str = doc_record.get("drive_file_id", "") or ""
        drive_path: str = doc_record.get("drive_path", "") or ""

        # Use the real Google Drive PDF URL stored in the updated DB.
        # Fall back to constructing a direct view URL from drive_file_id if pdf_url absent.
        pdf_url: str = doc_record.get("pdf_url", "") or ""
        if not pdf_url and drive_file_id:
            pdf_url = (
                f"https://drive.google.com/file/d/{drive_file_id}/view?usp=drivesdk"
            )

        # Page range
        page_start = content.get("start_index") or 1
        page_end = content.get("end_index") or page_start

        sources.append({
            # ── Fields consumed by BISSourceComponent ──────────────────
            "document": filename,                # subtitle / fallback title
            "product": product_name or filename, # primary card title
            "category": category_name,           # blue category badge
            "drive_url": pdf_url,                # ← real Google Drive PDF link
            "drive_file_id": drive_file_id,      # Drive file ID
            "drive_path": drive_path,            # relative path inside Drive
            "page": page_start,                  # shown as "Page X"
            "page_start": page_start,
            "page_end": page_end,
            "section": content.get("node_id", ""),
            "type": "pdf",

            # ── Extra fields ────────────────────────────────────────────
            "document_id": content["document_id"],
            "node_id": content["node_id"],
            "pages": f"{page_start}-{page_end}",
        })

    return sources





# ============================================================
# CONFIGURATION
# ============================================================

MAX_GROQ_INPUT_TOKENS = 6500
CHARS_PER_TOKEN = 4

PRODUCT_BATCH_INPUT_TOKENS = 4500
PRODUCT_BATCH_SIZE = 250
MAX_SELECTED_PRODUCTS = 5

MAX_NODE_LLM_CANDIDATES = 10
NODE_TEXT_PREVIEW_CHARS = 700
NODES_PER_DOCUMENT_GUARANTEE = 2
MIN_FALLBACK_SCORE = 0          # Accept ANY node rather than returning empty
MAX_SELECTED_NODES = 5

FINAL_CONTEXT_MAX_TOKENS = 5200
FINAL_CONTEXT_MAX_CHARS = FINAL_CONTEXT_MAX_TOKENS * CHARS_PER_TOKEN
MAX_FINAL_CHARS_PER_NODE = 3500

NO_ANSWER_MESSAGE = (
    "I could not find enough relevant information in the "
    "provided BIS documents to answer this question."
)


# ============================================================
# HELPERS
# ============================================================

def extract_json(response: str) -> Dict:
    if response is None:
        raise ValueError("LLM returned an empty response.")
    response = str(response).strip()
    response = re.sub(r"```json", "", response, flags=re.IGNORECASE)
    response = re.sub(r"```", "", response)
    start = response.find("{")
    end = response.rfind("}")
    if start == -1 or end == -1:
        raise ValueError(f"Could not find JSON in LLM response:\n{response}")
    try:
        return json.loads(response[start : end + 1])
    except json.JSONDecodeError as error:
        raise ValueError(f"Invalid JSON returned by LLM:\n{response}") from error


def tokenize(text: str):
    return set(re.findall(r"\b[a-zA-Z0-9]+\b", (text or "").lower()))


def normalize_text(text: str) -> str:
    text = text or ""
    text = text.lower()
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def estimate_tokens(text: str) -> int:
    if not text:
        return 0
    return max(1, (len(str(text)) + CHARS_PER_TOKEN - 1) // CHARS_PER_TOKEN)


def truncate_to_token_budget(text: str, max_tokens: int) -> str:
    if not text:
        return ""
    max_chars = max_tokens * CHARS_PER_TOKEN
    if len(text) <= max_chars:
        return text
    return text[:max_chars] + "\n...[truncated]"


def build_query_terms(question: str):
    words = tokenize(question)
    stop_words = {
        "what", "which", "who", "where", "when", "why", "how",
        "give", "tell", "show", "explain", "provide", "list",
        "find", "state", "mention", "describe",
        "about", "the", "for", "are", "is", "of", "a", "an",
        "to", "in", "on", "and", "or", "with", "from", "by",
        "as", "at", "be", "was", "were", "it", "this", "that",
        "can", "does", "do", "include", "including",
        "document", "documents", "please", "need", "needed",
        "requirement", "requirements", "required",
        "minimum", "maximum",
    }
    return {word for word in words if word not in stop_words and len(word) >= 3}


def expand_query_terms(question: str):
    base_terms = build_query_terms(question)
    expanded = set(base_terms)
    synonym_groups = {
        "minimum": {"minimum", "min", "least", "lower", "lowest"},
        "required": {"required", "requirement", "requirements", "specified", "specification", "specifications"},
        "load": {"load", "loading"},
        "capacity": {"capacity", "capacities"},
        "strength": {"strength", "strong", "load"},
        "sheet": {"sheet", "sheets", "sheeting"},
        "safety": {"safety", "safe"},
        "operator": {"operator", "operators"},
        "protection": {"protection", "protective"},
        "guard": {"guard", "guards", "guarding"},
        "test": {"test", "testing", "tested"},
        "performance": {"performance"},
        # Agricultural / tractor terms
        "tractor": {"tractor", "tractors", "agricultural", "farm", "power"},
        "agricultural": {"agricultural", "tractor", "farm", "agri"},
        "cement": {"cement", "concrete", "mortar", "portland", "opc"},
        "portland": {"portland", "cement", "opc", "clinker"},
        "mixer": {"mixer", "grinder", "blender", "kitchen"},
        "sprayer": {"sprayer", "spray", "nozzle", "pesticide"},
        "helmet": {"helmet", "headgear", "protective"},
        "pipe": {"pipe", "pipes", "hdpe", "polyethylene"},
        "brief": {"brief", "overview", "introduction", "about"},
        "certification": {"certification", "certificate", "certified", "crs", "bis"},
    }
    normalized_question = normalize_text(question)
    for variant in ["load-bearing", "load bearing"]:
        if variant in normalized_question:
            expanded.update({"load", "bearing", "loadbearing", "capacity"})
    for variant in ["semi-corrugated", "semi corrugated"]:
        if variant in normalized_question:
            expanded.update({"semicorrugated", "corrugated", "sheet", "sheets"})
    for term in list(base_terms):
        if term in synonym_groups:
            expanded.update(synonym_groups[term])
    return expanded


def no_answer_result(reason: Optional[str] = None) -> Dict:
    if reason:
        logger.info("Vectorless RAG — no answer: %s", reason)
    return {"answer": NO_ANSWER_MESSAGE, "sources": []}


# ============================================================
# STAGE 1 — CATEGORY RETRIEVAL
# ============================================================

def retrieve_categories(question: str) -> List[Dict]:
    logger.info("Vectorless Stage 1 — category retrieval")

    categories = list(
        db.categories.find({}, {"_id": 1, "name": 1, "path": 1})
    )

    if not categories:
        logger.warning("No categories found in MongoDB")
        return []

    category_catalog = "\n".join(
        f"{i}. {c['name']} (ID: {c['_id']})"
        for i, c in enumerate(categories, start=1)
    )

    system_prompt = """
You are a category retrieval system for a BIS document collection.
Identify the category or categories relevant to the user's question.
Only select categories from the supplied list. Never invent category IDs.
If none are relevant, return an empty list.
Return JSON only:
{"category_ids": ["category_id"]}
"""

    user_prompt = f"""
USER QUESTION:
{question}

AVAILABLE CATEGORIES:
{category_catalog}

Select the relevant categories. If none, return {{"category_ids": []}}
Return JSON only.
"""

    try:
        response = ask_llm(system_prompt, user_prompt)
        result = extract_json(response)
    except Exception as exc:
        logger.warning("Category retrieval failed: %s", exc)
        result = {}

    selected_ids = result.get("category_ids", [])
    if not isinstance(selected_ids, list):
        selected_ids = []

    valid_ids = {c["_id"] for c in categories}
    selected_ids = [cid for cid in selected_ids if cid in valid_ids]

    # Keyword fallback if LLM returned no categories
    if not selected_ids:
        q_tokens = tokenize(question)
        stop_words = {
            "and", "for", "the", "in", "of", "to", "what", "give", "tell",
            "requirement", "requirements", "standard", "about", "brief",
        }
        for cat in categories:
            cat_tokens = tokenize(cat.get("name", ""))
            overlap = (q_tokens & cat_tokens) - stop_words
            if overlap:
                logger.info(
                    "Category keyword match: %s (matched: %s)",
                    cat["name"], overlap,
                )
                selected_ids.append(cat["_id"])

    # If still empty, check if question mentions any known products to find category
    if not selected_ids:
        words = [
            w for w in re.findall(r"\b[a-zA-Z]{4,}\b", question.lower())
            if w not in {
                "what", "give", "tell", "standard", "requirement",
                "requirements", "about", "brief",
            }
        ]
        if words:
            pattern = "|".join(re.escape(w) for w in words)
            matched_prod = db.products.find_one(
                {"product_name": {"$regex": pattern, "$options": "i"}}
            )
            if matched_prod and matched_prod.get("category_id"):
                selected_ids.append(matched_prod["category_id"])

    # Final fallback: default to first 3 categories
    if not selected_ids:
        selected = categories[:3]
    else:
        selected = [c for c in categories if c["_id"] in selected_ids]

    logger.info("Selected %d categories", len(selected))
    return selected


# ============================================================
# STAGE 2 — PRODUCT RETRIEVAL
# ============================================================

def retrieve_products(question: str, selected_categories: List[Dict]) -> List[Dict]:
    logger.info("Vectorless Stage 2 — product retrieval")

    if not selected_categories:
        return []

    category_ids = [c["_id"] for c in selected_categories]

    products = list(
        db.products.find(
            {"category_id": {"$in": category_ids}},
            {"_id": 1, "category_id": 1, "category_name": 1, "product_name": 1, "path": 1, "documents": 1},
        )
    )

    if not products:
        return []

    # Batch products for token safety
    batches: List[List[Dict]] = []
    current: List[Dict] = []
    current_tokens = 0
    for product in products:
        line = f"{product['product_name']} (ID: {product['_id']})"
        line_tokens = estimate_tokens(line) + 5
        if current and (len(current) >= PRODUCT_BATCH_SIZE or current_tokens + line_tokens > PRODUCT_BATCH_INPUT_TOKENS):
            batches.append(current)
            current = []
            current_tokens = 0
        current.append(product)
        current_tokens += line_tokens
    if current:
        batches.append(current)

    system_prompt = """
You are a product retrieval system for a BIS vectorless RAG system.
Select every product in THIS BATCH that is genuinely relevant to the question.
Use semantic/technical meaning, not exact word overlap.
Do not invent product IDs. If none are relevant, return an empty list.
Return JSON only:
{"product_ids": ["product_id"], "reasons": [{"product_id": "...", "reason": "..."}]}
"""

    selected_ids: List[str] = []

    for batch_number, batch in enumerate(batches, start=1):
        catalog = "\n".join(
            f"{i}. {p['product_name']} (ID: {p['_id']})"
            for i, p in enumerate(batch, start=1)
        )
        user_prompt = f"""
USER QUESTION:
{question}

PRODUCTS IN THIS BATCH:
{catalog}

Select every relevant product. Return JSON only.
"""
        try:
            response = ask_llm(system_prompt, user_prompt)
            result = extract_json(response)
        except Exception as exc:
            logger.warning("Product batch %d failed: %s", batch_number, exc)
            continue

        batch_ids = result.get("product_ids", [])
        if not isinstance(batch_ids, list):
            batch_ids = []
        valid_ids = {p["_id"] for p in batch}
        for pid in batch_ids:
            if pid in valid_ids and pid not in selected_ids:
                selected_ids.append(pid)

    # Keyword fallback if LLM returned no products
    if not selected_ids:
        q_tokens = tokenize(question)
        stop_words = {
            "and", "for", "the", "in", "of", "to", "what", "give", "tell",
            "requirement", "requirements", "standard", "about", "brief",
        }
        for p in products:
            p_tokens = tokenize(p.get("product_name", ""))
            overlap = (q_tokens & p_tokens) - stop_words
            if overlap:
                logger.info(
                    "Product keyword match: %s (matched: %s)",
                    p["product_name"], overlap,
                )
                selected_ids.append(p["_id"])

    # Final fallback: default to first 3 products
    if not selected_ids:
        selected = products[:3]
    else:
        selected_ids = selected_ids[:MAX_SELECTED_PRODUCTS]
        selected = [p for p in products if p["_id"] in selected_ids]

    logger.info("Selected %d products", len(selected))
    return selected


# ============================================================
# STAGE 3 — DOCUMENT RETRIEVAL (all docs, no LLM filter)
# ============================================================

def retrieve_documents(selected_products: List[Dict]) -> List[Dict]:
    logger.info("Vectorless Stage 3 — document retrieval")

    all_documents = []
    seen = set()

    for product in selected_products:
        for doc in product.get("documents", []):
            doc_id = doc.get("document_id")
            if not doc_id or doc_id in seen:
                continue
            seen.add(doc_id)
            all_documents.append({
                "product_id": product["_id"],
                "product_name": product["product_name"],
                "document_id": doc_id,
                "filename": doc.get("filename", ""),
                "summary": doc.get("summary", ""),
            })

    # Direct query fallback to documents collection if product['documents'] was empty
    if not all_documents and selected_products:
        prod_ids = [p["_id"] for p in selected_products]
        prod_names = [p.get("product_name", "") for p in selected_products]
        docs_cursor = list(db.documents.find({
            "$or": [
                {"product_id": {"$in": prod_ids}},
                {"product_name": {"$in": prod_names}},
            ]
        }))
        for d in docs_cursor:
            doc_id = d.get("_id")
            if not doc_id or doc_id in seen:
                continue
            seen.add(doc_id)
            all_documents.append({
                "product_id": d.get("product_id", ""),
                "product_name": d.get("product_name", ""),
                "document_id": doc_id,
                "filename": d.get("filename", ""),
                "summary": d.get("summary", ""),
            })

    logger.info("%d documents carried forward", len(all_documents))
    return all_documents


# ============================================================
# STAGE 4 — DOCUMENT → PAGEINDEX TREE
# ============================================================

def get_document_trees(selected_documents: List[Dict]) -> List[Dict]:
    logger.info("Vectorless Stage 4 — document tree lookup")

    documents_with_trees = []

    for doc in selected_documents:
        doc_id = doc["document_id"]
        db_doc = db.documents.find_one({"_id": doc_id}, {"_id": 1, "tree_id": 1, "filename": 1})
        if not db_doc:
            continue
        tree_id = db_doc.get("tree_id")
        if not tree_id:
            continue
        documents_with_trees.append({
            "document_id": doc_id,
            "product_id": doc["product_id"],
            "product_name": doc["product_name"],
            "filename": doc["filename"],
            "summary": doc["summary"],
            "tree_id": tree_id,
        })

    logger.info("%d documents with trees", len(documents_with_trees))
    return documents_with_trees


# ============================================================
# STAGE 5 — PAGEINDEX NODE RETRIEVAL
# ============================================================

def retrieve_pageindex_nodes(question: str, selected_documents: List[Dict]) -> List[Dict]:
    logger.info("Vectorless Stage 5 — PageIndex node retrieval")

    all_nodes: List[Dict] = []

    for document in selected_documents:
        tree_doc = db.pageindex_trees.find_one({"_id": document["tree_id"]})
        if not tree_doc:
            continue
        tree = tree_doc.get("tree")
        if not tree:
            continue

        roots = tree if isinstance(tree, list) else [tree]

        def collect_nodes(node: Dict, parent_id=None):
            if not isinstance(node, dict):
                return
            all_nodes.append({
                "document_id": document["document_id"],
                "filename": document["filename"],
                "node_id": node.get("node_id"),
                "title": node.get("title", ""),
                "summary": node.get("summary", ""),
                "start_index": node.get("start_index"),
                "end_index": node.get("end_index"),
                "text": node.get("text", "") or "",
                "parent_id": parent_id,
            })
            for child in node.get("nodes", []) or []:
                collect_nodes(child, parent_id=node.get("node_id"))

        for root in roots:
            collect_nodes(root)

    if not all_nodes:
        return []

    logger.info("Total PageIndex nodes: %d", len(all_nodes))

    query_terms = build_query_terms(question)
    expanded_terms = expand_query_terms(question)
    raw_question = normalize_text(question)

    phrase_patterns = [
        ("load-bearing", 8), ("load bearing", 8), ("loadbearing", 8),
        ("load bearing capacity", 10), ("load-bearing capacity", 10),
        ("minimum load", 7), ("minimum capacity", 7), ("minimum strength", 7),
        ("corrugated", 5), ("semi-corrugated", 7), ("semi corrugated", 7), ("semicorrugated", 7),
    ]
    important_terms = {
        "safety": 5, "safe": 4, "operator": 4, "protection": 4,
        "guard": 4, "guards": 4, "construction": 3, "requirement": 3,
        "requirements": 3, "required": 2, "performance": 3,
        "specification": 3, "specifications": 3, "capacity": 4,
        "strength": 4, "load": 3, "bearing": 3, "sheet": 3,
        "sheets": 3, "corrugated": 5, "semicorrugated": 5,
    }

    ranked_nodes = []
    for node in all_nodes:
        title = normalize_text(node.get("title", ""))
        summary = normalize_text(node.get("summary", ""))
        text = normalize_text(node.get("text", ""))
        searchable = title + " " + summary + " " + text
        score = 0
        matched_terms: set = set()

        for phrase, weight in phrase_patterns:
            if phrase in searchable:
                score += weight

        for term in query_terms:
            if len(term) >= 3 and term in searchable:
                score += 2
                matched_terms.add(term)

        for term in expanded_terms:
            if len(term) >= 3 and term in searchable and term not in matched_terms:
                score += 1
                matched_terms.add(term)

        for term, weight in important_terms.items():
            if term in searchable:
                score += weight

        if raw_question and raw_question in searchable:
            score += 15

        for term in query_terms:
            if len(term) >= 3 and term in title:
                score += 3

        concept_groups = [
            {"load", "bearing", "capacity", "strength"},
            {"sheet", "sheets", "corrugated", "semicorrugated"},
            {"minimum", "least", "required", "requirement"},
        ]
        concept_hits = sum(1 for g in concept_groups if any(t in searchable for t in g))
        score += concept_hits * 3

        ranked_nodes.append((score, len(matched_terms), node))

    ranked_nodes.sort(key=lambda x: (x[0], x[1]), reverse=True)

    best_score = ranked_nodes[0][0] if ranked_nodes else 0
    if best_score < MIN_FALLBACK_SCORE:
        logger.warning("No node with sufficient lexical evidence")
        return []

    # Per-document guarantee
    candidates: List[Any] = []
    candidate_keys: set = set()
    doc_groups: Dict[str, List] = {}
    for item in ranked_nodes:
        node = item[2]
        doc_groups.setdefault(node["document_id"], []).append(item)

    for doc_id, items in doc_groups.items():
        for item in items[:NODES_PER_DOCUMENT_GUARANTEE]:
            node = item[2]
            key = (node["document_id"], node["node_id"])
            if key not in candidate_keys:
                candidates.append(item)
                candidate_keys.add(key)

    for item in ranked_nodes:
        if len(candidates) >= MAX_NODE_LLM_CANDIDATES:
            break
        node = item[2]
        key = (node["document_id"], node["node_id"])
        if key not in candidate_keys:
            candidates.append(item)
            candidate_keys.add(key)

    candidates.sort(key=lambda x: (x[0], x[1]), reverse=True)
    candidate_nodes = [item[2] for item in candidates[:MAX_NODE_LLM_CANDIDATES]]

    # Build catalog for LLM
    catalog = []
    for node in candidate_nodes:
        text = node.get("text", "") or ""
        text_preview = text[:NODE_TEXT_PREVIEW_CHARS]
        if len(text) > NODE_TEXT_PREVIEW_CHARS:
            text_preview += "\n...[truncated]"
        summary = (node.get("summary", "") or "")[:500]
        catalog.append({
            "document_id": node["document_id"],
            "filename": node["filename"],
            "node_id": node["node_id"],
            "title": node["title"],
            "summary": summary,
            "pages": f"{node['start_index']}-{node['end_index']}",
            "text_preview": text_preview,
        })

    catalog_json = json.dumps(catalog, ensure_ascii=False, indent=2)

    if estimate_tokens(catalog_json) > MAX_GROQ_INPUT_TOKENS - 1200:
        safe_catalog = []
        for item in catalog:
            item_copy = dict(item)
            item_copy["text_preview"] = truncate_to_token_budget(item_copy.get("text_preview", ""), 350)
            item_copy["summary"] = truncate_to_token_budget(item_copy.get("summary", ""), 120)
            safe_catalog.append(item_copy)
        catalog_json = json.dumps(safe_catalog, ensure_ascii=False, indent=2)

    system_prompt = """
You are a precise hierarchical document retrieval system for BIS documents.
Select PageIndex nodes whose ACTUAL CONTENT can answer the user's question.
The question wording may differ from the document wording — match meaning, not exact words.
Only select nodes from the supplied list. Never invent IDs.
Return JSON only:
{"node_ids": [{"document_id": "...", "node_id": "...", "reason": "..."}]}
If none, return: {"node_ids": []}
"""

    user_prompt = f"""
USER QUESTION:
{question}

TOP PAGEINDEX NODE CANDIDATES:
{catalog_json}

Select only nodes whose content can answer the question. Return JSON only.
"""

    try:
        response = ask_llm(system_prompt, user_prompt)
        result = extract_json(response)
    except Exception as exc:
        logger.warning("Stage 5 LLM call failed: %s", exc)
        result = {"node_ids": []}

    llm_selected = result.get("node_ids", [])
    if not isinstance(llm_selected, list):
        llm_selected = []

    valid_pairs = {(n["document_id"], n["node_id"]) for n in all_nodes}
    seen_pairs: set = set()
    selected_nodes: List[Dict] = []

    for selected in llm_selected:
        if not isinstance(selected, dict):
            continue
        pair = (selected.get("document_id"), selected.get("node_id"))
        if pair not in valid_pairs or pair in seen_pairs:
            continue
        seen_pairs.add(pair)
        for node in all_nodes:
            if node["document_id"] == pair[0] and node["node_id"] == pair[1]:
                selected_nodes.append(node)
                break
        if len(selected_nodes) >= MAX_SELECTED_NODES:
            break

    # Deterministic fallback
    if not selected_nodes and ranked_nodes:
        best_score_val, _, best_node = ranked_nodes[0]
        selected_nodes.append(best_node)
        logger.info(
            "Using deterministic fallback node: %s (score: %s)",
            best_node.get("node_id"),
            best_score_val,
        )

    logger.info("Selected %d nodes", len(selected_nodes))
    return selected_nodes


# ============================================================
# FIND + COLLECT NODE TEXT
# ============================================================

def find_node(nodes, target_node_id: str):
    if isinstance(nodes, dict):
        nodes = [nodes]
    if not nodes:
        return None
    for node in nodes:
        if node.get("node_id") == target_node_id:
            return node
        found = find_node(node.get("nodes", []), target_node_id)
        if found:
            return found
    return None


def collect_node_text(node: Dict) -> str:
    text = node.get("text", "")
    if text:
        return text
    children = node.get("nodes", [])
    child_text = [collect_node_text(c) for c in children if collect_node_text(c)]
    return "\n\n".join(child_text)


# ============================================================
# STAGE 6 — NODE TEXT RETRIEVAL
# ============================================================

def get_selected_page_content(selected_nodes: List[Dict]) -> List[Dict]:
    logger.info("Vectorless Stage 6 — node text retrieval")

    contents = []

    for selected_node in selected_nodes:
        doc_id = selected_node["document_id"]
        node_id = selected_node["node_id"]

        document = db.documents.find_one({"_id": doc_id})
        if not document:
            continue

        tree_id = document.get("tree_id")
        if not tree_id:
            continue

        tree_doc = db.pageindex_trees.find_one({"_id": tree_id})
        if not tree_doc:
            continue

        tree = tree_doc.get("tree")
        if not tree:
            continue

        node = find_node(tree, node_id)
        if not node:
            continue

        text = collect_node_text(node)
        if not text or not text.strip():
            continue

        contents.append({
            "document_id": doc_id,
            "filename": document["filename"],
            "node_id": node_id,
            "start_index": node.get("start_index"),
            "end_index": node.get("end_index"),
            "text": text,
        })

    logger.info("Retrieved text for %d nodes", len(contents))
    return contents


# ============================================================
# STAGE 7 — FINAL ANSWER GENERATION
# ============================================================

def generate_final_answer(question: str, page_contents: List[Dict]) -> Dict:
    logger.info("Vectorless Stage 7 — final answer generation")

    if not page_contents:
        return no_answer_result("No page content retrieved")

    context_parts = []
    remaining_chars = FINAL_CONTEXT_MAX_CHARS

    for index, content in enumerate(page_contents, start=1):
        if remaining_chars <= 0:
            break
        text = truncate_to_token_budget(
            content.get("text", "") or "",
            MAX_FINAL_CHARS_PER_NODE // CHARS_PER_TOKEN,
        )
        block = f"""
SOURCE {index}

DOCUMENT:
{content['filename']}

DOCUMENT ID:
{content['document_id']}

NODE ID:
{content['node_id']}

PAGE RANGE:
{content['start_index']} - {content['end_index']}

CONTENT:
{text}
"""
        if len(block) > remaining_chars:
            block = block[: max(0, remaining_chars - 200)] + "\n...[context budget reached]"
        context_parts.append(block)
        remaining_chars -= len(block)

    context = "\n\n".join(context_parts)

    system_prompt = """
You are a BIS document question-answering system.
Answer the user's question ONLY using the supplied retrieved document content.
Do NOT use outside knowledge. Do NOT invent facts or numbers.
Cite claims using [Source 1], [Source 2], etc. immediately after the relevant statement.
If the content is insufficient, return exactly: INSUFFICIENT_EVIDENCE
"""

    user_prompt = f"""
USER QUESTION:
{question}

RETRIEVED DOCUMENT CONTENT:
{context}

Answer using ONLY the retrieved content. If insufficient, return: INSUFFICIENT_EVIDENCE
"""

    try:
        answer = ask_llm(system_prompt, user_prompt)
    except Exception as exc:
        logger.exception("Final answer generation failed: %s", exc)
        return no_answer_result("Final answer generation failed")

    answer = str(answer).strip()
    normalized = normalize_text(answer)
    insufficient_markers = {
        "insufficient_evidence", "insufficient evidence",
        "not enough information", "information is not available",
        "not available in the retrieved content",
    }

    if normalized in insufficient_markers or "insufficient_evidence" in normalized:
        return no_answer_result("Insufficient evidence in retrieved content")

    sources = []
    seen: set = set()
    for content in page_contents:
        key = (content["document_id"], content["node_id"])
        if key in seen:
            continue
        seen.add(key)
        sources.append({
            "document_id": content["document_id"],
            "filename": content["filename"],
            "node_id": content["node_id"],
            "start_index": content["start_index"],
            "end_index": content["end_index"],
            "pages": f"{content['start_index']}-{content['end_index']}",
        })

    return {"answer": answer, "sources": sources}


# ============================================================
# PUBLIC ENTRY POINT — called by backend/main.py
# ============================================================

def ask_vectorless_rag(question: str) -> Dict:
    """
    Agentic Vectorless RAG entry point.

    The LLM first decides (via tool-calling) whether the 7-stage MongoDB
    PageIndex pipeline needs to run at all. If yes, the pipeline executes
    and its results are fed back to the LLM for the final answer.
    If no, the LLM answers directly without any DB interaction.

    Always returns a dict with 'answer', 'sources', and 'used_retrieval'.
    Never returns None — the LLM always produces some kind of answer.
    """
    question = question.strip()
    if not question:
        return {"answer": "Please provide a question.", "sources": [], "used_retrieval": False}

    result = run_agentic_vectorless_rag(question)

    # Guarantee the answer is never empty
    if not result.get("answer"):
        result["answer"] = (
            "I could not find relevant information in the BIS documents for your query. "
            "Please try rephrasing or use the Vector RAG mode."
        )

    return result
