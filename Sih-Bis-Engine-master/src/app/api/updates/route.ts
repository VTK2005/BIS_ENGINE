import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import BisUpdate from "@/models/BisUpdate";

export const dynamic = "force-dynamic";


export async function GET() {
    try {
        await connectDB();
        const updates = await BisUpdate.aggregate([
            {
                $addFields: {
                    parsedPublishedDate: {
                        $dateFromString: {
                            dateString: "$publishedDate",
                            format: "%d %b, %Y",
                            onError: null,
                            onNull: null,
                        },
                    },
                },
            },
            { $sort: { parsedPublishedDate: -1, createdAt: -1 } },
            { $limit: 20 },
            { $project: { parsedPublishedDate: 0 } },
        ]);

        return NextResponse.json({
            success: true,
            updates,
        });
    } catch (error) {

        console.error("Fetch BIS updates error:", error);
        return NextResponse.json({
            success: false,
            error: "Failed to fetch updates"
        }, { status: 500 });
    }
}