import os
import json
import logging
import re
import time
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv
from openai import OpenAI
from sentence_transformers import SentenceTransformer
from qdrant_client import QdrantClient
from qdrant_client.models import Filter, FieldCondition, MatchText, MatchValue


# ============================================================
# 1. ENVIRONMENT
# ============================================================

load_dotenv()

QDRANT_URL = os.getenv("QDRANT_URL")
QDRANT_API_KEY = os.getenv("QDRANT_API_KEY")
GROQ_API_KEY = os.getenv("GROQ_API_KEY")

if not QDRANT_URL:
    raise ValueError("QDRANT_URL is missing in .env")

if not QDRANT_API_KEY:
    raise ValueError("QDRANT_API_KEY is missing in .env")

if not GROQ_API_KEY:
    raise ValueError("GROQ_API_KEY is missing in .env")


# ============================================================
# 2. LOGGING
# ============================================================

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s",
)

logger = logging.getLogger(__name__)


# ============================================================
# 3. CONFIGURATION
# ============================================================

COLLECTION_NAME = "bis_knowledge_base"

# Primary semantic search — retrieve more candidates for re-ranking
TOP_K = 8

# Minimum acceptable similarity score for primary search
MIN_SCORE_THRESHOLD = 0.35

# How many extra chunks to pull per metadata-filtered fallback search
FALLBACK_K = 5

# How many unique chunks to send to the LLM (after deduplication)
MAX_CONTEXT_CHUNKS = 8


# ============================================================
# 4. LOAD BGE-M3
# ============================================================

logger.info("Loading BGE-M3...")

embedding_model = SentenceTransformer("BAAI/bge-m3")

logger.info("BGE-M3 loaded successfully")


# ============================================================
# 5. CONNECT TO QDRANT
# ============================================================

qdrant_client = QdrantClient(
    url=QDRANT_URL,
    api_key=QDRANT_API_KEY,
    timeout=30,
)

logger.info("Connected to Qdrant collection: %s", COLLECTION_NAME)


# ============================================================
# 6. GROQ CLIENT
# ============================================================

groq_client = OpenAI(
    base_url="https://api.groq.com/openai/v1",
    api_key=GROQ_API_KEY,
    timeout=60,
)

logger.info("Groq client initialized")

GROQ_MODEL = os.getenv("GROQ_MODEL", "openai/gpt-oss-120b")

# Retry settings for LLM API calls
LLM_MAX_RETRIES = 3
LLM_RETRY_BASE_DELAY = 1.5  # seconds


def _llm_call(messages: list, tools: Optional[list] = None, temperature: float = 0.1):
    """
    Wrapper around groq_client.chat.completions.create with retry + exponential backoff.
    Raises the last exception if all retries are exhausted.
    """
    kwargs: Dict[str, Any] = {
        "model": GROQ_MODEL,
        "messages": messages,
        "temperature": temperature,
    }
    if tools:
        kwargs["tools"] = tools
        kwargs["tool_choice"] = "auto"

    last_exc: Optional[Exception] = None
    for attempt in range(1, LLM_MAX_RETRIES + 1):
        try:
            return groq_client.chat.completions.create(**kwargs)
        except Exception as exc:
            last_exc = exc
            wait = LLM_RETRY_BASE_DELAY * (2 ** (attempt - 1))
            logger.warning(
                "LLM call failed (attempt %d/%d): %s — retrying in %.1fs",
                attempt,
                LLM_MAX_RETRIES,
                exc,
                wait,
            )
            if attempt < LLM_MAX_RETRIES:
                time.sleep(wait)

    raise last_exc


