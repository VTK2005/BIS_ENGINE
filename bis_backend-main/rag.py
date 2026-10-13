import os
import json
import logging
import re
import time
from typing import Any, Dict, List, Optional, Tuple, Generator

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
# 3. CONFIGURATION & DOMAIN KNOWLEDGE BASE
# ============================================================

COLLECTION_NAME = "bis_knowledge_base"

TOP_K = 10
FALLBACK_K = 8
MAX_CONTEXT_CHUNKS = 8
RRF_K_CONSTANT = 60

# Comprehensive Domain Product Aliases, Synonyms & Standards
PRODUCT_ALIASES: Dict[str, Dict[str, Any]] = {
    "agricultural tractors": {
        "canonical": "Agricultural Tractors",
        "category": "Agricultural equipment",
        "aliases": [
            "tractor", "tractors", "agricultural tractor", "power tiller",
            "farm tractor", "combine", "harvester", "2844(e)", "is 5029", "is 12207"
        ],
        "standards": ["IS 5029", "2844(E)", "IS 12207"],
        "keywords": [
            "drawbar", "power take-off", "pto", "rollover", "rops", "brake",
            "steering", "engine power", "operator safety", "hydraulic lift"
        ],
    },
    "ordinary portland cement": {
        "canonical": "Ordinary Portland Cement",
        "category": "Construction materials for buildings",
        "aliases": [
            "portland cement", "opc", "opc 43", "opc 53", "opc 33", "opc 43s", "opc 53s",
            "cement", "clinker", "is 269", "white cement", "is 8042"
        ],
        "standards": ["IS 269", "IS 8042"],
        "keywords": [
            "compressive strength", "soundness", "setting time", "fineness", "clinker",
            "gypsum", "insoluble residue", "loss on ignition", "hydraulic cement"
        ],
    },
    "mixer grinder and food processor": {
        "canonical": "Mixer grinder and food processor",
        "category": "kitchenware and utensils",
        "aliases": [
            "mixer grinder", "mixer", "grinder", "food processor",
            "blender", "kitchen appliance", "juicer", "is 4250"
        ],
        "standards": ["IS 4250"],
        "keywords": [
            "motor rating", "insulation resistance", "blade assembly", "jar locking",
            "wattage", "rpm", "temperature rise", "safety interlock", "earthing"
        ],
    },
    "foot sprayers": {
        "canonical": "Foot sprayers",
        "category": "Agricultural equipment",
        "aliases": [
            "foot sprayer", "sprayer", "knapsack sprayer", "plant protection equipment",
            "pesticide sprayer", "is 3652"
        ],
        "standards": ["IS 3652"],
        "keywords": [
            "plunger", "pressure chamber", "nozzle", "spray lance", "discharge rate",
            "hydraulic test", "strainer", "chemical resistance", "hose assembly"
        ],
    },
    "high density polyethylene pipes": {
        "canonical": "High density polyethylene pipes",
        "category": "Pipes and fittings",
        "aliases": [
            "hdpe", "hdpe pipes", "polyethylene pipes", "pe pipes",
            "plastic pipes", "is 4984"
        ],
        "standards": ["IS 4984"],
        "keywords": [
            "hydrostatic strength", "melt flow rate", "density", "outer diameter",
            "wall thickness", "pressure rating", "carbon black content", "elongation"
        ],
    },
    "protective helmets": {
        "canonical": "Protective helmets",
        "category": "Personal protective equipment",
        "aliases": [
            "helmet", "helmets", "two wheeler helmet", "motorcycle helmet", "is 4151"
        ],
        "standards": ["IS 4151"],
        "keywords": [
            "impact absorption", "retention system", "chin strap", "visor",
            "peripheral vision", "penetration resistance", "protective padding"
        ],
    },
}


# ============================================================
# 4. LOAD BGE-M3
# ============================================================

logger.info("Loading BGE-M3 embedding model...")
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

GROQ_MODEL = os.getenv("GROQ_MODEL", "openai/gpt-oss-120b")
LLM_MAX_RETRIES = 3
LLM_RETRY_BASE_DELAY = 1.5  # seconds


