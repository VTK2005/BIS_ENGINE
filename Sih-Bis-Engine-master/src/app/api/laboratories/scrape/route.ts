import { NextRequest, NextResponse } from "next/server";
import { scrapeBisLaboratories } from "@/lib/scraper/bisLaboratories";

export const dynamic = "force-dynamic";


export async function GET(request: NextRequest) {
    try {
        const authHeader = request.headers.get("authorization");
        const cronSecret = process.env.CRON_SECRET;

        if (!cronSecret) {
            return NextResponse.json({
                success: false,
                message: "CRON_SECRET is not configured."
            }, { status: 500 });
        }

        if (authHeader !== `Bearer ${cronSecret}`) {
            return NextResponse.json({
                success: false,
                message: "Unauthorized."
            }, { status: 401 });
        }

        const laboratories = await scrapeBisLaboratories();

        return NextResponse.json({
            success: true,
            count: laboratories.length,
            results: laboratories
        });

    } catch (error) {
        console.error("[API] Laboratory scrape failed:", error);
        return NextResponse.json({
            success: false,
            message: error instanceof Error
                ? error.message
                : "Failed to scrape BIS laboratories."
        }, { status: 500 });

    }
}