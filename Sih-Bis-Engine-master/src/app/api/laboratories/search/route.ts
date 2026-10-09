import { NextRequest, NextResponse } from "next/server";
import { scrapeBisLaboratories } from "@/lib/scraper/bisLaboratories";

export const dynamic = "force-dynamic";


export async function GET(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams;
        const name = searchParams.get("name")?.trim() || "";
        const state = searchParams.get("state")?.trim() || "";
        const district = searchParams.get("district")?.trim() || "";

        if (!name && !state && !district) {
            return NextResponse.json({
                success: false,
                message: "Please provide a laboratory name, state, or district.",
                results: []
            }, { status: 400 });
        }

        const laboratories = await scrapeBisLaboratories({name, state, district });

        return NextResponse.json({
            success: true,
            count: laboratories.length,
            results: laboratories
        });

    } catch (error) {

        console.error("[API] Laboratory search failed:", error);
        return NextResponse.json({
            success: false,
            message: error instanceof Error
                ? error.message
                : "Failed to fetch BIS laboratory data.",
            results: []
        }, { status: 500 });
        
    }
}