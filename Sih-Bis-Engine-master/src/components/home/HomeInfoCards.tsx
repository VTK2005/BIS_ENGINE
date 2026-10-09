"use client";

import Link from "next/link";
import { Bell, ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";

interface BisUpdate {
    _id: string;
    title: string;
    publishedDate: string;
    readMoreLink: string | null;
    downloadLink: string | null;
    type: string | null;
    size: string | null;
}

function getDateParts(dateString: string) {
    const parts = dateString.trim().split(/\s+/);

    return {
        day: parts[0] ?? "",
        month: parts[1]?.replace(",", "").toUpperCase() ?? ""
    };
}

function getTypeStyles(type: string | null) {
    switch (type?.toLowerCase()) {
        case "pdf":
            return "bg-red-100 text-red-700";

        case "youtube":
            return "bg-red-100 text-red-700";

        default:
            return "bg-blue-100 text-blue-700";
    }
}

const HomeInfoCards = () => {
    const [updates, setUpdates] = useState<BisUpdate[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchUpdates() {
            try {
                const response = await fetch("/api/updates");

                if (!response.ok) {
                    throw new Error("Failed to fetch updates");
                }

                const data = await response.json();
                setUpdates(data.updates ?? []);
            } catch (error) {
                console.error("Failed to load updates:", error);
            } finally {
                setLoading(false);
            }
        }

        fetchUpdates();
    }, []);

    return (
        <section className="w-full bg-white px-6 pb-4 pt-2">
            <div className="mx-auto grid w-full max-w-375 grid-cols-1 gap-4 lg:grid-cols-[1fr_1.2fr_1fr]">
                <div className="relative h-62 overflow-hidden rounded-2xl border border-slate-200 bg-[#f3f4f8]">
                    <img
                        src="/chat_mini_left.jpg"
                        alt="Standards build trust, trust builds progress."
                        className="h-full w-full object-contain"
                    />
                </div>

                {/* Latest Updates */}
                <div className="h-62 rounded-2xl border border-slate-200 bg-white px-5 py-5 shadow-sm">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Bell size={17} className="text-[#0b3c78]" strokeWidth={2.5} />
                            <h2 className="text-sm font-bold text-[#0b3c78]">Latest Updates</h2>
                        </div>

                        <Link
                            href="/updates"
                            className="flex items-center gap-1 text-[10px] font-medium text-blue-700 transition hover:text-blue-900"
                        >
                            View All
                            <ArrowRight size={12} />
                        </Link>
                    </div>

                    <div className="mt-4 divide-y divide-slate-100">
                        {loading ? (
                            <div className="py-8 text-center">
                                <p className="text-xs text-slate-500">
                                    Loading updates...
                                </p>
                            </div>
                        ) : updates.length === 0 ? (
                            <div className="py-8 text-center">
                                <p className="text-xs text-slate-500">
                                    No updates available.
                                </p>
                            </div>
                        ) : (
                            updates.slice(0, 3).map((update) => {
                                const { day, month } = getDateParts(update.publishedDate);
                                return (
                                    <div key={update._id} className="flex items-center gap-3 py-3 first:pt-1 last:pb-1" >

                                        <div className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-md border border-slate-200 bg-slate-50">
                                            <span className="text-sm font-bold leading-none text-slate-700">
                                                {day}
                                            </span>

                                            <span className="mt-0.5 text-[8px] font-semibold text-slate-500">
                                                {month}
                                            </span>
                                        </div>

                                        {/* Title */}
                                        {update.readMoreLink ? (
                                            <a
                                                href={update.readMoreLink}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="max-w-100 flex-1 text-[11px] leading-relaxed text-slate-700 transition hover:text-blue-700 truncate"
                                            >
                                                {update.title}
                                            </a>
                                        ) : (
                                            <p className="min-w-0 flex-1 text-[11px] leading-relaxed text-slate-700">
                                                {update.title}
                                            </p>
                                        )}

                                        {update.type && (
                                            <span className={`shrink-0 rounded-full px-2.5 py-1 text-[9px] font-medium ${getTypeStyles(update.type)}`} >
                                                {update.type}
                                            </span>
                                        )}
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>

                <div className="relative h-62 overflow-hidden rounded-2xl border border-slate-200 bg-[#fbfcf8]">
                    <div className="relative z-10 flex h-full flex-col px-7 py-6">
                        <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-orange-50">
                                <div className="overflow-hidden rounded-sm">
                                    <img src="/indian_flag.jpg" alt="Indian flag" className="w-full" />
                                </div>
                            </div>

                            <h2 className="text-[15px] font-bold text-slate-800">
                                Building a Quality India
                            </h2>
                        </div>

                        <p className="mt-5 max-w-75 text-[11px] leading-[1.7] text-slate-700">
                            BIS works towards a safe, sustainable and
                            self-reliant India through standardization,
                            conformity assessment and quality culture.
                        </p>

                        <Link
                            href="/about"
                            className="mt-auto flex w-fit items-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2 text-[10px] font-semibold text-slate-700 shadow-sm transition-all duration-200 hover:border-slate-400 hover:shadow-md"
                        >
                            Know More
                            <ArrowRight size={13} />
                        </Link>
                    </div>

                    <div className="pointer-events-none absolute -bottom-16 -right-10 h-40 w-40 rounded-full bg-green-100/60 blur-2xl" />
                </div>
            </div>
        </section>
    );
};

export default HomeInfoCards;