import sys
import os

# rag.py lives in the parent directory (bis_backend-main/), not in backend/
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from rag import ask_rag


app = FastAPI(title="BIS RAG API")


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class QuestionRequest(BaseModel):
    question: str
    context: str | None = None
    entities: list | None = None
    intent: str | None = None


@app.get("/")
def home():
    return {
        "message": "BIS RAG API is running"
    }


@app.post("/ask")
def ask_question(request: QuestionRequest):

    result = ask_rag(request.question)

    # If no relevant information was found
    if result is None:
        raise HTTPException(
            status_code=404,
            detail="I could not find this information in the provided documents."
        )

    return result