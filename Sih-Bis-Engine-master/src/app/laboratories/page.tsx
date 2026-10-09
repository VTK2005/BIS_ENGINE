"use client";

import { FormEvent, useState } from "react";

import { ArrowUpRight, Building2, FlaskConical, Loader2, Mail, MapPin, Phone, Search } from "lucide-react";

interface Laboratory {
    id: string;
    labCode: string;
    name: string;
    address: string;
    contactPerson: string;
    contactNumber: string;
    email: string;
    imageUrl: string;
    scopeUrl: string;
}

interface ApiResponse {
    success: boolean;
    count?: number;
    results: Laboratory[];
    message?: string;
}

export default function LaboratoriesPage() {
    const [query, setQuery] = useState("");
    const [state, setState] = useState("");
    const [district, setDistrict] = useState("");

    const [results, setResults] = useState<Laboratory[]>([]);
    const [searched, setSearched] = useState(false);

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    async function handleSearch(event?: FormEvent<HTMLFormElement>) {
        event?.preventDefault();

        const params = new URLSearchParams();

        if (query.trim()) {
            params.set("name", query.trim());
        }

        if (state.trim()) {
            params.set("state", state.trim());
        }

        if (district.trim()) {
            params.set("district", district.trim());
        }

        if (!params.toString()) {
            setError("Enter a laboratory name or select a location.");
            return;
        }

        try {
            setLoading(true);
            setError("");
            setSearched(true);

            const response = await fetch(`/api/laboratories/search?${params.toString()}`);
            const data: ApiResponse = await response.json();

            if (!response.ok || !data.success) {
                throw new Error(data.message || "Unable to fetch laboratory data.");
            }

            setResults(data.results || []);
        } catch (err) {
            console.error(err);
            setResults([]);
            setError(err instanceof Error ? err.message : "Something went wrong while searching.");
        } finally {
            setLoading(false);
        }
    }

    function handleReset() {
        setQuery("");
        setState("");
        setDistrict("");
        setResults([]);
        setSearched(false);
        setError("");
    }

    return (
        <main className="min-h-screen bg-white text-[#17395f]">
            {/* HERO / SEARCH */}
            <section className={`border-b border-[#17395f]/10 transition-all duration-500 ${searched ? "bg-white py-7" : "bg-[#f4f8fc] py-20 sm:py-24"}`}>
                <div className="mx-auto w-full max-w-6xl px-6">
                    {!searched && (
                        <div className="mb-10 max-w-3xl">
                            <div className="mb-5 flex items-center gap-3">
                                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#0f4c81]/15 bg-white text-[#0f4c81]">
                                    <FlaskConical size={20} />
                                </div>

                                <span className="text-sm font-semibold uppercase tracking-[0.16em] text-[#37648f]">
                                    BIS Laboratories
                                </span>
                            </div>

                            <h1 className="text-4xl font-semibold leading-tight tracking-tight text-[#12365d] sm:text-5xl">
                                Find a BIS laboratory
                            </h1>

                            <p className="mt-4 max-w-2xl text-base leading-7 text-[#607b96]">
                                Search Bureau of Indian Standards laboratories
                                by laboratory name, state or district.
                            </p>
                        </div>
                    )}

                    {searched && (
                        <div className="mb-5 flex items-center gap-3">
                            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#edf5fb] text-[#0f4c81]">
                                <FlaskConical size={18} />
                            </div>

                            <h1 className="text-xl font-semibold text-[#17395f]">
                                BIS Laboratories
                            </h1>
                        </div>
                    )}

                    {/* SEARCH BOX */}
                    <form onSubmit={handleSearch} className="rounded-2xl border border-[#17395f]/10 bg-white p-3 shadow-[0_8px_30px_rgba(23,57,95,0.06)]" >
                        <div className="grid gap-3 lg:grid-cols-[1fr_180px_180px_auto]">
                            {/* LAB NAME */}
                            <div className="flex items-center rounded-xl border border-[#17395f]/10 px-4 transition focus-within:border-[#0f4c81]/35 focus-within:ring-2 focus-within:ring-[#0f4c81]/10">
                                <Search size={19} className="mr-3 shrink-0 text-[#7891a9]" />

                                <input
                                    value={query} 
                                    onChange={(event) => setQuery(event.target.value)}
                                    placeholder="Laboratory name"
                                    className="h-12 w-full bg-transparent text-sm text-[#17395f] outline-none placeholder:text-[#8ca0b4]"
                                />

                            </div>

                            {/* STATE */}
                            <select
                                value={state}
                                onChange={(event) => setState(event.target.value)}
                                className="h-12 rounded-xl border border-[#17395f]/10 bg-white px-4 text-sm text-[#17395f] outline-none transition focus:border-[#0f4c81]/35 focus:ring-2 focus:ring-[#0f4c81]/10"
                            >
                                <option value="">All states</option>
                                <option value="18">Karnataka</option>
                                <option value="1">Uttar Pradesh</option>
                                <option value="32">Tamil Nadu</option>
                                <option value="22">Maharashtra</option>
                                <option value="33">Telangana</option>
                                <option value="6">Assam</option>
                                <option value="7">Bihar</option>
                                <option value="29">Punjab</option>
                                <option value="36">West Bengal</option>
                                <option value="16">Jammu & Kashmir</option>
                            </select>

                            {/* DISTRICT */}
                            <input 
                                value={district}
                                onChange={(event) => setDistrict(event.target.value)}
                                placeholder="District ID"
                                className="h-12 rounded-xl border border-[#17395f]/10 bg-white px-4 text-sm text-[#17395f] outline-none transition placeholder:text-[#8ca0b4] focus:border-[#0f4c81]/35 focus:ring-2 focus:ring-[#0f4c81]/10"
                            />

                            {/* SEARCH BUTTON */}
                            <button
                                type="submit"
                                disabled={loading}
                                className="flex h-12 items-center justify-center gap-2 rounded-xl bg-[#0f4c81] px-6 text-sm font-semibold text-white transition hover:bg-[#0b3e6a] disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                {loading ? (
                                    <> 
                                        <Loader2 size={17} className="animate-spin" /> 
                                        Searching
                                    </>
                                ) : (
                                    <>
                                        Search
                                        <ArrowUpRight size={17} />
                                    </>
                                )}
                            </button>
                        </div>

                        {error && (
                            <p className="px-2 pt-3 text-sm text-red-600">
                                {error}
                            </p>
                        )}
                    </form>
                </div>
            </section>

            {/* RESULTS */}
            <section className="mx-auto w-full max-w-6xl px-6 py-10">
                {/* RESULT HEADER */}
                {searched && !loading && (
                    <div className="mb-6 flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-[#7189a0]">
                                {results.length}{" "}
                                {results.length === 1 ? "laboratory" : "laboratories"}{" "}
                                found
                            </p>
                        </div>

                        <button
                            onClick={handleReset}
                            className="text-sm font-semibold text-[#0f4c81] transition hover:text-[#0b3e6a] hover:underline"
                        >
                            Clear search
                        </button>
                    </div>
                )}

                {/* LOADING */}
                {loading && (
                    <div className="flex min-h-75 items-center justify-center">
                        <div className="flex items-center gap-3 text-[#6e879f]">
                            <Loader2 size={20} className="animate-spin text-[#0f4c81]" />
                            <span className="text-sm">Fetching laboratory information from BIS... </span>
                        </div>
                    </div>
                )}

                {/* EMPTY */}
                {searched &&
                    !loading &&
                    results.length === 0 &&
                    !error && (
                        <div className="rounded-2xl border border-[#17395f]/10 bg-[#f8fbfd] px-6 py-20 text-center">
                            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#edf5fb] text-[#0f4c81]">
                                <Building2 size={23} />
                            </div>

                            <h2 className="mt-5 text-lg font-semibold text-[#17395f]">
                                No laboratories found
                            </h2>

                            <p className="mt-2 text-sm text-[#6b849d]">
                                Try another laboratory name or location.
                            </p>
                        </div>
                    )}

                {/* RESULTS */}
                {!loading && results.length > 0 && (
                    <div className="space-y-4">
                        {results.map((lab) => (
                            <article
                                key={lab.id}
                                className="rounded-2xl border border-[#17395f]/10 bg-white p-5 transition duration-200 hover:-translate-y-0.5 hover:border-[#0f4c81]/20 hover:shadow-[0_12px_30px_rgba(23,57,95,0.07)]"
                            >
                                <div className="flex flex-col gap-6 lg:flex-row">
                                    {/* IMAGE */}
                                    <div className="shrink-0">
                                        {lab.imageUrl ? (
                                            <img
                                                src={lab.imageUrl}
                                                alt={lab.name}
                                                className="h-20 w-20 rounded-2xl border border-[#17395f]/10 object-cover"
                                            />
                                        ) : (
                                            <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-[#edf5fb] text-[#0f4c81]">
                                                <FlaskConical size={28} />
                                            </div>
                                        )}
                                    </div>

                                    {/* CONTENT */}
                                    <div className="min-w-0 flex-1">
                                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                            <div>
                                                <p className="mb-1 text-xs font-semibold uppercase tracking-[0.12em] text-[#6e8ba7]">
                                                    {lab.labCode !== "-" ? `Lab code: ${lab.labCode}` : "BIS Laboratory"}
                                                </p>

                                                <h2 className="text-xl font-semibold tracking-tight text-[#17395f]">
                                                    {lab.name}
                                                </h2>
                                            </div>

                                            <span className="w-fit rounded-full bg-[#edf5fb] px-3 py-1 text-xs font-semibold text-[#0f4c81]">
                                                Official BIS Lab
                                            </span>
                                        </div>

                                        <div className="mt-5 grid gap-5 text-sm text-[#637e99] md:grid-cols-2">
                                            {/* ADDRESS */}
                                            <div className="flex items-start gap-3">
                                                <MapPin size={17} className="mt-0.5 shrink-0 text-[#7892a9]" />

                                                <span className="leading-6">
                                                    {lab.address || "Address not available"}
                                                </span>
                                            </div>

                                            {/* CONTACT */}
                                            <div className="space-y-3">
                                                {lab.contactPerson && (
                                                    <div className="flex items-start gap-3">
                                                        <Building2 size={17} className="mt-0.5 shrink-0 text-[#7892a9]" />
                                                        <span> {lab.contactPerson} </span>
                                                    </div>
                                                )}

                                                {lab.contactNumber && (
                                                    <div className="flex items-center gap-3">
                                                        <Phone size={17} className="shrink-0 text-[#7892a9]" />
                                                        <span>{lab.contactNumber}</span>
                                                    </div>
                                                )}

                                                {lab.email && (
                                                    <div className="flex items-center gap-3 break-all">
                                                        <Mail size={17} className="shrink-0 text-[#7892a9]" />
                                                        <span>{lab.email}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {/* ACTIONS */}
                                        <div className="mt-6 flex flex-wrap gap-3">
                                            {lab.scopeUrl && (
                                                <a
                                                    href={lab.scopeUrl}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="inline-flex items-center gap-2 rounded-lg bg-[#0f4c81] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#0b3e6a]"
                                                >
                                                    View scope
                                                    <ArrowUpRight size={16} />
                                                </a>
                                            )}

                                            <a
                                                href="https://lims.bis.gov.in/"
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="inline-flex items-center gap-2 rounded-lg border border-[#17395f]/12 bg-white px-4 py-2.5 text-sm font-semibold text-[#355b7e] transition hover:bg-[#f4f8fc] hover:text-[#17395f]"
                                            >
                                                Official BIS LIMS
                                                <ArrowUpRight size={16} />
                                            </a>
                                        </div>
                                    </div>
                                </div>
                            </article>
                        ))}
                    </div>
                )}

                {/* INITIAL STATE */}
                {!searched && (
                    <div className="grid gap-5 md:grid-cols-3">
                        <InfoCard
                            icon={<Search size={20} />}
                            title="Search by laboratory"
                            text="Find a specific BIS laboratory using its name."
                        />

                        <InfoCard
                            icon={<MapPin size={20} />}
                            title="Filter by location"
                            text="Narrow the results using state and district information."
                        />

                        <InfoCard
                            icon={<FlaskConical size={20} />}
                            title="Check testing scope"
                            text="Open the official BIS scope page for each laboratory."
                        />
                    </div>
                )}
            </section>
        </main>
    );
}

function InfoCard({
    icon,
    title,
    text,
}: {
    icon: React.ReactNode;
    title: string;
    text: string;
}) {
    return (
        <div className="rounded-2xl border border-[#17395f]/10 bg-white p-6 transition hover:border-[#0f4c81]/20 hover:shadow-[0_8px_25px_rgba(23,57,95,0.05)]">
            <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-[#edf5fb] text-[#0f4c81]">
                {icon}
            </div>

            <h3 className="font-semibold text-[#17395f]">
                {title}
            </h3>

            <p className="mt-2 text-sm leading-6 text-[#6a839c]">
                {text}
            </p>
        </div>
    );
}