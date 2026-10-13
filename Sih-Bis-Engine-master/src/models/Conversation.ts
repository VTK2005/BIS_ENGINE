import mongoose, { Document, Model, Schema } from "mongoose";

export type MessageRole = "user" | "assistant";

export interface ConversationMessage {
    role: MessageRole;
    content: string;
    sources?: any[];
    stopped?: boolean;
    createdAt: Date;
}

export interface IConversation extends Document {
    userId?: mongoose.Types.ObjectId;
    title: string;
    messages: ConversationMessage[];
    createdAt: Date;
    updatedAt: Date;
}

const MessageSchema = new Schema<ConversationMessage>(
    {
        role: {
            type: String,
            enum: ["user", "assistant"],
            required: true,
        },
        content: {
            type: String,
            required: true,
            trim: true,
        },
        sources: {
            type: [Schema.Types.Mixed],
            default: [],
        },
        stopped: {
            type: Boolean,
            default: false,
        },
        createdAt: {
            type: Date,
            default: Date.now,
        },
    },
    { _id: true }
);

const ConversationSchema = new Schema<IConversation>(
    {
        userId: {
            type: Schema.Types.ObjectId,
            ref: "User",
            index: true,
        },
        title: {
            type: String,
            default: "New Chat",
            trim: true,
        },
        messages: {
            type: [MessageSchema],
            default: [],
        },
    },
    { timestamps: true }
);

if (mongoose.models.Conversation && !mongoose.models.Conversation.schema.paths.userId) {
    delete mongoose.models.Conversation;
}

export const Conversation: Model<IConversation> =
    mongoose.models.Conversation ||
    mongoose.model<IConversation>("Conversation", ConversationSchema);