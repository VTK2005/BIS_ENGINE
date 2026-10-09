import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Conversation } from "@/models/Conversation";


export async function POST() {
    try {
        await connectDB();
        const conversation = await Conversation.create({
            title: "New Chat",
            messages: [],
        });
        return NextResponse.json({
            success: true,
            conversationId: conversation._id.toString(),
            title: conversation.title,
        }, { status: 201 });

    } catch (error) {
        console.error("Create conversation error:", error);
        return NextResponse.json({
            success: false,
            message: "Failed to create conversation"
        }, { status: 500 });
    }
}