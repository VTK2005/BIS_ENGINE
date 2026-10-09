"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, Bell, CalendarDays, ExternalLink, Loader2, RefreshCw } from "lucide-react";

interface BisUpdate {
    _id?: string;
    title: string;
    publishedDate?: string;
    publishedAt?: string;
    downloadLink?: string;
    readMoreLink?: string;
    type?: string;
    description?: string;
    size?: string;
    source?: string;
    createdAt?: string;
}

interface UpdatesResponse {
    success: boolean;
    updates: BisUpdate[];
    error?: string;
}

export default function UpdatesPage() {
    const [updates, setUpdates] = useState<BisUpdate[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    async function fetchUpdates() {
        try {
            setLoading(true);
            setError("");

            const response = await fetch("/api/updates", { cache: "no-store" });
            const data: UpdatesResponse = await response.json();

            if (!response.ok || !data.success) {
                throw new Error(data.error || "Failed to fetch updates.");
            }

            setUpdates(data.updates || []);
        } catch (error) {
            console.error("Failed to fetch updates:", error);
            setError(error instanceof Error ? error.message : "Something went wrong while loading updates.");
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        fetchUpdates();
    }, []);

    const featuredUpdate = updates[0];
    const remainingUpdates = updates.slice(1);

    return (
        <main className="min-h-screen bg-white text-[#17395f]">
            {/* HEADER */}
            <section className="border-b border-[#17395f]/10 bg-[#f4f8fc]">
                <div className="mx-auto max-w-6xl px-6 py-16 sm:py-20">
                    <div className="flex items-start justify-between gap-8">
                        {/* Heading */}
                        <div className="max-w-3xl">
                            <div className="mb-5 flex items-center gap-3">
                                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-[#0f4c81] shadow-sm">
                                    <Bell size={20} strokeWidth={2} />
                                </div>
                                <span className="text-sm font-semibold uppercase tracking-[0.16em] text-[#5f7c98]">
                                    BIS Updates
                                </span>
                            </div>

                            <h1 className="text-4xl font-semibold leading-tight tracking-tight text-[#12365d] sm:text-5xl">
                                Latest updates
                            </h1>

                            <p className="mt-4 max-w-2xl text-base leading-7 text-[#607b96]">
                                Stay up to date with notices,
                                announcements, new standards
                                and other information published
                                by the Bureau of Indian Standards.
                            </p>
                        </div>

                        {/* Refresh */}
                        <button
                            type="button"
                            onClick={fetchUpdates}
                            disabled={loading}
                            className="hidden shrink-0 items-center gap-2 rounded-lg border border-[#17395f]/10 bg-white px-4 py-2.5 text-sm font-semibold text-[#355b7e] shadow-sm transition hover:bg-[#edf5fb] disabled:cursor-not-allowed disabled:opacity-50 sm:flex"
                        >
                            <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
                            Refresh
                        </button>
                    </div>
                </div>
            </section>

            {/* CONTENT */}
            <section className="mx-auto max-w-6xl px-6 py-12 sm:py-16">
                {/* LOADING */}
                {loading && (
                    <div className="flex min-h-105 items-center justify-center">
                        <div className="flex items-center gap-3 text-sm text-[#70879c]">
                            <Loader2 size={19} className="animate-spin text-[#0f4c81]" />
                            Loading latest BIS updates...
                        </div>
                    </div>
                )}

                {/* ERROR */}
                {!loading && error && (
                    <div className="rounded-2xl border border-red-200 bg-red-50 px-6 py-10 text-center">
                        <p className="text-sm font-semibold text-red-700">
                            Unable to load updates
                        </p>

                        <p className="mt-2 text-sm text-red-600/80">
                            {error}
                        </p>

                        <button type="button" onClick={fetchUpdates}
                            className="mt-5 inline-flex items-center gap-2 rounded-lg bg-[#0f4c81] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#0b3e6a]"
                        >
                            Try again
                            <RefreshCw size={15} />
                        </button>

                    </div>
                )}

                {/* EMPTY */}

                {!loading && !error && updates.length === 0 && (
                    <div className="rounded-2xl border border-[#17395f]/10 bg-[#f8fbfd] px-6 py-20 text-center">
                        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#edf5fb] text-[#0f4c81]">
                            <Bell size={22} />
                        </div>

                        <h2 className="mt-5 text-lg font-semibold text-[#17395f]">
                            No updates available
                        </h2>

                        <p className="mt-2 text-sm text-[#6c849a]">
                            Check back later for the
                            latest BIS announcements.
                        </p>
                    </div>
                )}

                {/* ACTUAL CONTENT */}
                {!loading && !error && featuredUpdate && (
                    <>
                        {/* MOST RECENT HEADER */}
                        <div className="mb-5 flex items-center justify-between">
                            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#7892a9]">
                                Most recent
                            </p>
                        </div>

                        {/* FEATURED */}
                        <article className="overflow-hidden rounded-2xl border border-[#17395f]/10 bg-[#123f6c] shadow-[0_12px_35px_rgba(23,57,95,0.08)]">
                            <div className="grid lg:grid-cols-[190px_1fr]">
                                {/* DATE */}
                                <div className="border-b border-white/10 bg-[#0f4c81] px-7 py-7 lg:border-b-0 lg:border-r">
                                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/60">
                                        Published
                                    </p>

                                    <div className="mt-4">
                                        {formatDateParts(featuredUpdate.publishedDate || featuredUpdate.publishedAt)}
                                    </div>

                                </div>

                                {/* CONTENT */}
                                <div className="p-7 sm:p-9">
                                    {/* Tags */}
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold text-white/80">
                                            <Bell size={12} />
                                            BIS Update
                                        </span>

                                        {featuredUpdate.type && (
                                            <span className="rounded-full border border-white/15 px-3 py-1 text-[11px] font-medium uppercase text-white/65">
                                                {featuredUpdate.type}
                                            </span>
                                        )}

                                        {featuredUpdate.size && (
                                            <span className="rounded-full border border-white/15 px-3 py-1 text-[11px] font-medium text-white/65">
                                                {featuredUpdate.size}
                                            </span>
                                        )}

                                    </div>

                                    {/* Title */}
                                    {getUpdateUrl(featuredUpdate) ? (
                                        <a
                                            href={getUpdateUrl(featuredUpdate)}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="group block"
                                        >

                                            <h2 className="mt-5 max-w-4xl text-2xl font-semibold leading-tight tracking-tight text-white transition-opacity group-hover:opacity-80 sm:text-3xl lg:text-4xl">
                                                {featuredUpdate.title}
                                            </h2>

                                        </a>
                                    ) : (
                                        <h2 className="mt-5 max-w-4xl text-2xl font-semibold leading-tight tracking-tight text-white sm:text-3xl lg:text-4xl">{featuredUpdate.title}</h2>
                                    )}

                                    {/* Description */}
                                    {featuredUpdate.description && (
                                        <p className="mt-4 max-w-2xl text-sm leading-7 text-white/65">
                                            {featuredUpdate.description}
                                        </p>
                                    )}

                                    {/* Action */}
                                    {getUpdateUrl(featuredUpdate) && (
                                        <a
                                            href={getUpdateUrl(featuredUpdate)}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="mt-7 inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-[#17395f] transition hover:bg-[#edf5fb]"
                                        >
                                            {featuredUpdate.type === "pdf" ? "Open PDF" : "Read official update"}
                                            <ExternalLink size={15} />
                                        </a>
                                    )}
                                </div>
                            </div>
                        </article>

                        {/* EARLIER */}

                        {remainingUpdates.length > 0 && (
                            <div className="mt-14">
                                <div className="mb-2 flex items-center justify-between border-b border-[#17395f]/10 pb-4">
                                    <h2 className="text-xl font-semibold text-[#17395f]">
                                        Earlier updates
                                    </h2>

                                    <span className="text-sm text-[#7990a5]">
                                        {remainingUpdates.length}{" "}
                                        updates
                                    </span>
                                </div>

                                <div className="divide-y divide-[#17395f]/10">
                                    {remainingUpdates.map((update, index) => (<UpdateRow key={update._id || `${update.title}-${index}`} update={update} />))}
                                </div>
                            </div>
                        )}
                    </>
                )}
            </section>
        </main>
    );
}

/* UPDATE ROW */

function UpdateRow({ update }: { update: BisUpdate }) {
    const url = getUpdateUrl(update);

    const content = (
        <div className="grid gap-5 sm:grid-cols-[145px_1fr_auto] sm:items-start">
            {/* DATE */}
            <div className="flex items-center gap-2 text-sm text-[#7890a6] sm:block">
                <CalendarDays size={15} className="text-[#9aabbb] sm:mb-2" />
                <div>
                    {formatDate(update.publishedDate || update.publishedAt)}
                </div>
            </div>

            {/* CONTENT */}
            <div>
                <div className="flex items-start gap-3">
                    <div className="mt-2 h-2 w-2 shrink-0 rounded-full bg-[#0f4c81]" />
                    <h3 className="text-base font-semibold leading-7 text-[#17395f] transition-colors group-hover:text-[#0f4c81]">
                        {update.title}
                    </h3>
                </div>

                {update.description && (
                    <p className="mt-2 max-w-2xl pl-5 text-sm leading-6 text-[#71889e]">
                        {update.description}
                    </p>
                )}
            </div>

            {/* ACTION */}
            {url && (
                <div className="ml-5 mt-1 inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold text-[#0f4c81] opacity-70 transition group-hover:opacity-100">
                    {update.type === "pdf" ? "Open PDF" : "View"}
                    <ArrowUpRight size={15} className="transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                </div>
            )}
        </div>
    );

    if (!url) {
        return (
            <article className="group py-7 first:pt-2">
                {content}
            </article>
        );
    }

    return (
        <a href={url} target="_blank" rel="noopener noreferrer" className="group block py-7 first:pt-2" >
            {content}
        </a>
    );
}

function getUpdateUrl(update: BisUpdate) {
    return (update.readMoreLink || update.downloadLink || "");
}

function parseBisDate(value?: string) {
    if (!value) {
        return null;
    }

    const match = value.match(/^(\d{1,2})\s+([A-Za-z]{3}),\s+(\d{4})$/);

    if (!match) {
        return null;
    }

    const [, day, month, year] = match;
    const monthMap: Record<string, number> = {
        Jan: 0,
        Feb: 1,
        Mar: 2,
        Apr: 3,
        May: 4,
        Jun: 5,
        Jul: 6,
        Aug: 7,
        Sep: 8,
        Oct: 9,
        Nov: 10,
        Dec: 11,
    };

    const monthIndex = monthMap[month.substring(0, 1).toUpperCase() + month.substring(1).toLowerCase()];

    if (monthIndex === undefined) {
        return null;
    }

    return new Date(Number(year), monthIndex, Number(day));
}


function formatDate(date?: string) {
    if (!date) {
        return "Date unavailable";
    }

    const parsed = parseBisDate(date);

    if (!parsed) {
        return date;
    }

    return parsed.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
    },
    );
}

function formatDateParts(date?: string) {
    if (!date) {
        return (
            <div>
                <div className="text-3xl font-bold tracking-tight text-white">
                    --
                </div>

                <div className="mt-1 text-xs uppercase tracking-[0.14em] text-white/55">
                    Date unavailable
                </div>
            </div>
        );
    }

    const parsed = parseBisDate(date);

    if (!parsed) {
        return (
            <div>
                <div className="text-lg font-semibold text-white">
                    {date}
                </div>
            </div>
        );
    }

    const day = parsed.toLocaleDateString("en-IN", { day: "2-digit" });
    const month = parsed.toLocaleDateString("en-IN", { month: "short" });

    const year = parsed.toLocaleDateString("en-IN", { year: "numeric" });

    return (
        <div>
            <div className="text-4xl font-bold leading-none tracking-tight text-white">
                {day}
            </div>

            <div className="mt-1 text-sm font-semibold uppercase tracking-[0.12em] text-white/75">
                {month} {year}
            </div>
        </div>
    );
}