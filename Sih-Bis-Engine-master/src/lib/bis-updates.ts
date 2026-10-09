import { connectDB } from "@/lib/mongodb";
import BisUpdate from "@/models/BisUpdate";

export async function getLatestBisUpdates(limit = 3) {
    await connectDB();
    return BisUpdate.find({}).sort({ createdAt: -1 }).limit(limit).lean();
}