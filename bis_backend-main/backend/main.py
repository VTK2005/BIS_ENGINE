import sys
import os
import json
import time
import re
from urllib.parse import quote, urlencode, urljoin
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import bcrypt
import jwt
import httpx
from bson import ObjectId
from pymongo import MongoClient, DESCENDING
from pymongo.errors import DuplicateKeyError
from fastapi import FastAPI, Request, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel

from rag import ask_rag
from vectorless_rag_api import ask_vectorless_rag


app = FastAPI(title="BIS RAG API (Vector + Vectorless)")

JWT_SECRET = os.getenv("JWT_SECRET") or os.getenv("JWT_SECRET_KEY")
JWT_ALGORITHM = "HS256"
COOKIE_NAME = "bis_auth_token"
MONGO_URI = os.getenv("MONGODB_URI") or os.getenv("MONGO_URI")
# Mongoose uses the driver's default database when the URI has no path (the
# current Next app's URI has no database name). Override with MONGODB_DB when
# deploying against a named database.
MONGO_DB = os.getenv("MONGODB_DB", "test")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000").rstrip("/")
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET")
GOOGLE_REDIRECT_URI = os.getenv("GOOGLE_REDIRECT_URI", "").rstrip("/")
_mongo = MongoClient(MONGO_URI) if MONGO_URI else None


def db():
    if _mongo is None:
        raise RuntimeError("MONGODB_URI or MONGO_URI is not configured")
    return _mongo[MONGO_DB]


def jsonable(value: Any) -> Any:
    if isinstance(value, ObjectId): return str(value)
    if isinstance(value, datetime): return value.isoformat()
    if isinstance(value, list): return [jsonable(v) for v in value]
    if isinstance(value, dict): return {k: jsonable(v) for k, v in value.items()}
    return value


def token_for(user: dict) -> str:
    if not JWT_SECRET:
        raise RuntimeError("JWT_SECRET is not configured")
    return jwt.encode({"id": str(user["_id"]), "email": user["email"], "name": user["name"],
                       "exp": datetime.now(timezone.utc) + timedelta(days=7)}, JWT_SECRET, algorithm=JWT_ALGORITHM)


def auth_user(request: Request) -> Optional[dict]:
    value = request.headers.get("authorization", "")
    token = value[7:].strip() if value.lower().startswith("bearer ") else request.cookies.get(COOKIE_NAME)
    if not token or not JWT_SECRET:
        return None
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except (jwt.InvalidTokenError, TypeError):
        return None


def response(payload: Any, status: int = 200, token: Optional[str] = None, clear: bool = False):
    result = JSONResponse(jsonable(payload), status_code=status)
    if token:
        result.set_cookie(COOKIE_NAME, token, max_age=7 * 24 * 3600, httponly=True, samesite="lax",
                         secure=os.getenv("COOKIE_SECURE", "false").lower() == "true", path="/")
    if clear:
        result.delete_cookie(COOKIE_NAME, path="/")
    return result


def oid(value: str) -> Optional[ObjectId]:
    return ObjectId(value) if ObjectId.is_valid(value) else None