def _format_direct_answer(question: str, chunks: List[Dict[str, Any]]) -> str:
    """
    When the LLM (Turn 2) is unavailable, format the retrieved chunks into
    a readable answer directly — no LLM needed.
    """
    if not chunks:
        return (
            "I could not find relevant information in the BIS documents for your query. "
            "Please try rephrasing or switch to the Vectorless RAG mode."
        )

    lines = [
        f"Here is the relevant BIS document content retrieved for your query:",
        "",
    ]
    for i, chunk in enumerate(chunks, start=1):
        payload = chunk["payload"]
        product = payload.get("product", "")
        source = payload.get("source", "")
        page = payload.get("page", "")
        section = payload.get("section", "")
        text = chunk["text"]

        header = f"[Source {i}]"
        if product:
            header += f" {product}"
        if source:
            header += f" — {source}"
        if page:
            header += f" (page {page})"
        if section and section.lower() not in ("general", "unknown", ""):
            header += f", {section}"

        lines.append(header)
        lines.append(text[:1200])  # cap to avoid huge responses
        lines.append("")

    lines.append(
        "*Note: This answer was formatted directly from retrieved document "
        "chunks because the AI summariser was temporarily unavailable.*"
    )
    return "\n".join(lines)


# ============================================================
# 7. TOOL DEFINITION
# ============================================================

SEARCH_TOOL = {
    "type": "function",
    "function": {
        "name": "search_documents",
        "description": (
            "Search the BIS knowledge base for relevant document chunks. "
            "Each chunk has metadata: category, product, source (PDF filename), "
            "section, page, drive_url. "
            "Call this ONLY when the user's question requires specific BIS "
            "standard information, technical requirements, test procedures, "
            "tables, specifications, certification details, or any factual "
            "information that must come from the BIS document database. "
            "Do NOT call this for greetings, general chit-chat, or questions "
            "you can answer from your own general knowledge."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": (
                        "The optimised search query. Include the product name "
                        "and category if mentioned in the user question. "
                        "Example: 'Agricultural Tractors safety requirements BIS standard'"
                    ),
                },
                "product_hint": {
                    "type": "string",
                    "description": (
                        "Optional: the specific BIS product name from the user's question. "
                        "Used to filter results by the 'product' metadata field. "
                        "Leave empty if no specific product is mentioned."
                    ),
                },
                "category_hint": {
                    "type": "string",
                    "description": (
                        "Optional: the BIS category from the user's question. "
                        "Used to filter results by the 'category' metadata field. "
                        "Leave empty if no specific category is mentioned."
                    ),
                },
            },
            "required": ["query"],
        },
    },
}


# ============================================================
# 8. HELPER — embed text
# ============================================================

def _embed(text: str) -> List[float]:
    return embedding_model.encode(text, normalize_embeddings=True).tolist()


# ============================================================
# 9. RETRIEVE CHUNKS — multi-strategy
# ============================================================

