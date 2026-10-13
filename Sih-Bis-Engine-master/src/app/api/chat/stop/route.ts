import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Conversation } from "@/models/Conversation";
import { getAuthUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
    try {
        const authUser = await getAuthUser(req);
        const body = await req.json();
        const { conversationId, partialAnswer, sources } = body;

        if (!conversationId || typeof conversationId !== "string") {
            return NextResponse.json({ message: "conversationId is required" }, { status: 400 });
        }

        await connectDB();

        const conversation = await Conversation.findById(conversationId);
        if (!conversation) {
            return NextResponse.json({ message: "Conversation not found" }, { status: 404 });
        }

        if (authUser && conversation.userId && conversation.userId.toString() !== authUser.id) {
            return NextResponse.json({ message: "Forbidden" }, { status: 403 });
        }

        const stoppedContent = partialAnswer && partialAnswer.trim()
            ? `${partialAnswer.trim()}\n\n*[Response stopped by user]*`
            : "*[Response stopped by user before completion]*";

        conversation.messages.push({
            role: "assistant",
            content: stoppedContent,
            sources: sources || [],
            stopped: true,
            createdAt: new Date(),
        });

        await conversation.save();

        return NextResponse.json({
            success: true,
            message: "Stopped response saved",
        });
    } catch (error) {
        console.error("Save stopped response error:", error);
        return NextResponse.json({ message: "Failed to save stopped response" }, { status: 500 });
    }
}
