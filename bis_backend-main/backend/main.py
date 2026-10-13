import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional

from rag import ask_rag, stream_agentic_rag
from vectorless_rag_api import ask_vectorless_rag


app = FastAPI(title="BIS RAG API (Agentic Hybrid + Vectorless)")

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
            "vector_rag_stream": "POST /ask/stream",
            "vectorless_rag": "POST /ask-vectorless",
        },
    }


# ──────────────────────────────────────────────────────────────
# VECTOR RAG (Hybrid — Qdrant + BGE-M3 + RRF + Validation)
# ──────────────────────────────────────────────────────────────

@app.post("/ask")
def ask_question(request: QuestionRequest):
    return ask_rag(
        question=request.question,
        context=request.context,
        entities=request.entities,
        intent=request.intent,
    )


@app.post("/ask/stream")
def ask_question_stream(request: QuestionRequest):
    return StreamingResponse(
        stream_agentic_rag(
            question=request.question,
            context=request.context,
            entities=request.entities,
            intent=request.intent,
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# ──────────────────────────────────────────────────────────────
# VECTORLESS RAG (Agentic — MongoDB PageIndex, no embeddings)
# ──────────────────────────────────────────────────────────────

@app.post("/ask-vectorless")
def ask_question_vectorless(request: QuestionRequest):
    return ask_vectorless_rag(request.question)