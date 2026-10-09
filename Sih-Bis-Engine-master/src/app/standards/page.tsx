"use client";

import { useState } from "react";
import { Search, ArrowRight, FileText, ExternalLink, Loader2, ShieldCheck } from "lucide-react";

interface Standard {
    id?: string;
    title: string;
    standardNumber?: string;
    publishedIn?: string | null;
    description?: string;
    url: string;
    category?: string;
}

export default function StandardsPage() {
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<Standard[]>([]);
    const [loading, setLoading] = useState(false);
    const [searched, setSearched] = useState(false);

    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault();

        const searchTerm = query.trim();
        if (!searchTerm || loading) return;

        setLoading(true);
        setSearched(true);

        try {
            const response = await fetch(`/api/standards/search?q=${encodeURIComponent(searchTerm)}`);

            if (!response.ok) {
                throw new Error("Failed to search standards");
            }

            const data = await response.json();
            setResults(data.results ?? []);
        } catch (error) {
            console.error(error);
            setResults([]);
        } finally {
            setLoading(false);
        }
    };

    const handlePopularSearch = (value: string) => { setQuery(value) };

    return (
        <main className="min-h-[calc(100vh-80px)] bg-white">
            {/* SEARCH AREA */}
            <section className={`border-b border-slate-200 bg-white transition-all duration-500 ${searched ? "py-6" : "min-h-130 py-24"}`} >
                <div className={`mx-auto flex w-full flex-col px-6 transition-all duration-500 ${searched ? "max-w-6xl" : "max-w-5xl items-center"}`} >
                    {/* Header */}
                    <div className={`flex transition-all duration-500 ${searched ? "items-center gap-4" : "flex-col items-center"}`} >
                        <div className={`flex shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-[#0b3c78] transition-all duration-500 ${searched ? "h-11 w-11 rounded-xl" : "h-16 w-16"}`} >
                            <FileText size={searched ? 23 : 32} strokeWidth={2} />
                        </div>

                        <div>
                            <h1 className={`font-extrabold tracking-tight text-[#0b3c78] transition-all duration-500 ${searched ? "text-2xl" : "mt-7 text-center text-5xl"}`}>
                                Find Indian Standards
                            </h1>

                            {!searched && (
                                <p className="mt-5 max-w-2xl text-center text-base leading-relaxed text-slate-600">
                                    Search for Indian Standards by standard
                                    number, product, material, technology or
                                    keyword.
                                </p>
                            )}
                        </div>
                    </div>

                    {/* Search */}
                    <form onSubmit={handleSearch} className={`w-full transition-all duration-500 ${searched ? "mt-5" : "mt-8 max-w-3xl"}`} >
                        <div
                            className={`
                                flex items-center border border-slate-300 bg-white transition-all duration-200 focus-within:border-[#0b3c78] focus-within:ring-4 focus-within:ring-blue-50 
                                ${searched ? "h-12 rounded-xl p-1" : "h-16 rounded-2xl p-2 shadow-lg shadow-slate-200/50"}`
                            }
                        >
                            <Search size={searched ? 20 : 24} className="ml-4 shrink-0 text-slate-400" />

                            <input
                                type="text"
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder="Search standards, e.g. IS 456, cement, steel, electrical..."
                                className={`h-full min-w-0 flex-1 bg-transparent px-4 text-slate-800 outline-none placeholder:text-slate-400 ${searched
                                        ? "text-sm"
                                        : "text-base"
                                    }`}
                            />

                            <button
                                type="submit"
                                disabled={loading}
                                className={`flex shrink-0 items-center gap-2 bg-[#0b3c78] font-semibold text-white transition-all duration-200 hover:bg-[#092f60] disabled:cursor-not-allowed disabled:opacity-60 
                                    ${searched ? "h-10 rounded-lg px-5 text-xs" : "h-12 rounded-md px-6 text-sm"
                                    }`}
                            >
                                {loading ? (
                                    <>
                                        <Loader2 size={16} className="animate-spin" />
                                        Searching
                                    </>
                                ) : (
                                    <>
                                        Search
                                        <ArrowRight size={16} />
                                    </>
                                )}
                            </button>
                        </div>
                    </form>

                    {/* Initial state only */}
                    {!searched && (
                        <>
                            <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
                                <span className="mr-1 text-xs text-slate-500">
                                    Popular:
                                </span>

                                {[
                                    "IS 456",
                                    "IS 875",
                                    "Cement",
                                    "Steel",
                                    "Food Safety",
                                ].map((item) => (
                                    <button
                                        key={item}
                                        type="button"
                                        onClick={() => handlePopularSearch(item)}
                                        className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-600 transition hover:border-blue-200 hover:bg-blue-50 hover:text-[#0b3c78]"
                                    >
                                        {item}
                                    </button>
                                ))}
                            </div>

                            <div className="mt-6 flex items-center gap-2 text-xs text-slate-400">
                                <ShieldCheck size={14} className="text-emerald-500" />
                                Results sourced from official BIS Standards
                            </div>
                        </>
                    )}
                </div>
            </section>

            {/* RESULTS */}
            {searched && (
                <section className="mx-auto w-full max-w-6xl px-6 py-8">

                    <div className="mb-5">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-slate-400">
                            Search Results
                        </p>

                        <div className="mt-1 flex items-center justify-between">
                            <div>
                                <h2 className="text-2xl font-bold text-slate-900">
                                    {loading ? "Searching..." : results.length > 0 ? `${results.length} standards found` : "No standards found"}
                                </h2>

                                {!loading && query && (
                                    <p className="mt-1 text-sm text-slate-500">
                                        Results for{" "}
                                        <span className="font-medium text-slate-700">
                                            "{query}"
                                        </span>
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Loading */}
                    {loading && (
                        <div className="flex min-h-70 items-center justify-center rounded-2xl border border-slate-200 bg-white">
                            <div className="flex flex-col items-center gap-3">
                                <Loader2 size={28} className="animate-spin text-[#0b3c78]" />

                                <p className="text-sm text-slate-500">
                                    Searching official BIS records...
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Empty */}
                    {!loading && results.length === 0 && (
                        <div className="flex min-h-70 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white px-6 text-center">
                            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100">
                                <Search size={24} className="text-slate-400" />
                            </div>

                            <h3 className="mt-4 text-base font-semibold text-slate-800">
                                No matching standards found
                            </h3>

                            <p className="mt-2 max-w-md text-sm text-slate-500">
                                Try a standard number, product name,
                                material, or a broader keyword.
                            </p>
                        </div>
                    )}

                    {/* Results */}
                    {!loading && results.length > 0 && (
                        <div className="space-y-3">
                            {results.map((standard, index) => (
                                <a
                                    key={standard.id || standard.standardNumber || `${standard.title}-${index}`}
                                    href={standard.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="group block rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md"
                                >
                                    <div className="flex items-start gap-4">
                                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-[#0b3c78] transition-colors group-hover:bg-blue-100">
                                            <FileText size={21} strokeWidth={2} />
                                        </div>

                                        <div className="min-w-0 flex-1">
                                            <div className="flex flex-wrap items-center gap-2">
                                                {standard.standardNumber && (
                                                    <span className="rounded-md bg-blue-50 px-2.5 py-1 text-[11px] font-bold text-[#0b3c78]">
                                                        {standard.standardNumber}
                                                    </span>
                                                )}

                                                {standard.category && (
                                                    <span className="rounded-md bg-slate-100 px-2.5 py-1 text-[11px] text-slate-600">
                                                        {standard.category}
                                                    </span>
                                                )}

                                                {standard.publishedIn && (
                                                    <span className="rounded-md bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700">
                                                        Published: {standard.publishedIn}
                                                    </span>
                                                )}
                                            </div>

                                            <h3 className="mt-2 text-sm font-semibold leading-relaxed text-slate-900 transition-colors group-hover:text-[#0b3c78] md:text-base">
                                                {standard.title}
                                            </h3>

                                            {standard.description && (
                                                <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-slate-500">
                                                    {standard.description}
                                                </p>
                                            )}

                                            <div className="mt-3 flex items-center gap-2 text-[11px] font-semibold text-[#0b3c78]">
                                                View official BIS record
                                                <ExternalLink size={12} />
                                            </div>
                                        </div>

                                        {/* Arrow */}
                                        <ArrowRight
                                            size={19}
                                            className="mt-2 shrink-0 text-slate-300 transition-all duration-200 group-hover:translate-x-1 group-hover:text-[#0b3c78]"
                                        />
                                    </div>
                                </a>
                            ))}
                        </div>
                    )}
                </section>
            )}
        </main>
    );
}