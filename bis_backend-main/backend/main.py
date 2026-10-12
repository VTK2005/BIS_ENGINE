import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional

from rag import ask_rag
from vectorless_rag_api import ask_vectorless_rag


app = FastAPI(title="BIS RAG API (Agentic + Vectorless)")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class QuestionRequest(BaseModel):
    question: str
    context: Optional[str] = None
    entities: Optional[list] = None
    intent: Optional[str] = None


@app.get("/")
def home():
    return {
        "message": "BIS RAG API is running",
        "endpoints": {
            "vector_rag": "POST /ask",
            "vectorless_rag": "POST /ask-vectorless",
        },
    }


# ──────────────────────────────────────────────────────────────
# VECTOR RAG (Agentic — Qdrant + BGE-M3 + payload filtering)
# ask_rag always returns a valid dict (never None)
# ──────────────────────────────────────────────────────────────

@app.post("/ask")
def ask_question(request: QuestionRequest):
    return ask_rag(request.question)


# ──────────────────────────────────────────────────────────────
# VECTORLESS RAG (Agentic — MongoDB PageIndex, no embeddings)
# ask_vectorless_rag always returns a valid dict (never None)
# ──────────────────────────────────────────────────────────────

@app.post("/ask-vectorless")
def ask_question_vectorless(request: QuestionRequest):
    return ask_vectorless_rag(request.question)