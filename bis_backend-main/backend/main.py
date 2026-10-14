import sys
import os
import json
import time

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional

from rag import ask_rag
from vectorless_rag_api import ask_vectorless_rag


app = FastAPI(title="BIS RAG API (Vector + Vectorless)")

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
# VECTOR RAG (Qdrant + BGE-M3)
# ──────────────────────────────────────────────────────────────

@app.post("/ask")
def ask_question(request: QuestionRequest):
    return ask_rag(request.question)


def stream_vector_rag(question: str):
    result = ask_rag(question)

    metadata = json.dumps({
        "type": "metadata",
        "sources": result.get("sources", []),
        "used_retrieval": result.get("used_retrieval", False),
    })
    yield f"data: {metadata}\n\n"

    answer = result.get("answer", "")
    words = answer.split(" ")
    for index, word in enumerate(words):
        text = word if index == len(words) - 1 else word + " "
        yield f"data: {json.dumps({'type': 'token', 'text': text})}\n\n"
        time.sleep(0.015)

    yield "data: [DONE]\n\n"


@app.post("/ask/stream")
def ask_question_stream(request: QuestionRequest):
    return StreamingResponse(
        stream_vector_rag(request.question),
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
