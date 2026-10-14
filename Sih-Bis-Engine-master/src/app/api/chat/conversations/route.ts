import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Conversation } from "@/models/Conversation";
import { getAuthUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET /api/chat/conversations - List conversations for authenticated user
export async function GET(req: NextRequest) {
    try {
        const authUser = await getAuthUser(req);
        if (!authUser) {
            return NextResponse.json(
                { success: false, message: "Unauthorized. Please log in." },
                { status: 401 }
            );
        }

        await connectDB();

        // Enforce user isolation: only fetch conversations belonging to this user
        const conversations = await Conversation.find({
            userId: authUser.id,
            "messages.0": { $exists: true },
        })
            .sort({ updatedAt: -1 })
            .select("_id title updatedAt createdAt messages")
            .lean();

        const formatted = conversations.map((c: any) => ({
            id: c._id.toString(),
            title: c.title || "New Chat",
            updatedAt: c.updatedAt,
            createdAt: c.createdAt,
            messageCount: c.messages?.length || 0,
            lastMessage: c.messages && c.messages.length > 0
                ? c.messages[c.messages.length - 1].content.slice(0, 60)
                : "",
        }));

        return NextResponse.json({
            success: true,
            conversations: formatted,
        });
    } catch (error) {
        console.error("Fetch conversations error:", error);
        return NextResponse.json(
            { success: false, message: "Failed to fetch conversations" },
            { status: 500 }
        );
    }
}

// POST /api/chat/conversations - Create new conversation for authenticated user
export async function POST(req: NextRequest) {
    try {
        const authUser = await getAuthUser(req);
        if (!authUser) {
            return NextResponse.json(
                { success: false, message: "Unauthorized. Please log in." },
                { status: 401 }
            );
        }

        let title = "New Chat";
        try {
            const body = await req.json();
            if (body && typeof body.title === "string" && body.title.trim()) {
                title = body.title.trim();
            }
        } catch {
            // Body was empty or not JSON, default to "New Chat"
        }

        await connectDB();

        const conversation = await Conversation.create({
            userId: authUser.id,
            title,
            messages: [],
        });

        return NextResponse.json(
            {
                success: true,
                conversationId: conversation._id.toString(),
                title: conversation.title,
            },
            { status: 201 }
        );
    } catch (error) {
        console.error("Create conversation error:", error);
        return NextResponse.json(
            { success: false, message: "Failed to create conversation" },
            { status: 500 }
        );
    }
}
