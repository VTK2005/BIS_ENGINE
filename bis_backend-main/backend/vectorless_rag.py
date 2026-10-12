"""
BIS VECTORLESS RAG - SINGLE FILE VERSION

Standalone retrieval runtime.

Required packages:
    pip install pymongo groq

This file combines:
    - config.py
    - database.py
    - llm_client.py
    - llm_retriever.py

Pipeline:
    Question
      -> LLM category selection
      -> batched LLM product selection
      -> ALL PDFs for selected product(s)
      -> ALL PageIndex trees/nodes across those PDFs
      -> local lexical ranking
      -> LLM node selection
      -> selected node content
      -> LLM final answer with sources

IMPORTANT:
    The values below are placeholders. Do not put a real API key or
    database password into a file that will be publicly shared.
    Rotate any credentials that were previously exposed.
"""

import os
import json
import re

from pymongo import MongoClient
from groq import Groq


# ============================================================
# CONFIGURATION
# ============================================================

# Put your NEW/ROTATED credentials here if you intentionally want
# credentials embedded in this single file.
GROQ_API_KEY = "PASTE_YOUR_NEW_GROQ_API_KEY_HERE"
MONGO_URI = "PASTE_YOUR_MONGODB_URI_HERE"

DATABASE_NAME = "vectorless_rag"

CATEGORIES_COLLECTION = "categories"
PRODUCTS_COLLECTION = "products"
DOCUMENTS_COLLECTION = "documents"
PAGEINDEX_TREES_COLLECTION = "pageindex_trees"

# Kept for compatibility/reference. Retrieval itself does not use Drive.
BASE_PATH = "/content/drive/MyDrive/CAPSTONE_BIS"
PAGEINDEX_API_KEY = None


# ============================================================
# MONGODB
# ============================================================

if not MONGO_URI or MONGO_URI.startswith("PASTE_"):
    raise ValueError(
        "Set MONGO_URI at the top of this file before running."
    )

client = MongoClient(MONGO_URI)
db = client[DATABASE_NAME]


def test_connection():
    client.admin.command("ping")
    print("MongoDB connection successful.")
    print(f"Database: {DATABASE_NAME}")


# ============================================================
# GROQ LLM CLIENT
# ============================================================


def get_client():
    if not GROQ_API_KEY or GROQ_API_KEY.startswith("PASTE_"):
        raise ValueError(
            "Set GROQ_API_KEY at the top of this file before running."
        )

    return Groq(api_key=GROQ_API_KEY)


def ask_llm(
    system_prompt,
    user_prompt,
    model="openai/gpt-oss-120b"
):
    """Send a request to the Groq LLM."""

    client = get_client()

    response = client.chat.completions.create(
        model=model,
        messages=[
            {
                "role": "system",
                "content": system_prompt
            },
            {
                "role": "user",
                "content": user_prompt
            }
        ],
        temperature=0
    )

    return response.choices[0].message.content


import json
import re


# ============================================================
# CONFIGURATION
# ============================================================

# Retrieval architecture:
#   Stage 1: LLM category selection
#   Stage 2: Batched LLM product selection (NO lexical pre-filter)
#   Stage 3: ALL documents for selected product(s), no LLM filtering
#   Stage 4: Python document -> PageIndex tree lookup for EVERY PDF
#   Stage 5: Python lexical node ranking + LLM semantic node selection
#   Stage 6: Python node content retrieval
#   Stage 7: LLM final answer generation
#
# This prevents lexical scoring from eliminating the correct product
# before the semantic LLM selector can inspect it. Documents are NOT
# semantically filtered at all: every PDF belonging to a selected
# product is searched through PageIndex.

# ============================================================
# GROQ TOKEN-SAFETY SETTINGS
# ============================================================
# Treat 8,000 tokens as a HARD upper limit for every LLM request.
# We deliberately stay below it to leave room for prompts and output.
MAX_GROQ_INPUT_TOKENS = 6500

# Rough token estimate. This is intentionally conservative.
CHARS_PER_TOKEN = 4

# Product selection is semantic, but 728 products may be too large for
# one Groq request. Products are therefore processed in small batches.
PRODUCT_BATCH_INPUT_TOKENS = 4500
PRODUCT_BATCH_SIZE = 250
MAX_SELECTED_PRODUCTS = 5

# Stage 5 node retrieval.
MAX_NODE_LLM_CANDIDATES = 10
NODE_TEXT_PREVIEW_CHARS = 700
NODES_PER_DOCUMENT_GUARANTEE = 2

# Minimum lexical score for deterministic fallback
MIN_FALLBACK_SCORE = 3

# Maximum nodes used as final evidence
MAX_SELECTED_NODES = 5

# Final answer context budget. This is kept well below the Groq limit.
FINAL_CONTEXT_MAX_TOKENS = 5200
FINAL_CONTEXT_MAX_CHARS = FINAL_CONTEXT_MAX_TOKENS * CHARS_PER_TOKEN

# Maximum characters contributed by one retrieved node to the final LLM.
MAX_FINAL_CHARS_PER_NODE = 3500


# ============================================================
# COMMON NO-ANSWER MESSAGE
# ============================================================

NO_ANSWER_MESSAGE = (
    "I could not find enough relevant information in the "
    "provided BIS documents to answer this question."
)


# ============================================================
# JSON HELPER
# ============================================================

def extract_json(response):
    """Extract a JSON object from an LLM response."""

    if response is None:
        raise ValueError("LLM returned an empty response.")

    response = str(response).strip()

    response = re.sub(
        r"```json",
        "",
        response,
        flags=re.IGNORECASE
    )

    response = re.sub(r"```", "", response)

    start = response.find("{")
    end = response.rfind("}")

    if start == -1 or end == -1:
        raise ValueError(
            f"Could not find JSON in LLM response:\n{response}"
        )

    json_text = response[start:end + 1]

    try:
        return json.loads(json_text)
    except json.JSONDecodeError as error:
        raise ValueError(
            f"Invalid JSON returned by LLM:\n{response}"
        ) from error