def _llm_call(
    messages: list,
    tools: Optional[list] = None,
    temperature: float = 0.1,
    stream: bool = False,
    tool_choice: Optional[str] = None,
):
    """
    Wrapper around groq_client.chat.completions.create with retry + exponential backoff.
    Parses rate-limit retry suggestions when available.
    """
    kwargs: Dict[str, Any] = {
        "model": GROQ_MODEL,
        "messages": messages,
        "temperature": temperature,
        "stream": stream,
    }
    if tools:
        kwargs["tools"] = tools
        kwargs["tool_choice"] = tool_choice if tool_choice else "auto"

    last_exc: Optional[Exception] = None
    for attempt in range(1, LLM_MAX_RETRIES + 1):
        try:
            return groq_client.chat.completions.create(**kwargs)
        except Exception as exc:
            last_exc = exc
            exc_str = str(exc)

            retry_match = re.search(r"try again in ([\d\.]+)\s*s", exc_str, re.IGNORECASE)
            if retry_match:
                wait = float(retry_match.group(1)) + 0.5
            else:
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


# ============================================================
# 7. DOMAIN EXTRACTION & REWRITING HELPERS
# ============================================================

def extract_is_standards(text: str) -> List[str]:
    """Extract standard numbers like 'IS 5029', 'IS 269:2015', '2844(E)'."""
    patterns = [
        r"\bIS\s*\d+(?:\s*:\s*\d+)?\b",
        r"\b\d{3,5}\([A-Z]\)\b",
    ]
    found = []
    for pat in patterns:
        for match in re.finditer(pat, text, re.IGNORECASE):
            cleaned = match.group(0).strip().upper()
            if cleaned not in found:
                found.append(cleaned)
    return found


def resolve_product_info(query: str, hint: Optional[str] = None) -> Dict[str, Any]:
    """
    Resolve product metadata, canonical names, aliases, and associated standards
    from user query and hints.
    """
    normalized_q = query.lower()
    hint_norm = (hint or "").lower().strip()

    for key, data in PRODUCT_ALIASES.items():
        if hint_norm and (hint_norm in key or key in hint_norm):
            return data
        for alias in data["aliases"]:
            if alias in normalized_q or (hint_norm and alias in hint_norm):
                return data

    return {
        "canonical": hint.strip() if hint else "",
        "category": "",
        "aliases": [hint.strip()] if hint else [],
        "standards": extract_is_standards(query),
        "keywords": [],
    }


def _embed(text: str) -> List[float]:
    return embedding_model.encode(text, normalize_embeddings=True).tolist()


# ============================================================
# 8. HYBRID RETRIEVAL WITH RECIPROCAL RANK FUSION (RRF)
# ============================================================

def _compute_lexical_score(text: str, keywords: List[str], standards: List[str]) -> float:
    """
    Compute a lexical score based on exact keywords and IS numbers.
    """
    text_lower = text.lower()
    score = 0.0

    # Highest weight for exact IS standard numbers
    for std in standards:
        std_clean = std.lower().replace(" ", "")
        if std.lower() in text_lower or std_clean in text_lower.replace(" ", ""):
            score += 5.0

    # Weights for domain keywords
    for kw in keywords:
        kw_lower = kw.lower()
        if len(kw_lower) >= 3 and kw_lower in text_lower:
            count = text_lower.count(kw_lower)
            score += min(count * 1.5, 4.5)

    return score


