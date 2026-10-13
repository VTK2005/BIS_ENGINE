import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Conversation } from "@/models/Conversation";
import { getAuthUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

type RouteParams = {
    params: Promise<{ id: string }>;
};

// GET /api/chat/conversations/[id] - Fetch single conversation with messages
export async function GET(req: NextRequest, props: RouteParams) {
    try {
        const { id } = await props.params;
        const authUser = await getAuthUser(req);

        if (!authUser) {
            return NextResponse.json(
                { success: false, message: "Unauthorized. Please log in." },
                { status: 401 }
            );
        }

        await connectDB();

        const conversation = await Conversation.findById(id);
        if (!conversation) {
            return NextResponse.json(
                { success: false, message: "Conversation not found" },
                { status: 404 }
            );
        }

        // Enforce user isolation: prevent one user from reading another user's conversation
        if (conversation.userId && conversation.userId.toString() !== authUser.id) {
            return NextResponse.json(
                { success: false, message: "Forbidden. You do not own this conversation." },
                { status: 403 }
            );
        }

        return NextResponse.json({
            success: true,
            conversation: {
                id: conversation._id.toString(),
                title: conversation.title,
                messages: conversation.messages,
                createdAt: conversation.createdAt,
                updatedAt: conversation.updatedAt,
            },
        });
    } catch (error) {
        console.error("Get conversation error:", error);
        return NextResponse.json(
            { success: false, message: "Failed to load conversation" },
            { status: 500 }
        );
    }
}

// PATCH /api/chat/conversations/[id] - Rename conversation
export async function PATCH(req: NextRequest, props: RouteParams) {
    try {
        const { id } = await props.params;
        const authUser = await getAuthUser(req);

        if (!authUser) {
            return NextResponse.json(
                { success: false, message: "Unauthorized. Please log in." },
                { status: 401 }
            );
        }

        const body = await req.json();
        const { title } = body;

        if (!title || typeof title !== "string" || !title.trim()) {
            return NextResponse.json(
                { success: false, message: "Title is required" },
                { status: 400 }
            );
        }

        await connectDB();

        const conversation = await Conversation.findById(id);
        if (!conversation) {
            return NextResponse.json(
                { success: false, message: "Conversation not found" },
                { status: 404 }
            );
        }

        // Enforce ownership
        if (conversation.userId && conversation.userId.toString() !== authUser.id) {
            return NextResponse.json(
                { success: false, message: "Forbidden. You do not own this conversation." },
                { status: 403 }
            );
        }

        conversation.title = title.trim();
        await conversation.save();

        return NextResponse.json({
            success: true,
            title: conversation.title,
        });
    } catch (error) {
        console.error("Rename conversation error:", error);
        return NextResponse.json(
            { success: false, message: "Failed to rename conversation" },
            { status: 500 }
        );
    }
}

// DELETE /api/chat/conversations/[id] - Delete conversation
export async function DELETE(req: NextRequest, props: RouteParams) {
    try {
        const { id } = await props.params;
        const authUser = await getAuthUser(req);

        if (!authUser) {
            return NextResponse.json(
                { success: false, message: "Unauthorized. Please log in." },
                { status: 401 }
            );
        }

        await connectDB();

        const conversation = await Conversation.findById(id);
        if (!conversation) {
            return NextResponse.json(
                { success: false, message: "Conversation not found" },
                { status: 404 }
            );
        }

        // Enforce ownership
        if (conversation.userId && conversation.userId.toString() !== authUser.id) {
            return NextResponse.json(
                { success: false, message: "Forbidden. You do not own this conversation." },
                { status: 403 }
            );
        }

        await Conversation.findByIdAndDelete(id);

        return NextResponse.json({
            success: true,
            message: "Conversation deleted successfully",
        });
    } catch (error) {
        console.error("Delete conversation error:", error);
        return NextResponse.json(
            { success: false, message: "Failed to delete conversation" },
            { status: 500 }
        );
    }
}
