import { NextRequest, NextResponse } from "next/server";
import { scrapeBisStandards } from "@/lib/scraper/bis-standard";

export const runtime = "nodejs";


export async function GET(request: NextRequest) {
    try {
        const searchTerm = request.nextUrl.searchParams.get("q")?.trim();
        if (!searchTerm) {
            return NextResponse.json({
                success: false,
                error: "Search term is required"
            }, { status: 400 });
        }

        const results = await scrapeBisStandards(searchTerm);
        return NextResponse.json({
            success: true,
            query: searchTerm,
            count: results.length,
            results
        });

    } catch (error) {
        console.error("BIS standards scraper error:", error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error
                ? error.message
                : "Failed to scrape BIS standards"
        }, { status: 500 });

    }
}