# ============================================================
# TEXT HELPERS
# ============================================================

def tokenize(text):
    return set(
        re.findall(
            r"\b[a-zA-Z0-9]+\b",
            (text or "").lower()
        )
    )


def normalize_text(text):
    text = text or ""
    text = text.lower()
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def estimate_tokens(text):
    """Conservative approximate token count for Groq input budgeting."""
    if not text:
        return 0
    return max(1, (len(str(text)) + CHARS_PER_TOKEN - 1) // CHARS_PER_TOKEN)


def truncate_to_token_budget(text, max_tokens):
    """Trim text so its rough token estimate stays below max_tokens."""
    if not text:
        return ""

    max_chars = max_tokens * CHARS_PER_TOKEN

    if len(text) <= max_chars:
        return text

    return text[:max_chars] + "\n...[truncated]"


def pack_text_parts(parts, max_tokens):
    """Pack already formatted text parts without exceeding a token budget."""
    packed = []
    used = 0

    for part in parts:
        part_tokens = estimate_tokens(part)

        if used + part_tokens > max_tokens:
            break

        packed.append(part)
        used += part_tokens

    return "\n".join(packed)


def build_query_terms(question):
    """
    Convert the user's question into meaningful retrieval terms.

    This deliberately handles common paraphrases so that questions such as:

        "minimum load-bearing capacity for sheets"

    and:

        "minimum load-bearing capacity required for sheets"

    produce essentially the same retrieval terms.

    This is used only for retrieval/ranking. The original question is
    still passed unchanged to the LLM.
    """

    words = tokenize(question)

    stop_words = {
        # Question words
        "what", "which", "who", "where", "when", "why", "how",

        # Generic request words
        "give", "tell", "show", "explain", "provide", "list",
        "find", "state", "mention", "describe",

        # Common grammatical words
        "about", "the", "for", "are", "is", "of", "a", "an",
        "to", "in", "on", "and", "or", "with", "from", "by",
        "as", "at", "be", "was", "were", "it", "this", "that",

        # Retrieval-generic words
        "can", "does", "do", "include", "including",
        "document", "documents", "please", "need", "needed",

        # Requirement phrasing
        "requirement", "requirements", "required",

        # Other very common question filler
        "minimum", "maximum"
    }

    return {
        word
        for word in words
        if word not in stop_words and len(word) >= 3
    }


def expand_query_terms(question):
    """
    Add controlled retrieval synonyms/variants.

    These are retrieval hints only. They do not change the user's
    question and are never presented as factual evidence to the
    final-answer model.
    """

    base_terms = build_query_terms(question)

    expanded = set(base_terms)

    synonym_groups = {
        # Requirement / minimum wording
        "minimum": {
            "minimum", "min", "least", "lower", "lowest"
        },
        "required": {
            "required", "requirement", "requirements",
            "specified", "specification", "specifications"
        },

        # Load / capacity wording
        "load": {
            "load", "loading"
        },
        "capacity": {
            "capacity", "capacities"
        },
        "strength": {
            "strength", "strong", "load"
        },

        # Construction / material terminology
        "sheet": {
            "sheet", "sheets", "sheeting"
        },
        "corrugated": {
            "corrugated"
        },
        "semicorrugated": {
            "semicorrugated", "semi-corrugated", "semi"
        },

        # Safety terminology
        "safety": {
            "safety", "safe"
        },
        "operator": {
            "operator", "operators"
        },
        "protection": {
            "protection", "protective"
        },
        "guard": {
            "guard", "guards", "guarding"
        },

        # Testing terminology
        "test": {
            "test", "testing", "tested"
        },
        "performance": {
            "performance"
        }
    }

    normalized_question = normalize_text(question)

    # Handle hyphenated phrases that tokenize into separate words.
    if "load-bearing" in normalized_question:
        expanded.update({
            "load", "bearing", "loadbearing", "capacity"
        })

    if "load bearing" in normalized_question:
        expanded.update({
            "load", "bearing", "loadbearing", "capacity"
        })

    if "semi-corrugated" in normalized_question:
        expanded.update({
            "semicorrugated", "corrugated", "sheet", "sheets"
        })

    if "semi corrugated" in normalized_question:
        expanded.update({
            "semicorrugated", "corrugated", "sheet", "sheets"
        })

    for term in list(base_terms):
        if term in synonym_groups:
            expanded.update(synonym_groups[term])

    return expanded


def build_normalized_variants(text):
    """
    Build normalized variants for phrase matching.

    Example:
        load-bearing
        load bearing
        loadbearing

    become comparable retrieval forms.
    """

    normalized = normalize_text(text)

    variants = {
        normalized,
        normalized.replace("-", " "),
        normalized.replace("-", ""),
        normalized.replace(" ", "-")
    }

    # Normalize common compound technical phrases.
    for phrase in [
        "load-bearing",
        "load bearing",
        "loadbearing",
        "semi-corrugated",
        "semi corrugated",
        "semicorrugated"
    ]:
        variants.add(phrase)
        variants.add(phrase.replace("-", " "))
        variants.add(phrase.replace("-", ""))

    return {
        value.strip()
        for value in variants
        if value.strip()
    }


# ============================================================
# NO-ANSWER RESULT
# ============================================================

def no_answer_result(reason=None):

    if reason:
        print(f"\nNO ANSWER: {reason}")

    return {
        "answer": NO_ANSWER_MESSAGE,
        "sources": []
    }


# ============================================================
# STAGE 1 — CATEGORY RETRIEVAL
# ============================================================

def retrieve_categories(question):

    print("\n" + "=" * 70)
    print("STAGE 1 — CATEGORY RETRIEVAL")
    print("=" * 70)

    categories = list(
        db.categories.find(
            {},
            {
                "_id": 1,
                "name": 1,
                "path": 1
            }
        )
    )

    if not categories:
        print("WARNING: No categories found in MongoDB.")
        return []

    print(
        f"Total categories available: {len(categories)}"
    )

    category_catalog = "\n".join(
        f"{index}. {category['name']} "
        f"(ID: {category['_id']})"
        for index, category in enumerate(categories, start=1)
    )

    system_prompt = """
You are a category retrieval system for a BIS document collection.

Identify the category or categories relevant to the user's question.

The exact category name does not necessarily have to appear in the question.

Only select categories from the supplied list.
Never invent category IDs.

If none are relevant, return an empty list.

Return JSON only:

{
    "category_ids": ["category_id"]
}
"""

    user_prompt = f"""
USER QUESTION:

{question}

AVAILABLE CATEGORIES:

{category_catalog}

Select the category or categories relevant to the question.

If none are relevant, return:

{{"category_ids": []}}

Return JSON only.
"""

    try:
        response = ask_llm(system_prompt, user_prompt)
        result = extract_json(response)
    except Exception as error:
        print(f"WARNING: Category retrieval failed: {error}")
        return []

    selected_ids = result.get("category_ids", [])

    if not isinstance(selected_ids, list):
        selected_ids = []

    valid_category_ids = {
        category["_id"] for category in categories
    }

    selected_ids = [
        category_id
        for category_id in selected_ids
        if category_id in valid_category_ids
    ]

    if not selected_ids:
        print("WARNING: No relevant category was found.")
        return []

    selected_categories = [
        category
        for category in categories
        if category["_id"] in selected_ids
    ]

    print("\nSelected categories:")

    for category in selected_categories:
        print(f"  Category: {category['name']}")
        print(f"  ID      : {category['_id']}")

    return selected_categories


# ============================================================
# STAGE 2 — PRODUCT RETRIEVAL
# ============================================================

def retrieve_products(question, selected_categories):
    print("\n" + "=" * 70)
    print("STAGE 2 — PRODUCT RETRIEVAL")
    print("=" * 70)

    if not selected_categories:
        print("WARNING: No categories were selected.")
        return []

    category_ids = [
        category["_id"] for category in selected_categories
    ]

    products = list(
        db.products.find(
            {"category_id": {"$in": category_ids}},
            {
                "_id": 1,
                "category_id": 1,
                "category_name": 1,
                "product_name": 1,
                "path": 1,
                "documents": 1
            }
        )
    )

    print(f"Products found in selected category(s): {len(products)}")

    if not products:
        print("WARNING: No products found.")
        return []

    # No lexical pre-filter. Every product is considered, but in batches
    # so the Groq request remains safely below the 8,000-token limit.
    batches = []
    current = []
    current_tokens = 0

    for product in products:
        line = (
            f"{product['product_name']} "
            f"(ID: {product['_id']})"
        )
        line_tokens = estimate_tokens(line) + 5

        if (
            current
            and (
                len(current) >= PRODUCT_BATCH_SIZE
                or current_tokens + line_tokens > PRODUCT_BATCH_INPUT_TOKENS
            )
        ):
            batches.append(current)
            current = []
            current_tokens = 0

        current.append(product)
        current_tokens += line_tokens

    if current:
        batches.append(current)

    print(f"Semantic product batches: {len(batches)}")

    system_prompt = """
You are a product retrieval system for a BIS vectorless RAG system.

The supplied products are a BATCH of products from the category or
categories already selected for the user's question.

Select every product in THIS BATCH that is genuinely relevant to the
question. Multiple products may be relevant.

IMPORTANT:
- Use semantic/technical meaning, not exact word overlap.
- The product name does not need to contain the question's exact words.
- Do not invent product IDs.
- Only select products from this batch.
- Do not select unrelated products merely because they share generic words.
- If no product in this batch is relevant, return an empty list.
- Return JSON only.

Required format:
{
    "product_ids": ["product_id", "product_id"],
    "reasons": [
        {"product_id": "product_id", "reason": "why it is relevant"}
    ]
}

If none are relevant:
{"product_ids": [], "reasons": []}
"""

    selected_ids = []
    reason_map = {}

    for batch_number, batch in enumerate(batches, start=1):
        print(
            f"\nProcessing product batch {batch_number}/{len(batches)} "
            f"({len(batch)} products)"
        )

        catalog = "\n".join(
            f"{index}. {product['product_name']} "
            f"(ID: {product['_id']})"
            for index, product in enumerate(batch, start=1)
        )

        user_prompt = f"""
USER QUESTION:

{question}

PRODUCTS IN THIS BATCH:

{catalog}

Select every product in this batch that is semantically relevant.
Return JSON only.
"""

        try:
            response = ask_llm(system_prompt, user_prompt)
            result = extract_json(response)
        except Exception as error:
            print(f"WARNING: Product batch {batch_number} failed: {error}")
            continue

        batch_ids = result.get("product_ids", [])

        if not isinstance(batch_ids, list):
            batch_ids = []

        valid_ids = {product["_id"] for product in batch}

        for product_id in batch_ids:
            if product_id in valid_ids and product_id not in selected_ids:
                selected_ids.append(product_id)

        reasons = result.get("reasons", [])
        if isinstance(reasons, list):
            for item in reasons:
                if isinstance(item, dict) and item.get("product_id"):
                    reason_map[item["product_id"]] = item.get("reason", "")

    if not selected_ids:
        print("WARNING: No relevant product was found.")
        return []

    # Avoid allowing one noisy batch to explode downstream document count.
    # The first selections are retained in LLM/batch order.
    selected_ids = selected_ids[:MAX_SELECTED_PRODUCTS]

    selected_products = [
        product
        for product in products
        if product["_id"] in selected_ids
    ]

    print("\nLLM-selected products:")

    for product in selected_products:
        print(f"  Product  : {product['product_name']}")
        print(f"  ID       : {product['_id']}")
        print(f"  Category : {product['category_name']}")
        print(f"  Documents stored: {len(product.get('documents', []))}")

        if product["_id"] in reason_map:
            print(f"  LLM reason: {reason_map[product['_id']]}")

    return selected_products


# ============================================================
# STAGE 3 — DOCUMENT RETRIEVAL
# ============================================================

def retrieve_documents(question, selected_products):
    """
    Stage 3 deliberately performs NO LLM document selection.

    Once a product is selected, every document/PDF belonging to that
    product is carried forward. This is important because a generic
    filename such as ``Product Manual.pdf`` may not contain the answer
    while an ``Amendment.pdf`` or ``Summary.pdf`` in the same product
    folder does.

    No document text is sent to Groq here.
    """

    print("\n" + "=" * 70)
    print("STAGE 3 — ALL DOCUMENTS FOR SELECTED PRODUCTS")
    print("=" * 70)

    if not selected_products:
        print("WARNING: No products were selected.")
        return []

    all_documents = []
    seen_document_ids = set()

    for product in selected_products:
        for document in product.get("documents", []):
            document_id = document.get("document_id")

            if not document_id or document_id in seen_document_ids:
                continue

            seen_document_ids.add(document_id)

            all_documents.append(
                {
                    "product_id": product["_id"],
                    "product_name": product["product_name"],
                    "document_id": document_id,
                    "filename": document.get("filename", ""),
                    "summary": document.get("summary", "")
                }
            )

    print(
        f"ALL documents carried forward: {len(all_documents)}"
    )

    if not all_documents:
        print("WARNING: No documents found for selected product(s).")
        return []

    print("\nDocuments that will be searched:")

    for index, document in enumerate(all_documents, start=1):
        print(
            f"  {index}. {document['filename']} "
            f"| Product: {document['product_name']} "
            f"| ID: {document['document_id']}"
        )

    return all_documents


# ============================================================
# STAGE 4 — DOCUMENT -> PAGEINDEX TREE
# ============================================================

def get_document_trees(selected_documents):

    print("\n" + "=" * 70)
    print("STAGE 4 — DOCUMENT → PAGEINDEX TREE")
    print("=" * 70)

    if not selected_documents:
        print("WARNING: No documents were selected.")
        return []

    documents_with_trees = []

    for document in selected_documents:

        document_id = document["document_id"]

        db_document = db.documents.find_one(
            {"_id": document_id},
            {
                "_id": 1,
                "product_id": 1,
                "filename": 1,
                "tree_id": 1
            }
        )

        if not db_document:

            print(
                f"WARNING: Document not found: {document_id}"
            )

            continue

        tree_id = db_document.get("tree_id")

        if not tree_id:

            print(
                f"WARNING: No PageIndex tree for "
                f"{document['filename']}"
            )

            continue

        documents_with_trees.append(
            {
                "document_id": document_id,
                "product_id": document["product_id"],
                "product_name": document["product_name"],
                "filename": document["filename"],
                "summary": document["summary"],
                "tree_id": tree_id
            }
        )

        print(f"\nDocument : {document['filename']}")
        print(f"Document ID: {document_id}")
        print(f"Tree ID    : {tree_id}")

    if not documents_with_trees:

        print(
            "WARNING: None of the selected documents "
            "have a PageIndex tree."
        )

        return []

    return documents_with_trees


# ============================================================
# PAGEINDEX TREE FLATTENING
# ============================================================

def flatten_tree(
    nodes,
    document_id,
    filename,
    result=None
):

    if result is None:
        result = []

    if isinstance(nodes, dict):
        nodes = [nodes]

    for node in nodes:

        children = node.get("nodes", [])

        if not children:

            text = node.get("text", "")

            result.append(
                {
                    "document_id": document_id,
                    "filename": filename,
                    "node_id": node.get("node_id"),
                    "title": node.get("title", ""),
                    "summary": node.get("summary", ""),
                    "start_index": node.get("start_index"),
                    "end_index": node.get("end_index"),
                    "text_length": len(text)
                }
            )

        else:

            flatten_tree(
                children,
                document_id,
                filename,
                result
            )

    return result


# ============================================================
# STAGE 5 — PAGEINDEX NODE RETRIEVAL
# ============================================================

def retrieve_pageindex_nodes(
    question,
    selected_documents
):
    """
    Stage 5 token-safe PageIndex node retrieval.

    Pipeline:

        All nodes from ALL selected PDFs
             ↓
        Query normalization / expansion
             ↓
        Local lexical ranking
             ↓
        Per-PDF candidate guarantee + global ranking
             ↓
        Small previews under Groq token budget
             ↓
        LLM semantic selection
             ↓
        ID validation
             ↓
        Safe deterministic fallback
             ↓
        Relevant nodes only

    The retrieval layer is intentionally more tolerant of paraphrases.
    For example:

        "minimum load-bearing capacity for sheets"

    and:

        "minimum load-bearing capacity required for sheets"

    should reach the same evidence node.

    The final answer model still receives the ORIGINAL user question
    and only retrieved document content.
    """

    print("\n" + "=" * 70)
    print("STAGE 5 — PAGEINDEX NODE RETRIEVAL")
    print("=" * 70)

    if not selected_documents:

        print(
            "WARNING: No documents available for "
            "PageIndex node retrieval."
        )

        return []

    all_nodes = []

    for document in selected_documents:

        tree_id = document["tree_id"]

        tree_document = db.pageindex_trees.find_one(
            {"_id": tree_id}
        )

        if not tree_document:

            print(
                f"WARNING: PageIndex tree not found: {tree_id}"
            )

            continue

        tree = tree_document.get("tree")

        if not tree:

            print(
                f"WARNING: Empty PageIndex tree: {tree_id}"
            )

            continue

        roots = tree if isinstance(tree, list) else [tree]

        def collect_nodes(node, parent_id=None):

            if not isinstance(node, dict):
                return

            node_id = node.get("node_id")
            node_text = node.get("text", "") or ""

            all_nodes.append(
                {
                    "document_id": document["document_id"],
                    "filename": document["filename"],
                    "node_id": node_id,
                    "title": node.get("title", ""),
                    "summary": node.get("summary", ""),
                    "start_index": node.get("start_index"),
                    "end_index": node.get("end_index"),
                    "text": node_text,
                    "parent_id": parent_id
                }
            )

            children = node.get("nodes", []) or []

            for child in children:
                collect_nodes(
                    child,
                    parent_id=node_id
                )

        for root in roots:
            collect_nodes(root)

    if not all_nodes:

        print("WARNING: No PageIndex nodes found.")
        return []

    print(
        f"Total nodes available: {len(all_nodes)}"
    )

    # --------------------------------------------------------
    # QUERY UNDERSTANDING FOR RETRIEVAL
    # --------------------------------------------------------

    raw_question = normalize_text(question)

    query_terms = build_query_terms(question)
    expanded_terms = expand_query_terms(question)

    print("\nOriginal question:")
    print(question)

    print("\nRetrieval terms:")
    print(sorted(query_terms))

    print("\nExpanded retrieval terms:")
    print(sorted(expanded_terms))

    # --------------------------------------------------------
    # IMPORTANT TECHNICAL PHRASES
    # --------------------------------------------------------

    phrase_patterns = [
        ("load-bearing", 8),
        ("load bearing", 8),
        ("loadbearing", 8),
        ("load bearing capacity", 10),
        ("load-bearing capacity", 10),
        ("minimum load", 7),
        ("minimum capacity", 7),
        ("minimum strength", 7),
        ("corrugated", 5),
        ("semi-corrugated", 7),
        ("semi corrugated", 7),
        ("semicorrugated", 7)
    ]

    # --------------------------------------------------------
    # IMPORTANT TERMS
    # --------------------------------------------------------

    important_terms = {
        "safety": 5,
        "safe": 4,
        "operator": 4,
        "protection": 4,
        "guard": 4,
        "guards": 4,
        "construction": 3,
        "requirement": 3,
        "requirements": 3,
        "required": 2,
        "performance": 3,
        "specification": 3,
        "specifications": 3,
        "machine": 2,
        "machines": 2,
        "brake": 3,
        "brakes": 3,
        "noise": 3,
        "vibration": 3,
        "testing": 2,
        "test": 2,
        "marking": 2,
        "material": 2,
        "materials": 2,
        "dimension": 2,
        "dimensions": 2,
        "capacity": 4,
        "strength": 4,
        "load": 3,
        "bearing": 3,
        "sheet": 3,
        "sheets": 3,
        "corrugated": 5,
        "semicorrugated": 5,
        "semi": 1
    }

    # --------------------------------------------------------
    # LOCAL NODE RANKING
    # --------------------------------------------------------

    ranked_nodes = []

    for node in all_nodes:

        title = normalize_text(
            node.get("title", "")
        )

        summary = normalize_text(
            node.get("summary", "")
        )

        text = normalize_text(
            node.get("text", "")
        )

        searchable_text = (
            title + " " + summary + " " + text
        )

        score = 0
        matched_terms = set()
        matched_phrases = set()

        # ----------------------------------------------------
        # 1. Exact/near-exact phrase matching
        # ----------------------------------------------------

        for phrase, weight in phrase_patterns:

            if phrase in searchable_text:

                score += weight
                matched_phrases.add(phrase)

        # ----------------------------------------------------
        # 2. Original query terms
        # ----------------------------------------------------

        for term in query_terms:

            if len(term) < 3:
                continue

            if term in searchable_text:

                score += 2
                matched_terms.add(term)

        # ----------------------------------------------------
        # 3. Expanded semantic/technical terms
        #
        # Only give a smaller weight to expanded terms so that
        # expansion improves paraphrase recall without making
        # unrelated nodes rank too highly.
        # ----------------------------------------------------

        for term in expanded_terms:

            if len(term) < 3:
                continue

            if term in searchable_text:

                if term in matched_terms:
                    continue

                score += 1
                matched_terms.add(term)

        # ----------------------------------------------------
        # 4. Important technical terms
        # ----------------------------------------------------

        for term, weight in important_terms.items():

            if term in searchable_text:
                score += weight

        # ----------------------------------------------------
        # 5. Exact full-question match
        # ----------------------------------------------------

        if (
            raw_question
            and raw_question in searchable_text
        ):
            score += 15

        # ----------------------------------------------------
        # 6. Title boost
        # ----------------------------------------------------

        for term in query_terms:

            if len(term) >= 3 and term in title:
                score += 3

        # ----------------------------------------------------
        # 7. Evidence-density bonus
        #
        # A node containing several independent question concepts
        # is stronger than one matching only a generic term.
        # ----------------------------------------------------

        concept_hits = 0

        concept_groups = [
            {"load", "bearing", "capacity", "strength"},
            {"sheet", "sheets", "corrugated", "semicorrugated"},
            {"minimum", "least", "required", "requirement"},
        ]

        for group in concept_groups:

            if any(
                term in searchable_text
                for term in group
            ):
                concept_hits += 1

        score += concept_hits * 3

        ranked_nodes.append(
            (
                score,
                len(matched_terms),
                len(matched_phrases),
                concept_hits,
                node
            )
        )

    ranked_nodes.sort(
        key=lambda item: (
            item[0],
            item[1],
            item[2],
            item[3]
        ),
        reverse=True
    )

    print("\nTOP LOCAL NODE CANDIDATES")
    print("-" * 70)

    for index, (
        score,
        matched_count,
        phrase_count,
        concept_hits,
        node
    ) in enumerate(
        ranked_nodes[:MAX_NODE_LLM_CANDIDATES],
        start=1
    ):
        print(
            f"{index}. Score={score} "
            f"Keywords={matched_count} "
            f"Phrases={phrase_count} "
            f"Concepts={concept_hits} "
            f"Node={node['node_id']} "
            f"Document={node['filename']} "
            f"Title={node['title']}"
        )

    best_score = ranked_nodes[0][0] if ranked_nodes else 0

    if best_score < MIN_FALLBACK_SCORE:
        print("\nWARNING: No PageIndex node has enough lexical evidence.")
        print("Skipping LLM node selection.")
        return []

    # --------------------------------------------------------
    # PER-DOCUMENT GUARANTEE
    # --------------------------------------------------------
    # Do not let one PDF monopolize the LLM candidate list. Each PDF
    # contributes up to N of its best local nodes, then remaining slots
    # are filled by the strongest nodes globally.
    # --------------------------------------------------------

    candidates = []
    candidate_keys = set()

    document_groups = {}

    for item in ranked_nodes:
        node = item[4]
        document_groups.setdefault(node["document_id"], []).append(item)

    for document_id, items in document_groups.items():
        for item in items[:NODES_PER_DOCUMENT_GUARANTEE]:
            node = item[4]
            key = (node["document_id"], node["node_id"])

            if key not in candidate_keys:
                candidates.append(item)
                candidate_keys.add(key)

    for item in ranked_nodes:
        if len(candidates) >= MAX_NODE_LLM_CANDIDATES:
            break

        node = item[4]
        key = (node["document_id"], node["node_id"])

        if key not in candidate_keys:
            candidates.append(item)
            candidate_keys.add(key)

    # Sort the final small candidate set by lexical relevance.
    candidates.sort(
        key=lambda item: (item[0], item[1], item[2], item[3]),
        reverse=True
    )

    candidate_nodes = [item[4] for item in candidates[:MAX_NODE_LLM_CANDIDATES]]

    # --------------------------------------------------------
    # STAGE 5 LLM CATALOG
    # --------------------------------------------------------

    catalog = []

    for node in candidate_nodes:

        text = node.get("text", "") or ""

        text_preview = text[:NODE_TEXT_PREVIEW_CHARS]

        if len(text) > NODE_TEXT_PREVIEW_CHARS:
            text_preview += "\n...[truncated]"

        summary = node.get("summary", "") or ""

        if len(summary) > 500:
            summary = summary[:500] + "..."

        catalog.append(
            {
                "document_id": node["document_id"],
                "filename": node["filename"],
                "node_id": node["node_id"],
                "title": node["title"],
                "summary": summary,
                "pages": (
                    f"{node['start_index']}-"
                    f"{node['end_index']}"
                ),
                "text_preview": text_preview
            }
        )

    catalog_json = json.dumps(
        catalog,
        ensure_ascii=False,
        indent=2
    )

    # Defensive final budget check for Stage 5. If the previews still
    # exceed the budget, shorten them before calling Groq.
    if estimate_tokens(catalog_json) > MAX_GROQ_INPUT_TOKENS - 1200:
        safe_catalog = []

        for item in catalog:
            item_copy = dict(item)
            item_copy["text_preview"] = truncate_to_token_budget(
                item_copy.get("text_preview", ""),
                350
            )
            item_copy["summary"] = truncate_to_token_budget(
                item_copy.get("summary", ""),
                120
            )
            safe_catalog.append(item_copy)

        catalog_json = json.dumps(
            safe_catalog,
            ensure_ascii=False,
            indent=2
        )

    system_prompt = """
You are a highly precise hierarchical document retrieval system
for a BIS vectorless RAG system.

Select PageIndex nodes whose ACTUAL CONTENT can answer the user's question.

IMPORTANT:
The wording of the question may be a paraphrase of the wording
inside the document.

For example:

- "minimum load-bearing capacity for sheets"
- "minimum load-bearing capacity required for sheets"

can refer to the same requirement.

Interpret normal linguistic paraphrases and technical wording
equivalences. Do NOT require exact phrase matching.

Rules:

1. Inspect title, summary, and text_preview.
2. text_preview is the strongest evidence.
3. Select a node when its content contains information that can
   directly or substantially answer the question.
4. Understand paraphrases such as:
   - minimum ↔ not less than / at least
   - required ↔ requirement / specified
   - load-bearing ↔ load bearing
   - sheet ↔ sheets / sheeting
5. Do NOT select a node merely because it belongs to the same product.
6. Do NOT select a node merely because it contains generic words such
   as "machine", "requirements", or "standard".
7. For safety, specifications, requirements, construction, performance,
   or testing questions, prefer actual requirement text, tables, limits,
   criteria, safety provisions, operator protection, guards,
   construction requirements, or test values.
8. If no supplied node contains enough information, return an empty list.
9. Never invent document IDs.
10. Never invent node IDs.
11. Return JSON only.

Required format:

{
    "node_ids": [
        {
            "document_id": "...",
            "node_id": "...",
            "reason": "why this node contains relevant evidence"
        }
    ]
}

If there is not enough evidence:

{
    "node_ids": []
}
"""

    user_prompt = f"""
USER QUESTION:

{question}

TOP PAGEINDEX NODE CANDIDATES:

{catalog_json}

Select only nodes whose actual content can answer the question.

Remember that the question may be phrased differently from the
document. Match the meaning, not only the exact wording.

If none contain enough evidence, return:

{{"node_ids": []}}

Return JSON only.
"""

    try:

        response = ask_llm(
            system_prompt,
            user_prompt
        )

    except Exception as error:

        print(
            "\nWARNING: Stage 5 LLM call failed."
        )

        print(f"Error: {error}")
        print("\nUsing deterministic fallback.")

        response = None

    if response:

        print("\nLLM PageIndex selection response:")
        print(response)

        try:
            result = extract_json(response)
        except Exception as error:

            print(
                f"WARNING: Could not parse Stage 5 "
                f"LLM response: {error}"
            )

            result = {"node_ids": []}

    else:

        result = {"node_ids": []}

    llm_selected = result.get("node_ids", [])

    if not isinstance(llm_selected, list):
        llm_selected = []

    valid_pairs = {
        (
            node["document_id"],
            node["node_id"]
        )
        for node in all_nodes
    }

    seen_pairs = set()
    selected_nodes = []

    for selected in llm_selected:

        if not isinstance(selected, dict):
            continue

        document_id = selected.get("document_id")
        node_id = selected.get("node_id")

        pair = (
            document_id,
            node_id
        )

        if pair not in valid_pairs:
            continue

        if pair in seen_pairs:
            continue

        seen_pairs.add(pair)

        for node in all_nodes:

            if (
                node["document_id"] == document_id
                and node["node_id"] == node_id
            ):

                selected_nodes.append(node)

                print("\nSelected node:")
                print(f"Document : {node['filename']}")
                print(f"Node ID  : {node['node_id']}")
                print(f"Title    : {node['title']}")
                print(
                    f"Pages    : "
                    f"{node['start_index']}-"
                    f"{node['end_index']}"
                )
                print(
                    f"Reason   : "
                    f"{selected.get('reason', '')}"
                )

                break

        if len(selected_nodes) >= MAX_SELECTED_NODES:
            break

    # ========================================================
    # SAFE DETERMINISTIC FALLBACK
    # ========================================================

    if not selected_nodes:

        print(
            "\nWARNING: LLM selected 0 valid "
            "PageIndex nodes."
        )

        print("Running deterministic fallback...")

        best_score, _, _, _, best_node = ranked_nodes[0]

        if best_score >= MIN_FALLBACK_SCORE:

            selected_nodes.append(best_node)

            print("\nFallback selected node:")
            print(
                f"Document : {best_node['filename']}"
            )
            print(
                f"Node ID  : {best_node['node_id']}"
            )
            print(
                f"Title    : {best_node['title']}"
            )
            print(
                f"Pages    : "
                f"{best_node['start_index']}-"
                f"{best_node['end_index']}"
            )
            print(
                f"Fallback score: {best_score}"
            )

        else:

            print(
                "WARNING: Fallback score is too low."
            )

            print(
                "No relevant node will be selected."
            )

    print(
        f"\nSelected nodes: {len(selected_nodes)}"
    )

    return selected_nodes


# ============================================================
# FIND NODE
# ============================================================

def find_node(nodes, target_node_id):

    if isinstance(nodes, dict):
        nodes = [nodes]

    if not nodes:
        return None

    for node in nodes:

        if node.get("node_id") == target_node_id:
            return node

        children = node.get("nodes", [])

        found = find_node(
            children,
            target_node_id
        )

        if found:
            return found

    return None


# ============================================================
# COLLECT NODE TEXT
# ============================================================

def collect_node_text(node):

    text = node.get("text", "")

    if text:
        return text

    children = node.get("nodes", [])

    child_text = []

    for child in children:

        value = collect_node_text(child)

        if value:
            child_text.append(value)

    return "\n\n".join(child_text)


# ============================================================
# STAGE 6 — NODE TEXT
# ============================================================

def get_selected_page_content(selected_nodes):

    print("\n" + "=" * 70)
    print("STAGE 6 — NODE TEXT RETRIEVAL")
    print("=" * 70)

    if not selected_nodes:

        print("WARNING: No nodes were selected.")
        return []

    contents = []

    for selected_node in selected_nodes:

        document_id = selected_node["document_id"]
        node_id = selected_node["node_id"]

        document = db.documents.find_one(
            {"_id": document_id}
        )

        if not document:

            print(
                f"WARNING: Document not found: {document_id}"
            )

            continue

        tree_id = document.get("tree_id")

        if not tree_id:

            print(
                f"WARNING: No tree ID for {document_id}"
            )

            continue

        tree_document = db.pageindex_trees.find_one(
            {"_id": tree_id}
        )

        if not tree_document:
            print(
                f"WARNING: Tree not found: {tree_id}"
            )
            continue

        tree = tree_document.get("tree")

        if not tree:
            continue

        node = find_node(
            tree,
            node_id
        )

        if not node:

            print(
                f"WARNING: Node not found: {node_id}"
            )

            continue

        text = collect_node_text(node)

        if not text or not text.strip():

            print(
                f"WARNING: Node has no text: {node_id}"
            )

            continue

        contents.append(
            {
                "document_id": document_id,
                "filename": document["filename"],
                "node_id": node_id,
                "start_index": node.get("start_index"),
                "end_index": node.get("end_index"),
                "text": text
            }
        )

        print(
            f"\nDocument : {document['filename']}"
        )
        print(
            f"Node     : {node_id}"
        )
        print(
            f"Pages    : "
            f"{node.get('start_index')}-"
            f"{node.get('end_index')}"
        )
        print(
            f"Text     : {len(text)} characters"
        )

        print("\nText preview:")
        print(text[:1500])

    if not contents:

        print(
            "\nWARNING: No usable page content retrieved."
        )

    return contents


# ============================================================
# STAGE 7 — FINAL ANSWER
# ============================================================

def generate_final_answer(question, page_contents):

    print("\n" + "=" * 70)
    print("STAGE 7 — FINAL ANSWER GENERATION")
    print("=" * 70)

    if not page_contents:

        print(
            "WARNING: No page content was retrieved."
        )

        return no_answer_result(
            "There is no retrieved page content."
        )

    context_parts = []
    remaining_chars = FINAL_CONTEXT_MAX_CHARS

    # Build compact evidence context. The final answer model receives
    # only the selected nodes, never the complete PDFs.
    for index, content in enumerate(page_contents, start=1):
        if remaining_chars <= 0:
            break

        text = content.get("text", "") or ""
        text = truncate_to_token_budget(
            text,
            MAX_FINAL_CHARS_PER_NODE // CHARS_PER_TOKEN
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
            allowed = max(0, remaining_chars - 200)
            block = block[:allowed] + "\n...[context budget reached]"

        context_parts.append(block)
        remaining_chars -= len(block)

    context = "\n\n".join(context_parts)

    system_prompt = """
You are a BIS document question-answering system.

Answer the user's question ONLY using the supplied retrieved
document content.

STRICT RULES:

1. Do NOT use outside knowledge.
2. Do NOT rely on pretrained knowledge.
3. Do NOT invent facts.
4. Do NOT invent numerical values.
5. Do NOT assume information not supported by the retrieved content.
6. Carefully interpret tables.
7. If the retrieved content does not contain enough information,
   return exactly:

   INSUFFICIENT_EVIDENCE

8. If only part of the question is supported, answer only the
   supported part and clearly state what is unavailable.
9. Cite claims using [Source 1], [Source 2], etc.
10. Place citations immediately after the relevant statement.
11. Do not create source numbers that do not exist.
12. Do not create a separate SOURCES section.
13. The retrieved content is the only source of truth.
"""

    user_prompt = f"""
USER QUESTION:

{question}

RETRIEVED DOCUMENT CONTENT:

{context}

Answer using ONLY the retrieved document content.

If the content does not contain enough evidence, return:

INSUFFICIENT_EVIDENCE
"""

    try:

        answer = ask_llm(
            system_prompt,
            user_prompt
        )

    except Exception as error:

        print(
            f"WARNING: Final answer generation failed: {error}"
        )

        return no_answer_result(
            "Final answer generation failed."
        )

    answer = str(answer).strip()

    normalized_answer = normalize_text(answer)

    insufficient_markers = {
        "insufficient_evidence",
        "insufficient evidence",
        "not enough information",
        "information is not available",
        "not available in the retrieved content",
        "could not find enough information"
    }

    if (
        normalized_answer in insufficient_markers
        or "insufficient_evidence" in normalized_answer
    ):

        print(
            "\nLLM determined that there is "
            "insufficient evidence."
        )

        return no_answer_result(
            "Retrieved content does not contain enough evidence."
        )

    sources = []
    seen_sources = set()

    for content in page_contents:

        source_key = (
            content["document_id"],
            content["node_id"]
        )

        if source_key in seen_sources:
            continue

        seen_sources.add(source_key)

        sources.append(
            {
                "document_id": content["document_id"],
                "filename": content["filename"],
                "node_id": content["node_id"],
                "start_index": content["start_index"],
                "end_index": content["end_index"],
                "pages": (
                    f"{content['start_index']}-"
                    f"{content['end_index']}"
                )
            }
        )

    return {
        "answer": answer,
        "sources": sources
    }


# ============================================================
# COMPLETE VECTORLESS RAG PIPELINE
# ============================================================

def retrieve_and_answer(question):

    print("\n")
    print("#" * 70)
    print("VECTORLESS RAG")
    print("#" * 70)

    print(f"\nQuestion: {question}")

    # ========================================================
    # STAGE 1
    # ========================================================

    selected_categories = retrieve_categories(question)

    if not selected_categories:

        result = no_answer_result(
            "No relevant category was found."
        )

        return print_final_result(result)

    # ========================================================
    # STAGE 2
    # ========================================================

    selected_products = retrieve_products(
        question,
        selected_categories
    )

    if not selected_products:

        result = no_answer_result(
            "No relevant product was found."
        )

        return print_final_result(result)

    # ========================================================
    # STAGE 3
    # ========================================================

    selected_documents = retrieve_documents(
        question,
        selected_products
    )

    if not selected_documents:

        result = no_answer_result(
            "No relevant document was found."
        )

        return print_final_result(result)

    # ========================================================
    # STAGE 4
    # ========================================================

    documents_with_trees = get_document_trees(
        selected_documents
    )

    if not documents_with_trees:

        result = no_answer_result(
            "Selected documents do not have usable "
            "PageIndex trees."
        )

        return print_final_result(result)

    # ========================================================
    # STAGE 5
    # ========================================================

    selected_nodes = retrieve_pageindex_nodes(
        question,
        documents_with_trees
    )

    if not selected_nodes:

        print("\n" + "=" * 70)
        print("NO RELEVANT PAGEINDEX NODE FOUND")
        print("=" * 70)

        result = no_answer_result(
            "Stage 5 could not find a sufficiently "
            "relevant PageIndex node."
        )

        return print_final_result(result)

    # ========================================================
    # STAGE 6
    # ========================================================

    page_contents = get_selected_page_content(
        selected_nodes
    )

    if not page_contents:

        print("\n" + "=" * 70)
        print("NO USABLE PAGE CONTENT FOUND")
        print("=" * 70)

        result = no_answer_result(
            "Selected PageIndex nodes contained no usable text."
        )

        return print_final_result(result)

    # ========================================================
    # STAGE 7
    # ========================================================

    result = generate_final_answer(
        question,
        page_contents
    )

    return print_final_result(result)


# ============================================================
# PRINT FINAL RESULT
# ============================================================

def print_final_result(result):

    answer = result["answer"]
    sources = result["sources"]

    print("\n")
    print("=" * 70)
    print("FINAL ANSWER")
    print("=" * 70)

    print(answer)

    print("\n")
    print("=" * 70)
    print("SOURCES")
    print("=" * 70)

    if not sources:

        print("No sources available.")

    else:

        for index, source in enumerate(
            sources,
            start=1
        ):

            print()
            print(f"[Source {index}]")
            print(
                f"Document   : {source['filename']}"
            )
            print(
                f"Document ID: {source['document_id']}"
            )
            print(
                f"Node ID    : {source['node_id']}"
            )
            print(
                f"Pages      : {source['pages']}"
            )

    return result


# ============================================================
# MAIN
# ============================================================

if __name__ == "__main__":

    question = input(
        "Enter your question: "
    )

    retrieve_and_answer(question)