def retrieve_chunks(
    query: str,
    product_hint: Optional[str] = None,
    category_hint: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """
    Three-strategy retrieval to maximise recall when query words don't
    appear verbatim in the chunk text:

    Strategy A — Broad semantic search (enhanced query including product/category hints)
    Strategy B — Payload-filtered search restricted to the matching product
    Strategy C — Payload-filtered search restricted to the matching category

    Results are merged, deduplicated, and sorted by score descending.
    """

    seen_ids: set = set()
    all_chunks: List[Dict[str, Any]] = []

    # ── Strategy A: enhanced semantic query ───────────────────
    # Prefix with product/category so the embedding is biased toward those docs
    enhanced_query = query
    if product_hint:
        enhanced_query = f"{product_hint} — {query}"
    elif category_hint:
        enhanced_query = f"{category_hint} — {query}"

    query_vector = _embed(enhanced_query)

    try:
        results_a = qdrant_client.query_points(
            collection_name=COLLECTION_NAME,
            query=query_vector,
            limit=TOP_K,
            with_payload=True,
        ).points
        logger.info(
            "Strategy A: retrieved %d results (enhanced query: %r)",
            len(results_a),
            enhanced_query[:80],
        )
    except Exception as exc:
        logger.exception("Strategy A Qdrant search failed: %s", exc)
        results_a = []

    for r in results_a:
        payload = r.payload or {}
        text = (payload.get("text") or "").strip()
        if not text or r.id in seen_ids:
            continue
        seen_ids.add(r.id)
        all_chunks.append({"text": text, "payload": payload, "score": float(r.score)})

    # ── Strategy B: product-filtered vector search ────────────
    if product_hint and product_hint.strip():
        try:
            # Case-insensitive keyword match on the "product" payload field
            product_filter = Filter(
                must=[
                    FieldCondition(
                        key="product",
                        match=MatchText(text=product_hint.strip()),
                    )
                ]
            )
            results_b = qdrant_client.query_points(
                collection_name=COLLECTION_NAME,
                query=_embed(query),
                query_filter=product_filter,
                limit=FALLBACK_K,
                with_payload=True,
            ).points
            logger.info(
                "Strategy B: retrieved %d results (product filter: %r)",
                len(results_b),
                product_hint,
            )
        except Exception as exc:
            logger.warning("Strategy B (product filter) failed: %s", exc)
            results_b = []

        for r in results_b:
            payload = r.payload or {}
            text = (payload.get("text") or "").strip()
            if not text or r.id in seen_ids:
                continue
            seen_ids.add(r.id)
            all_chunks.append({"text": text, "payload": payload, "score": float(r.score)})

    # ── Strategy C: category-filtered vector search ───────────
    if category_hint and category_hint.strip():
        try:
            category_filter = Filter(
                must=[
                    FieldCondition(
                        key="category",
                        match=MatchText(text=category_hint.strip()),
                    )
                ]
            )
            results_c = qdrant_client.query_points(
                collection_name=COLLECTION_NAME,
                query=_embed(query),
                query_filter=category_filter,
                limit=FALLBACK_K,
                with_payload=True,
            ).points
            logger.info(
                "Strategy C: retrieved %d results (category filter: %r)",
                len(results_c),
                category_hint,
            )
        except Exception as exc:
            logger.warning("Strategy C (category filter) failed: %s", exc)
            results_c = []

        for r in results_c:
            payload = r.payload or {}
            text = (payload.get("text") or "").strip()
            if not text or r.id in seen_ids:
                continue
            seen_ids.add(r.id)
            all_chunks.append({"text": text, "payload": payload, "score": float(r.score)})

    # Sort combined results by score descending and cap
    all_chunks.sort(key=lambda c: c["score"], reverse=True)
    final = all_chunks[:MAX_CONTEXT_CHUNKS]

    logger.info(
        "retrieve_chunks: %d unique chunks after merge (A+B+C)",
        len(final),
    )
    return final


# ============================================================
# 10. BUILD CONTEXT STRING FROM CHUNKS
# ============================================================

def build_context(chunks: List[Dict[str, Any]]) -> str:
    """Format retrieved chunks into a readable context block for the LLM."""

    context_parts = []

    for index, chunk in enumerate(chunks, start=1):
        payload = chunk["payload"]

        document = payload.get("source", "Unknown")
        product = payload.get("product", "")
        category = payload.get("category", "")
        page = payload.get("page", "Unknown")
        section = payload.get("section", "Unknown")
        chunk_type = payload.get("type", "Unknown")
        score = chunk.get("score", 0)

        meta_lines = []
        if product:
            meta_lines.append(f"Product: {product}")
        if category:
            meta_lines.append(f"Category: {category}")
        meta = ("\n" + "\n".join(meta_lines)) if meta_lines else ""

        context_parts.append(
            f"""SOURCE {index}

Document: {document}{meta}
Page: {page}
Section: {section}
Type: {chunk_type}
Relevance score: {score:.3f}

Content:
{chunk["text"]}""".strip()
        )

    return "\n\n".join(context_parts)


# ============================================================
# 11. SYSTEM PROMPT
# ============================================================

SYSTEM_PROMPT = """\
You are a high-precision BIS (Bureau of Indian Standards) document assistant.

You have access to a tool called `search_documents` that searches a database
of BIS technical documents. Each document chunk carries metadata:
  - category   : broad BIS product category (e.g. "Agricultural equipment")
  - product    : specific product (e.g. "Agricultural Tractors")
  - source     : PDF filename (e.g. "IS 5029.pdf")
  - section    : document section (e.g. "Clause 4.3", "General")
  - page       : page number
  - drive_url  : direct Google Drive link to the PDF

DECISION RULES — when to call the tool:
- Call `search_documents` when the user asks about BIS standards, technical
  requirements, specifications, test methods, tables, certification details,
  product requirements, clause references, or any specific factual information
  that needs to come from the BIS document database.
- When the user mentions a product name (e.g. "agricultural tractor",
  "mixer grinder", "foot sprayer"), set product_hint to match the product
  and category_hint to match the category — this dramatically improves recall.
- Do NOT call `search_documents` for greetings, thanks, general conversation,
  or questions you can answer from general common knowledge.
- If you are unsure whether the database has relevant information, call the
  tool — it is better to search and find nothing than to guess.

ANSWERING RULES (after you have retrieved documents, if needed):
- Answer ONLY from the retrieved document evidence.
- Do not use outside knowledge or invent information.
- Preserve technical terms, standard numbers, section numbers, table
  references, units, and numerical values exactly as found in the evidence.
- If the evidence does not contain the answer, say so clearly and suggest
  the user try rephrasing or use the Vectorless RAG mode.
- Do not mention the database, embeddings, vector search, or internal tools.
"""


# ============================================================
# 12. AGENTIC RAG — TOOL-CALLING LOOP
# ============================================================

def run_agentic_rag(question: str) -> Dict[str, Any]:
    """
    Agentic RAG loop with retry + graceful fallback:
      Turn 1 — LLM decides whether/how to search (retried up to LLM_MAX_RETRIES times).
               If Turn 1 fails entirely, we assume retrieval is needed and
               fall back to direct retrieval without LLM.
      Turn 2 — LLM generates final answer from evidence (retried).
               If Turn 2 fails, raw retrieved chunks are formatted directly
               as the answer — no LLM dependency needed.
    """

    messages: list = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": question},
    ]

    retrieved_chunks: List[Dict[str, Any]] = []

    # ── TURN 1 ────────────────────────────────────────────────
    logger.info("Agentic RAG — turn 1 (with retry)")

    turn1_failed = False
    assistant_message = None
    tool_calls = None

    try:
        response = _llm_call(messages, tools=[SEARCH_TOOL])
        assistant_message = response.choices[0].message
        tool_calls = assistant_message.tool_calls
    except Exception as exc:
        logger.error("Turn 1 failed after all retries: %s", exc)
        turn1_failed = True

    # ── FALLBACK: Turn 1 failed — run retrieval directly ──────
    if turn1_failed:
        logger.info("Turn 1 fallback — running direct retrieval for: %r", question)
        chunks = retrieve_chunks(query=question)
        return {
            "answer": _format_direct_answer(question, chunks),
            "sources": build_sources(chunks),
            "used_retrieval": True,
        }

    # ── TOOL EXECUTION ────────────────────────────────────────
    if tool_calls:
        logger.info("LLM requested %d tool call(s)", len(tool_calls))
        messages.append(assistant_message)

        for tool_call in tool_calls:
            if tool_call.function.name != "search_documents":
                logger.warning("Unknown tool: %s — skipping", tool_call.function.name)
                continue

            try:
                args = json.loads(tool_call.function.arguments)
                search_query = args.get("query", question)
                product_hint = args.get("product_hint", "") or ""
                category_hint = args.get("category_hint", "") or ""
            except (json.JSONDecodeError, KeyError):
                search_query = question
                product_hint = ""
                category_hint = ""

            logger.info(
                "search_documents: query=%r  product=%r  category=%r",
                search_query, product_hint, category_hint,
            )

            chunks = retrieve_chunks(
                query=search_query,
                product_hint=product_hint or None,
                category_hint=category_hint or None,
            )
            retrieved_chunks.extend(chunks)

            if chunks:
                context_text = build_context(chunks)
                tool_result = (
                    f"Retrieved {len(chunks)} relevant BIS document chunk(s):\n\n"
                    f"{context_text}"
                )
            else:
                tool_result = (
                    "No relevant documents were found in the BIS knowledge base "
                    "for this query."
                )
                logger.info("No chunks retrieved from Qdrant")

            messages.append({
                "role": "tool",
                "tool_call_id": tool_call.id,
                "content": tool_result,
            })

        # ── TURN 2: final answer (with retry + direct fallback) ──
        logger.info("Agentic RAG — turn 2 (with retry)")
        try:
            final_response = _llm_call(messages)
            answer = (final_response.choices[0].message.content or "").strip()
        except Exception as exc:
            logger.error("Turn 2 failed after all retries: %s — using direct format", exc)
            # Return the raw retrieved chunks formatted as readable text
            answer = _format_direct_answer(question, retrieved_chunks)

    else:
        # Direct answer — no retrieval needed
        logger.info("LLM answered directly (no retrieval needed)")
        answer = (assistant_message.content or "").strip()

    if not answer:
        answer = (
            "I could not find relevant information in the BIS documents. "
            "Please try rephrasing or switch to the Vectorless RAG mode."
        )

    return {
        "answer": answer,
        "sources": build_sources(retrieved_chunks),
        "used_retrieval": bool(tool_calls),
    }