def retrieve_chunks(
    query: str,
    product_hint: Optional[str] = None,
    category_hint: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """
    Intelligent Hybrid RAG Retrieval Pipeline:
      1. Semantic Vector Search (BGE-M3 + Qdrant)
      2. Keyword / Full-Text matching for IS numbers and technical terms
      3. Associated Product Documents search (searches amendments, manuals, and standards)
      4. Category & Related metadata filtering
      5. Reciprocal Rank Fusion (RRF) to combine multi-channel search results
      6. Fallback sequence when initial evidence is sparse
    """
    product_info = resolve_product_info(query, product_hint)
    canonical_product = product_info.get("canonical") or (product_hint or "").strip()
    category = product_info.get("category") or (category_hint or "").strip()
    standards = product_info.get("standards", []) or extract_is_standards(query)
    product_keywords = product_info.get("keywords", [])

    # Rankings mapping point_id -> rank in channel
    ranks_dense: Dict[Any, int] = {}
    ranks_keyword: Dict[Any, int] = {}
    ranks_product: Dict[Any, int] = {}
    ranks_category: Dict[Any, int] = {}
    points_map: Dict[Any, Dict[str, Any]] = {}

    # ──────────────────────────────────────────────────────────
    # CHANNEL 1: Semantic Vector Search (Enhanced Query)
    # ──────────────────────────────────────────────────────────
    prefix_parts = []
    if canonical_product:
        prefix_parts.append(canonical_product)
    if standards:
        prefix_parts.extend(standards)
    prefix_str = " | ".join(prefix_parts)

    enhanced_query = f"{prefix_str} — {query}" if prefix_str else query
    query_vector = _embed(enhanced_query)

    try:
        results_dense = qdrant_client.query_points(
            collection_name=COLLECTION_NAME,
            query=query_vector,
            limit=TOP_K,
            with_payload=True,
        ).points
        for rank, pt in enumerate(results_dense, start=1):
            ranks_dense[pt.id] = rank
            if pt.id not in points_map:
                payload = pt.payload or {}
                points_map[pt.id] = {
                    "id": pt.id,
                    "text": (payload.get("text") or "").strip(),
                    "payload": payload,
                    "score": float(pt.score),
                }
    except Exception as exc:
        logger.warning("Channel 1 (Dense Search) failed: %s", exc)

    # ──────────────────────────────────────────────────────────
    # CHANNEL 2: Keyword / IS Standard Full-Text Search
    # ──────────────────────────────────────────────────────────
    keyword_candidates: List[Any] = []
    if standards:
        for std in standards:
            try:
                std_filter = Filter(
                    should=[
                        FieldCondition(key="text", match=MatchText(text=std)),
                        FieldCondition(key="source", match=MatchText(text=std)),
                    ]
                )
                res_std = qdrant_client.query_points(
                    collection_name=COLLECTION_NAME,
                    query=query_vector,
                    query_filter=std_filter,
                    limit=FALLBACK_K,
                    with_payload=True,
                ).points
                keyword_candidates.extend(res_std)
            except Exception as exc:
                logger.warning("IS Standard search failed for %s: %s", std, exc)

    # Rank keyword candidates by lexical relevance
    scored_keywords = []
    for pt in keyword_candidates:
        payload = pt.payload or {}
        text = (payload.get("text") or "").strip()
        lex_score = _compute_lexical_score(text, product_keywords, standards)
        scored_keywords.append((lex_score, pt))

    scored_keywords.sort(key=lambda x: x[0], reverse=True)
    for rank, (_, pt) in enumerate(scored_keywords, start=1):
        ranks_keyword[pt.id] = rank
        if pt.id not in points_map:
            payload = pt.payload or {}
            points_map[pt.id] = {
                "id": pt.id,
                "text": (payload.get("text") or "").strip(),
                "payload": payload,
                "score": float(pt.score),
            }

    # ──────────────────────────────────────────────────────────
    # CHANNEL 3: Product-Associated Documents Search
    # Searches amendments, guidelines, and manuals belonging to same product
    # ──────────────────────────────────────────────────────────
    if canonical_product:
        try:
            prod_filter = Filter(
                must=[
                    FieldCondition(
                        key="product",
                        match=MatchText(text=canonical_product),
                    )
                ]
            )
            res_prod = qdrant_client.query_points(
                collection_name=COLLECTION_NAME,
                query=_embed(query),
                query_filter=prod_filter,
                limit=FALLBACK_K,
                with_payload=True,
            ).points
            for rank, pt in enumerate(res_prod, start=1):
                ranks_product[pt.id] = rank
                if pt.id not in points_map:
                    payload = pt.payload or {}
                    points_map[pt.id] = {
                        "id": pt.id,
                        "text": (payload.get("text") or "").strip(),
                        "payload": payload,
                        "score": float(pt.score),
                    }
        except Exception as exc:
            logger.warning("Channel 3 (Product Search) failed: %s", exc)

    # ──────────────────────────────────────────────────────────
    # CHANNEL 4: Category Search (Broad Context Fallback)
    # ──────────────────────────────────────────────────────────
    if category:
        try:
            cat_filter = Filter(
                must=[
                    FieldCondition(
                        key="category",
                        match=MatchText(text=category),
                    )
                ]
            )
            res_cat = qdrant_client.query_points(
                collection_name=COLLECTION_NAME,
                query=_embed(query),
                query_filter=cat_filter,
                limit=FALLBACK_K,
                with_payload=True,
            ).points
            for rank, pt in enumerate(res_cat, start=1):
                ranks_category[pt.id] = rank
                if pt.id not in points_map:
                    payload = pt.payload or {}
                    points_map[pt.id] = {
                        "id": pt.id,
                        "text": (payload.get("text") or "").strip(),
                        "payload": payload,
                        "score": float(pt.score),
                    }
        except Exception as exc:
            logger.warning("Channel 4 (Category Search) failed: %s", exc)

    # ──────────────────────────────────────────────────────────
    # RECIPROCAL RANK FUSION (RRF) COMBINATION
    # ──────────────────────────────────────────────────────────
    fused_scores: Dict[Any, float] = {}
    weights = {
        "dense": 1.0,
        "keyword": 1.2,
        "product": 1.1,
        "category": 0.7,
    }

    all_ids = set(points_map.keys())

    for pid in all_ids:
        score = 0.0
        if pid in ranks_dense:
            score += weights["dense"] / (RRF_K_CONSTANT + ranks_dense[pid])
        if pid in ranks_keyword:
            score += weights["keyword"] / (RRF_K_CONSTANT + ranks_keyword[pid])
        if pid in ranks_product:
            score += weights["product"] / (RRF_K_CONSTANT + ranks_product[pid])
        if pid in ranks_category:
            score += weights["category"] / (RRF_K_CONSTANT + ranks_category[pid])
        fused_scores[pid] = score

    # Sort chunks by RRF score descending
    sorted_ids = sorted(all_ids, key=lambda x: fused_scores[x], reverse=True)

    final_chunks: List[Dict[str, Any]] = []
    for pid in sorted_ids:
        chunk = points_map[pid]
        if not chunk["text"]:
            continue
        chunk["rrf_score"] = fused_scores[pid]
        final_chunks.append(chunk)
        if len(final_chunks) >= MAX_CONTEXT_CHUNKS:
            break

    logger.info(
        "retrieve_chunks: %d chunks fused via RRF (dense=%d, keyword=%d, product=%d, cat=%d)",
        len(final_chunks),
        len(ranks_dense),
        len(ranks_keyword),
        len(ranks_product),
        len(ranks_category),
    )
    return final_chunks


# ============================================================
# 9. CONTEXT BUILDER
# ============================================================

def build_context(chunks: List[Dict[str, Any]]) -> str:
    """Format retrieved chunks into a readable context block for the LLM."""
    context_parts = []

    for index, chunk in enumerate(chunks, start=1):
        payload = chunk["payload"]

        document = payload.get("source", "Unknown Document")
        product = payload.get("product", "")
        category = payload.get("category", "")
        page = payload.get("page", "Unknown")
        section = payload.get("section", "General")
        chunk_type = payload.get("type", "text")
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
# 10. TOOL DEFINITION
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
                        "The optimised search query. Include product aliases, "
                        "IS standard numbers, and technical terms. "
                        "Example: 'Agricultural Tractors safety requirements IS 5029'"
                    ),
                },
                "product_hint": {
                    "type": "string",
                    "description": (
                        "Optional: the specific BIS product name from the question. "
                        "Used for product-targeted retrieval and amendments search."
                    ),
                },
                "category_hint": {
                    "type": "string",
                    "description": (
                        "Optional: the BIS category from the question."
                    ),
                },
            },
            "required": ["query"],
        },
    },
}

