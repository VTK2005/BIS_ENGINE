import mongoose, { Schema, Document, Model } from "mongoose";

export interface IBisUpdate extends Document {
    title: string;
    publishedDate: string;
    readMoreLink: string | null;
    downloadLink: string | null;
    type: string | null;
    size: string | null;
    source: string;
    scrapedAt: Date;
}

const BisUpdateSchema = new Schema<IBisUpdate>({
    title: {
        type: String,
        required: true,
        trim: true,
    },

    publishedDate: {
        type: String,
        required: true,
        trim: true,
    },

    readMoreLink: {
        type: String,
        default: null,
    },

    downloadLink: {
        type: String,
        default: null,
    },

    type: {
        type: String,
        default: null,
    },

    size: {
        type: String,
        default: null,
    },

    source: {
        type: String,
        default: "BIS",
    },

    scrapedAt: {
        type: Date,
        default: Date.now,
    },
}, { timestamps: true });


BisUpdateSchema.index({ 
    title: 1, 
    publishedDate: 1
}, { unique: true });

const BisUpdate: Model<IBisUpdate> = mongoose.models.BisUpdate || mongoose.model<IBisUpdate>("BisUpdate", BisUpdateSchema);
export default BisUpdate;