# ============================================================
# 13. BUILD SOURCES
# ============================================================

def build_sources(chunks: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    seen: set = set()
    sources = []

    for chunk in chunks:
        payload = chunk["payload"]
        key = (payload.get("source"), payload.get("page"))
        if key in seen:
            continue
        seen.add(key)

        sources.append({
            "document": payload.get("source"),
            "product": payload.get("product"),
            "category": payload.get("category"),
            "drive_url": payload.get("drive_url"),
            "drive_path": payload.get("drive_path"),
            "drive_file_id": payload.get("drive_file_id"),
            "page": payload.get("page"),
            "page_start": payload.get("page_start"),
            "page_end": payload.get("page_end"),
            "section": payload.get("section"),
            "type": payload.get("type"),
            "table_number": payload.get("table_number"),
            "table_title": payload.get("table_title"),
            "collection": COLLECTION_NAME,
            "score": chunk["score"],
        })

    return sources


# ============================================================
# 14. PUBLIC ENTRY POINT
# ============================================================

def ask_rag(question: str) -> Dict[str, Any]:
    """
    Always returns a dict with answer, sources, used_retrieval.
    Never returns None — the LLM always produces some kind of response.
    """
    question = question.strip()

    if not question:
        return {
            "answer": "Please provide a question.",
            "sources": [],
            "used_retrieval": False,
        }

    result = run_agentic_rag(question)

    if not result.get("answer"):
        result["answer"] = (
            "I could not find relevant information in the BIS documents for your query. "
            "Please try rephrasing or use the Vectorless RAG mode."
        )

    return result


# ============================================================
# 15. LOCAL TEST
# ============================================================

if __name__ == "__main__":

    while True:
        question = input("\nQuestion (type 'exit' to stop): ").strip()

        if question.lower() == "exit":
            break

        result = ask_rag(question)

        print("\n" + "=" * 80)
        print("ANSWER")
        print("=" * 80)
        print(result["answer"])

        print(f"\nRETRIEVAL USED: {result.get('used_retrieval', False)}")
        if result.get("sources"):
            print("\nSOURCES")
            print("=" * 80)
            for source in result["sources"]:
                print(source)