SYSTEM_PROMPT = """\
You are a senior, high-precision Bureau of Indian Standards (BIS) technical assistant.

You have access to a tool called `search_documents` that retrieves official BIS standards,
amendments, product manuals, guidelines, and specifications from the database.

IMPORTANT — TOOL USAGE RULES:
1. You MUST call `search_documents` for ANY question that is about BIS standards, Indian
   Standards, product requirements, technical specifications, certifications, test methods,
   compressive strength, safety requirements, or any factual/technical information.
2. You MUST call `search_documents` even if the question is phrased broadly (e.g.,
   "requirements of agricultural tractor", "brief about portland cement",
   "what is CRS certification").
3. Do NOT answer BIS/technical questions from memory or pretrained knowledge.
4. Only skip the tool for pure greetings ("hello", "thanks") or entirely non-BIS questions.

GROUNDING & HALLUCINATION RULES:
1. Ground all answers STRICTLY in the retrieved document evidence.
2. NEVER fabricate or guess standard numbers (IS numbers), dates, clause numbers,
   amendment years, numerical values, tolerances, or test parameters.
3. If an exact specification is not present in the main standard document, examine
   associated amendments, guidelines, and related documents belonging to that product.
4. If a fact cannot be verified from the retrieved documents, clearly state:
   "This information could not be verified from the available BIS documents."
5. If information comes from a related standard or amendment rather than the primary
   standard, explicitly identify that source document.
6. Conversation history is useful for understanding user intent and resolving pronouns
   (e.g., "what about that standard?"), but prior assistant statements DO NOT count
   as verified evidence — only the retrieved document chunks provide official facts.
7. Cite sources as [Source 1], [Source 2], etc. matching the provided evidence headers.
"""


