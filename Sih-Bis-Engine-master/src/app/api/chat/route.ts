import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Conversation } from "@/models/Conversation";
import { buildConversationContext } from "@/lib/context";
import { getAuthUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
    try {
        const authUser = await getAuthUser(req);
        const body = await req.json();

        if (typeof body !== "object" || body === null || Array.isArray(body)) {
            return NextResponse.json(
                { message: "Request body must be a valid JSON object" },
                { status: 400 }
            );
        }

        if (typeof body.search_query !== "string" || !body.search_query.trim()) {
            return NextResponse.json({ message: "search_query is required" }, { status: 400 });
        }

        if (typeof body.conversationId !== "string" || !body.conversationId.trim()) {
            return NextResponse.json({ message: "conversationId is required" }, { status: 400 });
        }

        const search_query = body.search_query.trim();
        const conversationId = body.conversationId.trim();

        // "vector" uses Qdrant + BGE-M3 + RRF (default)
        // "vectorless" uses MongoDB PageIndex pipeline (no embeddings)
        const mode: "vector" | "vectorless" =
            body.mode === "vectorless" ? "vectorless" : "vector";

        if (!process.env.BIS_RAG_URI) {
            console.error("BIS_RAG_URI is not defined");
            return NextResponse.json({ message: "Internal Server error" }, { status: 500 });
        }

        const ragBaseUri = process.env.BIS_RAG_URI.replace(/\/ask(-vectorless)?$/, "");
        const ragUri =
            mode === "vectorless"
                ? `${ragBaseUri}/ask-vectorless`
                : `${ragBaseUri}/ask`;

        await connectDB();

        const conversation = await Conversation.findById(conversationId);
        if (!conversation) {
            return NextResponse.json({ message: "Conversation not found" }, { status: 404 });
        }

        // Enforce user isolation: if user is logged in, ensure conversation belongs to user
        if (authUser) {
            if (conversation.userId && conversation.userId.toString() !== authUser.id) {
                return NextResponse.json(
                    { message: "Forbidden. You do not own this conversation." },
                    { status: 403 }
                );
            }
            if (!conversation.userId) {
                conversation.userId = authUser.id as any;
            }
        }

        const recentMessages = conversation.messages
            .slice(-10)
            .map((message) => ({ role: message.role, content: message.content }));

        conversation.messages.push({
            role: "user",
            content: search_query,
            createdAt: new Date(),
        });

        const context = await buildConversationContext(recentMessages, search_query);

        const ragData = {
            question: context.rewrittenQuery,
            context: context.conversationContext,
            entities: context.entities,
            intent: context.intent,
        };

        const ragReq = await fetch(ragUri, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(ragData),
        });

        if (!ragReq.ok) {
            const errorText = await ragReq.text().catch(() => "");
            console.error("RAG request failed:", ragReq.status, ragReq.statusText, errorText);
            return NextResponse.json({ message: "RAG service failed" }, { status: 502 });
        }

        const ragResponse = await ragReq.json();
        const answer = typeof ragResponse.answer === "string" ? ragResponse.answer : "";
        const sources = Array.isArray(ragResponse.sources) ? ragResponse.sources : [];

        conversation.messages.push({
            role: "assistant",
            content: answer,
            sources,
            stopped: false,
            createdAt: new Date(),
        });

        if (conversation.title === "New Chat") {
            conversation.title =
                search_query.length > 50 ? `${search_query.slice(0, 47)}...` : search_query;
        }

        await conversation.save();

        return NextResponse.json(
            {
                search_query,
                conversationId,
                answer,
                sources,
                mode,
            },
            { status: 200 }
        );
    } catch (error) {
        console.error("Chat API error:", error);
        return NextResponse.json(
            { message: error instanceof Error ? error.message : "Internal server error" },
            { status: 500 }
        );
    }
}