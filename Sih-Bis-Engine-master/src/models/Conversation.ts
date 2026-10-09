import mongoose, { Document, Model, Schema } from "mongoose";

export type MessageRole = "user" | "assistant";

export interface ConversationMessage {
    role: MessageRole;
    content: string;
    createdAt: Date;
}

export interface IConversation
    extends Document {
    title: string;
    messages: ConversationMessage[];
    createdAt: Date;
    updatedAt: Date;
}

const MessageSchema = new Schema<ConversationMessage>({
    role: {
        type: String,
        enum: [
            "user",
            "assistant",
        ],
        required: true,
    },

    content: {
        type: String,
        required: true,
        trim: true,
    },

    createdAt: {
        type: Date,
        default: Date.now,
    },
}, { _id: true });

const ConversationSchema = new Schema<IConversation>({
    title: {
        type: String,
        default: "New Chat",
        trim: true,
    },

    messages: {
        type: [MessageSchema],
        default: [],
    },
}, { timestamps: true });

export const Conversation: Model<IConversation> = mongoose.models.Conversation || mongoose.model<IConversation>("Conversation", ConversationSchema);