# ============================================================
# 11. ANSWER VALIDATION LAYER
# ============================================================

VALIDATION_PROMPT = """\
You are a strict technical accuracy validator for Bureau of Indian Standards (BIS) answers.

Your task is to inspect the draft answer against the retrieved document evidence and ensure:
1. Every standard number (e.g. IS 269, IS 5029), clause, table reference, number, limit,
   and date in the draft answer is fully supported by the retrieved evidence.
2. The answer does NOT falsely conflate or confuse different products or standards.
3. Any claim not directly supported by the evidence is either removed or explicitly
   flagged as: "Note: This detail could not be verified from the available BIS documents."
4. If the retrieved evidence is completely insufficient, output:
   "I could not find sufficient verified evidence in the available BIS documents to confirm this."

Return the refined, grounded answer directly (no preamble).
"""

def validate_and_refine_answer(
    question: str,
    draft_answer: str,
    chunks: List[Dict[str, Any]],
    conversation_context: Optional[str] = None,
) -> str:
    """
    Validation layer: Evaluates draft answer against retrieved evidence.
    Removes unsupported claims and prevents hallucinations.
    """
    if not chunks:
        return draft_answer

    context_text = build_context(chunks)

    validation_messages = [
        {"role": "system", "content": VALIDATION_PROMPT},
        {
            "role": "user",
            "content": f"""USER QUESTION:
{question}

RETRIEVED BIS EVIDENCE:
{context_text}

DRAFT ANSWER:
{draft_answer}

Refine the draft answer to ensure 100% factual fidelity to the retrieved evidence.
If unsupported claims exist, remove them or state that they could not be verified.
""",
        },
    ]

    try:
        response = _llm_call(validation_messages, temperature=0.0)
        refined = (response.choices[0].message.content or "").strip()
        if refined:
            return refined
    except Exception as exc:
        logger.warning("Answer validation call failed: %s — using draft answer", exc)

    return draft_answer


# ============================================================
# 12. AGENTIC RAG — EXECUTION & STREAMING
# ============================================================