app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in os.getenv("FRONTEND_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(",") if origin.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class QuestionRequest(BaseModel):
    question: str
    context: Optional[str] = None
    entities: Optional[list] = None
    intent: Optional[str] = None


class ChatRequest(BaseModel):
    search_query: str
    conversationId: str
    mode: str = "vector"


async def require_auth(request: Request):
    user = auth_user(request)
    if not user:
        return None, response({"success": False, "message": "Unauthorized. Please log in."}, 401)
    return user, None


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


# ──────────────────────────────────────────────────────────────
# API-compatible handlers formerly served by Next.js (/api/*)
# ──────────────────────────────────────────────────────────────
@app.post("/api/auth/register")
async def register(request: Request):
    body = await request.json()
    name, email, password = body.get("name"), body.get("email"), body.get("password")
    if not isinstance(name, str) or not name.strip(): return response({"message": "Name is required"}, 400)
    if not isinstance(email, str) or "@" not in email: return response({"message": "Valid email is required"}, 400)
    if not isinstance(password, str) or len(password) < 6: return response({"message": "Password must be at least 6 characters long"}, 400)
    email = email.lower().strip()
    try:
        users = db().users
        if users.find_one({"email": email}): return response({"message": "An account with this email already exists"}, 409)
        user = {"name": name.strip(), "email": email, "password": bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode(), "image": "", "createdAt": datetime.utcnow(), "updatedAt": datetime.utcnow()}
        user["_id"] = users.insert_one(user).inserted_id
        return response({"success": True, "message": "Registration successful", "user": {"id": str(user["_id"]), "name": user["name"], "email": email}}, 201, token_for(user))
    except DuplicateKeyError: return response({"message": "An account with this email already exists"}, 409)
    except Exception: return response({"message": "Registration failed. Please try again."}, 500)


@app.post("/api/auth/login")
async def login(request: Request):
    body = await request.json(); email = str(body.get("email", "")).lower().strip(); password = body.get("password", "")
    if not email or not password: return response({"message": "Email and password are required"}, 400)
    user = db().users.find_one({"email": email})
    if not user or not user.get("password") or not bcrypt.checkpw(password.encode(), user["password"].encode()): return response({"message": "Invalid email or password"}, 401)
    return response({"success": True, "message": "Login successful", "user": {"id": str(user["_id"]), "name": user["name"], "email": user["email"], "image": user.get("image", "")}}, token=token_for(user))


@app.get("/api/auth/me")
async def me(request: Request):
    user = auth_user(request)
    if not user: return response({"authenticated": False, "user": None}, 401)
    found = db().users.find_one({"_id": oid(user.get("id", ""))})
    if not found: return response({"authenticated": False, "user": None}, 401)
    return response({"authenticated": True, "user": {"id": str(found["_id"]), "name": found["name"], "email": found["email"], "image": found.get("image", "")}})


@app.post("/api/auth/logout")
async def logout(): return response({"success": True, "message": "Logged out successfully"}, clear=True)


@app.get("/api/auth/callback/google")
async def google_callback(request: Request, code: Optional[str] = None, error: Optional[str] = None, state: str = "/assistant"):
    """Complete Google OAuth without routing the browser through Next.js."""
    redirect_path = state if state.startswith("/") and not state.startswith("//") else "/assistant"
    login_url = f"{FRONTEND_URL}/login"
    if error or not code:
        return JSONResponse(content=None, status_code=302, headers={"Location": f"{login_url}?error={quote(error or 'Google sign-in was cancelled or failed.') }"})
    if not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET:
        return JSONResponse(content=None, status_code=302, headers={"Location": f"{login_url}?error={quote('Google OAuth credentials are not configured.') }"})

    callback_url = GOOGLE_REDIRECT_URI or f"{request.base_url.scheme}://{request.base_url.netloc}/api/auth/callback/google"
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            token_result = await client.post("https://oauth2.googleapis.com/token", data={
                "code": code,
                "client_id": GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "redirect_uri": callback_url,
                "grant_type": "authorization_code",
            })
            token_result.raise_for_status()
            access_token = token_result.json().get("access_token")
            profile_result = await client.get("https://www.googleapis.com/oauth2/v3/userinfo", headers={"Authorization": f"Bearer {access_token}"})
            profile_result.raise_for_status()
            profile = profile_result.json()

        email = str(profile.get("email", "")).lower().strip()
        if not email:
            raise ValueError("Google account has no verified email")
        users = db().users
        user = users.find_one({"$or": [{"email": email}, {"googleId": profile.get("sub", "")}]})
        now = datetime.utcnow()
        if not user:
            user = {"name": profile.get("name") or email.split("@")[0], "email": email, "image": profile.get("picture", ""), "googleId": profile.get("sub", ""), "createdAt": now, "updatedAt": now}
            user["_id"] = users.insert_one(user).inserted_id
        elif not user.get("googleId") or (profile.get("picture") and not user.get("image")):
            users.update_one({"_id": user["_id"]}, {"$set": {"googleId": profile.get("sub", ""), "image": profile.get("picture", ""), "updatedAt": now}})
        result = JSONResponse(content=None, status_code=302, headers={"Location": f"{FRONTEND_URL}{redirect_path}"})
        result.set_cookie(COOKIE_NAME, token_for(user), max_age=7 * 24 * 3600, httponly=True, samesite="lax", secure=os.getenv("COOKIE_SECURE", "false").lower() == "true", path="/")
        return result
    except Exception:
        return JSONResponse(content=None, status_code=302, headers={"Location": f"{login_url}?error={quote('Google sign-in failed. Please try again.') }"})


def conversation_doc(cid: str):
    item = oid(cid); return db().conversations.find_one({"_id": item}) if item else None


def owned(doc, user): return bool(doc and user and str(doc.get("userId", "")) == user["id"])


@app.get("/api/chat/conversations")
async def list_conversations(request: Request):
    user, err = await require_auth(request)
    if err: return err
    docs = db().conversations.find({"userId": oid(user["id"]), "messages.0": {"$exists": True}}).sort("updatedAt", DESCENDING)
    formatted = []
    for c in docs:
        messages = c.get("messages", []); last = messages[-1].get("content", "")[:60] if messages else ""
        formatted.append({"id": str(c["_id"]), "title": c.get("title", "New Chat"), "updatedAt": c.get("updatedAt"), "createdAt": c.get("createdAt"), "messageCount": len(messages), "lastMessage": last})
    return response({"success": True, "conversations": formatted})


@app.post("/api/chat/conversations")
async def create_conversation(request: Request):
    user, err = await require_auth(request)
    if err: return err
    try: body = await request.json()
    except Exception: body = {}
    title = body.get("title", "New Chat") if isinstance(body, dict) else "New Chat"; title = title.strip() if isinstance(title, str) and title.strip() else "New Chat"
    now = datetime.utcnow(); item = {"userId": oid(user["id"]), "title": title, "messages": [], "createdAt": now, "updatedAt": now}; item["_id"] = db().conversations.insert_one(item).inserted_id
    return response({"success": True, "conversationId": str(item["_id"]), "title": title}, 201)


@app.get("/api/chat/conversations/{cid}")
async def get_conversation(cid: str, request: Request):
    user, err = await require_auth(request)
    if err: return err
    c = conversation_doc(cid)
    if not c: return response({"success": False, "message": "Conversation not found"}, 404)
    if not owned(c, user): return response({"success": False, "message": "Forbidden. You do not own this conversation."}, 403)
    return response({"success": True, "conversation": {"id": str(c["_id"]), "title": c.get("title", "New Chat"), "messages": c.get("messages", []), "createdAt": c.get("createdAt"), "updatedAt": c.get("updatedAt")}})


@app.patch("/api/chat/conversations/{cid}")
async def patch_conversation(cid: str, request: Request):
    user, err = await require_auth(request)
    if err: return err
    body = await request.json(); title = body.get("title")
    if not isinstance(title, str) or not title.strip(): return response({"success": False, "message": "Title is required"}, 400)
    c = conversation_doc(cid)
    if not c: return response({"success": False, "message": "Conversation not found"}, 404)
    if not owned(c, user): return response({"success": False, "message": "Forbidden. You do not own this conversation."}, 403)
    db().conversations.update_one({"_id": c["_id"]}, {"$set": {"title": title.strip(), "updatedAt": datetime.utcnow()}})
    return response({"success": True, "title": title.strip()})


@app.delete("/api/chat/conversations/{cid}")
async def delete_conversation(cid: str, request: Request):
    user, err = await require_auth(request)
    if err: return err
    c = conversation_doc(cid)
    if not c: return response({"success": False, "message": "Conversation not found"}, 404)
    if not owned(c, user): return response({"success": False, "message": "Forbidden. You do not own this conversation."}, 403)
    db().conversations.delete_one({"_id": c["_id"]}); return response({"success": True, "message": "Conversation deleted successfully"})


@app.post("/api/chat")
async def chat(body: ChatRequest, request: Request):
    user = auth_user(request)
    if not user: return response({"message": "Unauthorized. Please log in."}, 401)
    c = conversation_doc(body.conversationId)
    if not c: return response({"message": "Conversation not found"}, 404)
    if not owned(c, user): return response({"message": "Forbidden. You do not own this conversation."}, 403)
    query = body.search_query.strip(); mode = "vectorless" if body.mode == "vectorless" else "vector"
    history = [{"role": m["role"], "content": m["content"]} for m in c.get("messages", [])[-10:]]
    # The retrieval service accepts the same context fields as the former Next handler.
    result = ask_vectorless_rag(query) if mode == "vectorless" else ask_rag(query)
    answer, sources = result.get("answer", ""), result.get("sources", [])
    now = datetime.utcnow(); messages = c.get("messages", []) + [{"role": "user", "content": query, "createdAt": now}, {"role": "assistant", "content": answer, "sources": sources, "stopped": False, "createdAt": now}]
    title = query[:47] + "..." if len(query) > 50 else query
    update = {"messages": messages, "updatedAt": now};
    if c.get("title") == "New Chat": update["title"] = title
    db().conversations.update_one({"_id": c["_id"]}, {"$set": update})
    return response({"search_query": query, "conversationId": body.conversationId, "answer": answer, "sources": sources, "mode": mode})


@app.post("/api/chat/stop")
async def stop_chat(request: Request):
    user = auth_user(request); body = await request.json(); cid = body.get("conversationId")
    if not user: return response({"message": "Unauthorized. Please log in."}, 401)
    if not isinstance(cid, str): return response({"message": "conversationId is required"}, 400)
    c = conversation_doc(cid)
    if not c: return response({"message": "Conversation not found"}, 404)
    if not owned(c, user): return response({"message": "Forbidden"}, 403)
    partial = body.get("partialAnswer", ""); content = f"{partial.strip()}\n\n*[Response stopped by user]*" if isinstance(partial, str) and partial.strip() else "*[Response stopped by user before completion]*"
    db().conversations.update_one({"_id": c["_id"]}, {"$push": {"messages": {"role": "assistant", "content": content, "sources": body.get("sources", []), "stopped": True, "createdAt": datetime.utcnow()}}, "$set": {"updatedAt": datetime.utcnow()}})
    return response({"success": True, "message": "Stopped response saved"})


async def fetch_html(url: str) -> str:
    async with httpx.AsyncClient(timeout=30, follow_redirects=True, headers={"User-Agent": "Mozilla/5.0"}) as client:
        result = await client.get(url)
        result.raise_for_status()
        return result.text


@app.get("/api/standards/search")
async def standards_search(q: Optional[str] = Query(None)):
    term = (q or "").strip()
    if not term: return response({"success": False, "error": "Search term is required"}, 400)
    try:
        from bs4 import BeautifulSoup
        html = await fetch_html("https://standards.bis.gov.in/website/know-your-standards?searchTerm=" + quote(term))
        soup = BeautifulSoup(html, "html.parser"); results = []
        for listing in soup.select(".search__listing"):
            link = listing.select_one("h2 a"); published = listing.select_one(".text-secondary")
            if not link: continue
            href = link.get("href", ""); results.append({"standardNumber": (link.get("title") or link.get_text(strip=True)), "title": (listing.select_one("p").get_text(strip=True) if listing.select_one("p") else link.get_text(strip=True)), "publishedIn": re.sub(r"Published In:", "", published.get_text(" ", strip=True)).strip() if published else None, "url": href if href.startswith("http") else "https://standards.bis.gov.in" + href})
        return response({"success": True, "query": term, "count": len(results), "results": results})
    except Exception as exc: return response({"success": False, "error": str(exc)}, 500)


@app.get("/api/laboratories/search")
async def laboratories_search(name: str = "", state: str = "", district: str = ""):
    name, state, district = name.strip(), state.strip(), district.strip()
    if not name and not state and not district: return response({"success": False, "message": "Please provide a laboratory name, state, or district.", "results": []}, 400)
    try:
        from bs4 import BeautifulSoup
        params = {k: v for k, v in {"lab_name__icontains": name, "lab_state": state, "lab_district": district}.items() if v}
        html = await fetch_html("https://lims.bis.gov.in/home/bis_labs/?" + urlencode(params))
        soup = BeautifulSoup(html, "html.parser"); results = []
        for index, row in enumerate(soup.select("table#dataTable tbody tr"), 1):
            cells = row.select("td")
            if len(cells) < 8: continue
            text = lambda i: " ".join(cells[i].get_text(" ", strip=True).split())
            image = cells[2].select_one("img"); scope = cells[7].select_one("a")
            absolute = lambda value: urljoin("https://lims.bis.gov.in", value) if value else ""
            results.append({"id": (row.get("id", "")[3:] if row.get("id", "").startswith("tr_") else str(index)), "labCode": text(1), "name": text(2), "address": text(3), "contactPerson": text(4), "contactNumber": text(5), "email": text(6), "imageUrl": absolute(image.get("src")) if image else "", "scopeUrl": absolute(scope.get("href")) if scope else ""})
        return response({"success": True, "count": len(results), "results": results})
    except Exception as exc: return response({"success": False, "message": str(exc), "results": []}, 500)


@app.get("/api/updates")
async def updates():
    try:
        docs = list(db().bisupdates.find().sort([("publishedDate", DESCENDING), ("createdAt", DESCENDING)]).limit(20))
        return response({"success": True, "updates": docs})
    except Exception: return response({"success": False, "error": "Failed to fetch updates"}, 500)
