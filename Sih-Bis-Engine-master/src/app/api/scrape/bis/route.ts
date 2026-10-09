import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { scrapeBisUpdates, ScrapedBisUpdate } from "@/lib/scraper/bis";
import BisUpdate from "@/models/BisUpdate";

export const runtime = "nodejs";


export async function GET(request: NextRequest) {
    try {
        const authHeader = request.headers.get("authorization");
        const expectedToken = process.env.CRON_SECRET;
        
        if (!expectedToken) {
            return NextResponse.json({
                success: false,
                error: "CRON_SECRET is not configured"
            }, { status: 500 });
        }

        if (authHeader !== `Bearer ${expectedToken}`) {
            return NextResponse.json({
                success: false,
                error: "Unauthorized"
            }, { status: 401 });
        }

        await connectDB();
        const updates: ScrapedBisUpdate[] = await scrapeBisUpdates();

        if (updates.length === 0) {
            return NextResponse.json({
                success: true,
                message: "Scraper completed but found no updates.",
                scraped: 0,
                inserted: 0,
                updated: 0
            });
        }

        let inserted = 0;
        let updated = 0;
        for (const update of updates) {
            const result = await BisUpdate.updateOne(
                {
                    title: update.title,
                    publishedDate: update.publishedDate,
                },
                {
                    $set: {
                        title: update.title,
                        publishedDate: update.publishedDate,
                        readMoreLink: update.readMoreLink,
                        downloadLink: update.downloadLink,
                        type: update.type,
                        size: update.size,
                        source: "BIS",
                        scrapedAt: new Date(),
                    },
                },
                { upsert: true }
            );

            if (result.upsertedCount > 0) {
                inserted++;
            } else if (result.modifiedCount > 0) {
                updated++;
            }
        }

        return NextResponse.json({
            success: true,
            scraped: updates.length,
            inserted,
            updated,
            timestamp: new Date().toISOString()
        });

    } catch (error) {

        console.error("BIS scraper error:", error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error
                ? error.message
                : "Unknown scraper error"
        }, { status: 500 });
        
    }
}