def _format_direct_answer(question: str, chunks: List[Dict[str, Any]]) -> str:
    """Fallback formatting when LLM summarization is temporarily unavailable."""
    if not chunks:
        return (
            "I could not find relevant information in the BIS documents for your query. "
            "Please try rephrasing or verify that the standard has been uploaded."
        )

    lines = [
        "Here is the relevant BIS document content retrieved for your query:",
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
        lines.append(text[:1200])
        lines.append("")

    lines.append(
        "*Note: This answer was formatted directly from retrieved document "
        "chunks because the AI summariser was temporarily busy.*"
    )
    return "\n".join(lines)


def run_agentic_rag(
    question: str,
    context: Optional[str] = None,
    entities: Optional[list] = None,
    intent: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Agentic RAG loop with:
      - Conversation context integration
      - Multi-channel hybrid retrieval with RRF
      - Answer validation and hallucination checks
      - Multi-level graceful fallbacks
    """
    messages: list = [
        {"role": "system", "content": SYSTEM_PROMPT},
    ]

    if context and context.strip() and context != "No prior context":
        messages.append({
            "role": "system",
            "content": f"Prior Conversation Context (for resolving follow-up pronouns only):\n{context.strip()}"
        })

    messages.append({"role": "user", "content": question})

    retrieved_chunks: List[Dict[str, Any]] = []

    # ── TURN 1: LLM Tool-Calling ──────────────────────────────
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

    # Turn 1 Fallback: Run retrieval directly
    if turn1_failed:
        logger.info("Turn 1 fallback — running hybrid retrieval directly for: %r", question)
        chunks = retrieve_chunks(query=question)
        return {
            "answer": _format_direct_answer(question, chunks),
            "sources": build_sources(chunks),
            "used_retrieval": True,
        }

    # ── TOOL EXECUTION ────────────────────────────────────────
    if tool_calls:
        messages.append(assistant_message)

        for tool_call in tool_calls:
            if tool_call.function.name != "search_documents":
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

            messages.append({
                "role": "tool",
                "tool_call_id": tool_call.id,
                "content": tool_result,
            })

        # ── TURN 2: Final Answer ──────────────────────────────
        try:
            # Explicitly pass tool_choice=none so model cannot call tools again
            final_response = _llm_call(messages, tools=[SEARCH_TOOL], tool_choice="none")
            raw_answer = (final_response.choices[0].message.content or "").strip()
            # Pass through validation layer
            answer = validate_and_refine_answer(
                question=question,
                draft_answer=raw_answer,
                chunks=retrieved_chunks,
                conversation_context=context,
            )
        except Exception as exc:
            logger.error("Turn 2 failed after all retries: %s — using direct format", exc)
            answer = _format_direct_answer(question, retrieved_chunks)

    else:
        # LLM chose not to call the tool — still retrieve for BIS questions as a safety net
        direct_answer = (assistant_message.content or "").strip()

        # Check if the question seems BIS-related (to trigger fallback retrieval)
        bis_keywords = [
            "bis", "is ", "standard", "tractor", "cement", "mixer", "helmet",
            "hdpe", "sprayer", "requirement", "specification", "certification",
            "crs", "clause", "grade", "test", "marking", "performance",
        ]
        q_lower = question.lower()
        is_bis_question = any(kw in q_lower for kw in bis_keywords)

        if is_bis_question:
            logger.info("LLM skipped tool call for apparent BIS question — running fallback retrieval")
            fallback_chunks = retrieve_chunks(query=question)
            if fallback_chunks:
                retrieved_chunks.extend(fallback_chunks)
                # Rebuild a grounded answer using the fallback evidence
                ctx = build_context(fallback_chunks)
                grounding_messages = [
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {
                        "role": "system",
                        "content": (
                            f"RETRIEVED BIS DOCUMENT EVIDENCE ({len(fallback_chunks)} chunk(s)):\n\n{ctx}\n\n"
                            "Use ONLY this evidence to answer. Cite sources as [Source N]."
                        ),
                    },
                    {"role": "user", "content": question},
                ]
                try:
                    fb_response = _llm_call(grounding_messages)
                    fb_answer = (fb_response.choices[0].message.content or "").strip()
                    answer = validate_and_refine_answer(
                        question=question,
                        draft_answer=fb_answer,
                        chunks=fallback_chunks,
                        conversation_context=context,
                    )
                except Exception as fb_exc:
                    logger.warning("Fallback retrieval answer generation failed: %s", fb_exc)
                    answer = direct_answer
            else:
                answer = direct_answer
        else:
            answer = direct_answer

    if not answer:
        answer = (
            "I could not find relevant information in the BIS documents. "
            "Please try rephrasing or check if the product standard is available."
        )

    return {
        "answer": answer,
        "sources": build_sources(retrieved_chunks),
        "used_retrieval": bool(tool_calls),
    }


def stream_agentic_rag(
    question: str,
    context: Optional[str] = None,
    entities: Optional[list] = None,
    intent: Optional[str] = None,
) -> Generator[str, None, None]:
    """
    Streaming generator for Server-Sent Events / Chunked Transfer.
    Yields JSON chunks containing sources initially, then streamed token chunks.
    """
    result = run_agentic_rag(
        question=question,
        context=context,
        entities=entities,
        intent=intent,
    )

    # First event: sources and metadata
    init_data = json.dumps({
        "type": "metadata",
        "sources": result.get("sources", []),
        "used_retrieval": result.get("used_retrieval", False),
    })
    yield f"data: {init_data}\n\n"

    # Stream the validated answer in word/token chunks
    full_answer = result.get("answer", "")
    words = full_answer.split(" ")
    for i, word in enumerate(words):
        chunk_text = word if i == len(words) - 1 else word + " "
        payload = json.dumps({"type": "token", "text": chunk_text})
        yield f"data: {payload}\n\n"
        time.sleep(0.015)

    yield "data: [DONE]\n\n"


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
            "score": chunk.get("rrf_score", chunk.get("score", 0)),
        })

    return sources


# ============================================================
# 14. PUBLIC ENTRY POINT
# ============================================================

def ask_rag(
    question: str,
    context: Optional[str] = None,
    entities: Optional[list] = None,
    intent: Optional[str] = None,
) -> Dict[str, Any]:
    question = question.strip()

    if not question:
        return {
            "answer": "Please provide a question.",
            "sources": [],
            "used_retrieval": False,
        }

    result = run_agentic_rag(
        question=question,
        context=context,
        entities=entities,
        intent=intent,
    )

    if not result.get("answer"):
        result["answer"] = (
            "I could not find relevant information in the BIS documents for your query. "
            "Please try rephrasing or use the Vectorless RAG mode."
        )

    return result