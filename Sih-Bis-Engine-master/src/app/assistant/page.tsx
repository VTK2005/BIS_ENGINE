"use client";

import UserQuery from "@/components/msgComponent/UserQuery";
import BISResponse from "@/components/msgComponent/BISResponse";
import EmptyChat from "@/components/msgComponent/EmptyChat";
import { Home, MessageCircle, FileText, BadgeCheck, FlaskConical, Bell, Lightbulb, ArrowRight, BookOpen, Search, Sparkles, Plus, Info } from "lucide-react";
import { useForm, SubmitHandler } from "react-hook-form";
import { useEffect, useState, useRef } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";


type Inputs = {
    search_query: string;
};

export type Source = {
    document: string;
    page: number;
    section: string;
    type: string;
};

export type ChatResponse = {
    search_query: string;
    answer: string;
    sources: Source[];
    conversationId?: string;
};

export type StoredResponse = ChatResponse & {
    id: string;
    createdAt: string;
    status: "loading" | "complete";
};

const Page = () => {
    const { register, handleSubmit, reset, setValue } = useForm<Inputs>();
    const bottomRef = useRef<HTMLDivElement | null>(null);
    const initialQueryHandled = useRef(false);
    const [responses, setResponses] = useState<StoredResponse[]>([]);
    const [loading, setLoading] = useState(false);
    const [conversationId, setConversationId] = useState<string | null>(null);
    const [conversationLoading, setConversationLoading] = useState(true);
    const searchParams = useSearchParams();
    const initialQuery = searchParams.get("query");

    useEffect(() => {
        async function createConversation() {
            try {
                setConversationLoading(true);
                const response = await fetch("/api/chat/conversations", {
                    method: "POST",
                    headers: {
                        "Content-Type":
                            "application/json",
                    },
                    body: JSON.stringify({
                        title: "New Chat",
                    }),
                },
                );

                const data = await response.json();

                if (!response.ok || !data.success) {
                    throw new Error(data.message || "Failed to create conversation");
                }

                setConversationId(data.conversationId);

            } catch (error) {
                console.error("Conversation creation failed:", error);
            } finally {
                setConversationLoading(false);
            }
        }

        createConversation();
    }, []);

    useEffect(() => {
        if (!initialQuery || initialQueryHandled.current || !conversationId || conversationLoading) return;
        const query = initialQuery.trim();
        if (!query) return;
        initialQueryHandled.current = true;

        setValue("search_query", query);
        handleSubmit(onSubmit)();

        window.history.replaceState(null, "", "/assistant");
    }, [initialQuery, conversationId, conversationLoading, handleSubmit, setValue]);

    const typeText = (text: string, callback: (value: string) => void, speed = 12) => {
        return new Promise<void>(
            (resolve) => {
                let index = 0;

                const interval = setInterval(() => {
                    index++;
                    callback(text.slice(0, index));
                    if (index >= text.length) {
                        clearInterval(interval);
                        resolve();
                    }
                }, speed);
            }
        );
    };

    const delay = async (ms: number) => {
        await new Promise((resolve) => setTimeout(resolve, ms));
    };

    async function handleNewChat() {
        if (loading) return;

        try {
            setLoading(true);

            const response = await fetch("/api/chat/conversations", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    title: "New Chat"
                }),
            },);

            const data = await response.json();

            if (!response.ok || !data.success) {
                throw new Error(data.message || "Failed to create new chat");
            }

            setConversationId(data.conversationId);
            setResponses([]);
            reset();

        } catch (error) {
            console.error("Failed to create new chat:", error);
        } finally {
            setLoading(false);
        }
    }

    const onSubmit: SubmitHandler<Inputs> = async (data) => {
        const userQuery = data.search_query.trim();

        if (!userQuery || loading || conversationLoading || !conversationId) return;

        const messageId = crypto.randomUUID();
        setResponses((prev) => [...prev, {
            id: messageId,
            createdAt: new Date().toISOString(),
            search_query: userQuery,
            answer: "",
            sources: [],
            status: "loading",
        }
        ]);

        requestAnimationFrame(() => {
            bottomRef.current?.scrollIntoView({
                behavior: "smooth",
                block: "end"
            });
        });

        reset();
        setLoading(true);

        try {
            const searchReq = await fetch("/api/chat", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    conversationId,
                    search_query: userQuery,
                }),
            });

            if (!searchReq.ok) {
                throw new Error(`Request failed with status ${searchReq.status}`);
            }

            const resp: ChatResponse = await searchReq.json();
            await delay(400);

            await typeText(resp.answer, (partialAnswer) => {
                setResponses((prev) => prev.map((message) => message.id === messageId ? { ...message, answer: partialAnswer } : message));
            }, 10);

            await delay(250);

            setResponses((prev) => prev.map((message) => message.id === messageId ? { ...message, sources: resp.sources ?? [], status: "complete" } : message,));

        } catch (error) {
            console.error("Failed to get BIS response:", error);

            setResponses((prev) => prev.map((message) =>
                message.id === messageId ? {
                    ...message,
                    answer: "Sorry, something went wrong while retrieving the BIS response. Please try again.",
                    sources: [],
                    status: "complete",
                } : message,
            ));
        } finally {
            setLoading(false);
        }
    };

    return (
        <main className="h-[90vh] overflow-hidden bg-[#f4f7fa]">
            <div className="mx-auto flex h-[91vh] w-full max-w-[1600px] bg-white">
                {/* LEFT SIDEBAR */}
                <aside className="hidden w-70 shrink-0 border-r border-[#17395f]/10 bg-white lg:flex lg:flex-col">
                    {/* NEW CHAT */}
                    <div className="px-4 pt-8 pb-4">
                        <button
                            type="button"
                            onClick={handleNewChat}
                            disabled={loading}
                            className="flex w-full items-center gap-3 rounded-xl bg-[#0f4c81] px-4 py-3 text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:bg-[#0b3e6a] hover:shadow-md active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            <Plus size={19} strokeWidth={2.5} />

                            <span>New Chat</span>
                        </button>
                    </div>

                    {/* NAVIGATION */}
                    <nav className="px-3">
                        <div className="space-y-1">
                            <Link
                                href="/"
                                className="flex items-center gap-3 rounded-lg px-4 py-3 text-sm text-[#465f78] transition-colors hover:bg-[#f4f8fc] hover:text-[#17395f]"
                            >
                                <Home size={19} strokeWidth={2} />
                                <span>Home</span>
                            </Link>

                            <Link
                                href="/assistant"
                                className="flex items-center gap-3 rounded-lg bg-[#edf5fb] px-4 py-3 text-sm font-semibold text-[#0f4c81]"
                            >
                                <MessageCircle size={19} strokeWidth={2.2} />
                                <span>BIS Assistant</span>
                            </Link>

                            <Link
                                href="/standards"
                                className="flex items-center gap-3 rounded-lg px-4 py-3 text-sm text-[#465f78] transition-colors hover:bg-[#f4f8fc] hover:text-[#17395f]"
                            >
                                <FileText size={19} strokeWidth={2} />
                                <span>Standards</span>
                            </Link>

                            <Link
                                href="/laboratories"
                                className="flex items-center gap-3 rounded-lg px-4 py-3 text-sm text-[#465f78] transition-colors hover:bg-[#f4f8fc] hover:text-[#17395f]"
                            >
                                <FlaskConical size={19} strokeWidth={2} />
                                <span>Laboratories</span>
                            </Link>

                            <Link
                                href="/about"
                                className="flex items-center gap-3 rounded-lg px-4 py-3 text-sm text-[#465f78] transition-colors hover:bg-[#f4f8fc] hover:text-[#17395f]"
                            >
                                <Info size={19} strokeWidth={2} />
                                <span>About</span>
                            </Link>

                            <Link
                                href="/updates"
                                className="flex items-center gap-3 rounded-lg px-4 py-3 text-sm text-[#465f78] transition-colors hover:bg-[#f4f8fc] hover:text-[#17395f]"
                            >
                                <Bell size={19} strokeWidth={2} />
                                <span>Latest Updates</span>
                            </Link>
                        </div>
                    </nav>

                    <div className="flex-1" />

                    {/* BIS STANDARDS PROMO */}
                    <div className="px-3 py-2">
                        <div className="group relative h-40 overflow-hidden rounded-2xl">
                            <img
                                src="/chat_mini_left_bottom.jpg"
                                alt="BIS Standards"
                                className="absolute inset-0 h-full w-full object-cover object-center transition-transform duration-500 group-hover:scale-[1.03]"
                            />

                            <div className="absolute inset-0 bg-linear-to-r from-[#092f5f]/95 via-[#0f4c81]/65 to-transparent" />
                            <div className="absolute inset-x-0 bottom-0 h-20 bg-linear-to-t from-black/20 to-transparent" />
                            <div className="relative z-10 flex h-full max-w-49 flex-col p-4">

                                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-[0_3px_12px_rgba(0,0,0,0.15)]">
                                    <Lightbulb size={19} strokeWidth={2.2} className="text-[#0f4c81]" />
                                </div>

                                <div className="mt-3">
                                    <h3 className="text-[15px] font-bold leading-tight tracking-[-0.01em] text-white">
                                        BIS Standards
                                    </h3>

                                    <p className="mt-1 max-w-38 text-[10px] font-medium leading-[1.45] text-white/80">
                                        Make a Safer,
                                        <br />
                                        Smarter Tomorrow
                                    </p>
                                </div>

                                <Link
                                    href="/standards"
                                    className="mt-auto flex w-fit items-center gap-1 text-[9px] font-semibold text-white/90"
                                >
                                    Explore standards

                                    <ArrowRight size={11} strokeWidth={2.5} className="transition-transform duration-200 group-hover:translate-x-1" />
                                </Link>
                            </div>
                        </div>
                    </div>

                </aside>

                {/* CENTER CHAT */}
                <section className="relative min-w-0 flex-1 bg-white">
                    <div className="h-full overflow-y-auto pb-18">
                        <div className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-5 py-8">
                            {conversationLoading ? (
                                <div className="flex min-h-125 items-center justify-center">
                                    <div className="flex items-center gap-3 text-sm text-[#71879b]">
                                        <LoaderIcon />
                                        <span>
                                            Starting a new conversation...
                                        </span>
                                    </div>
                                </div>
                            ) : responses.length === 0 ? (
                                <EmptyChat onSuggestionClick={(query) => { onSubmit({ search_query:query }) }} />
                            ) : (
                                responses.map((response) => (
                                        <div key={response.id} className="flex animate-in flex-col gap-5 fade-in slide-in-from-bottom-2 duration-500">

                                            {/* User query */}
                                            <div className="flex justify-end">
                                                <div className="max-w-xl">
                                                    <UserQuery user_query={response.search_query} />
                                                </div>
                                            </div>

                                            {/* BIS response */}
                                            <div className="flex flex-col justify-start gap-2">
                                                {/* Header */}
                                                <div className="flex items-center gap-2 text-sm">

                                                    <div className="flex h-6 w-6 items-center justify-center rounded-md bg-[#edf5fb]">
                                                        <Sparkles size={13} className="text-[#0f4c81]" />
                                                    </div>

                                                    <span className="font-semibold tracking-wide text-[#0B1F3A]">
                                                        BIS ENGINE
                                                    </span>

                                                    <span className="h-4 w-px bg-[#d8e0e8]" />
                                                    <span className="flex items-center gap-1.5 text-[#70869a]">
                                                        <BadgeCheck className="text-[#19a974]" size={16} />
                                                        Source-backed
                                                    </span>

                                                </div>

                                                <div className="w-full">
                                                    <BISResponse response={response} />
                                                    <div ref={bottomRef} />
                                                </div>
                                            </div>
                                        </div>
                                    ),
                                )
                            )}
                        </div>

                    </div>
                    {/* CHAT INPUT */}

                    <div className="absolute bottom-0 left-0 right-0 z-30 border-t border-[#17395f]/8 bg-white/95 px-4 py-3 backdrop-blur">
                        <div className="mx-auto flex max-w-5xl items-center gap-2 rounded-xl border border-[#17395f]/15 bg-white p-2 shadow-[0_5px_25px_rgba(23,57,95,0.08)]">
                            <Search size={22} className="ml-1 shrink-0 text-[#69839c]" />

                            <form className="flex w-full items-center gap-2" onSubmit={handleSubmit(onSubmit)} >

                                <input
                                    type="text"
                                    id="search_query"
                                    autoComplete="off"
                                    placeholder="Tell us about your product or ask a BIS-related question..."
                                    disabled={loading || conversationLoading}
                                    className="h-10 flex-1 bg-transparent px-2 text-sm text-[#17395f] outline-none placeholder:text-[#8295a8] disabled:cursor-not-allowed disabled:opacity-50 md:text-base"
                                    {...register("search_query", { required: "Please enter a question"})}
                                />

                                <button
                                    type="submit"
                                    disabled={loading || conversationLoading || !conversationId}
                                    className="h-10 rounded-lg bg-[#0f4c81] px-6 text-sm font-semibold text-white transition hover:bg-[#0b3e6a] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    {loading ? "Searching..." : "Ask"}
                                </button>

                            </form>
                        </div>
                    </div>

                </section>

                {/* RIGHT SIDEBAR */}
                <aside className="hidden w-75 shrink-0 border-l border-[#17395f]/10 bg-white p-4 xl:block">
                    {/* Popular queries */}
                    <div className="rounded-xl border border-[#17395f]/10 bg-white shadow-sm">
                        <div className="flex items-center gap-3 border-b border-[#17395f]/8 px-4 py-4">
                            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#fff8df]">
                                <Lightbulb size={20} className="text-[#e9ad00]" />
                            </div>

                            <h2 className="text-sm font-bold text-[#0f4c81]">
                                Popular Queries
                            </h2>
                        </div>

                        <div className="divide-y divide-[#17395f]/8">
                            {[
                                "How to get ISI Mark?",
                                "What is a BIS Standard (IS)?",
                                "How to search for a standard?",
                                "What is CRS certification?",
                            ].map((query) => (
                                    <button key={query} type="button" onClick={() => onSubmit({ search_query: query })}
                                        className="group flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-xs text-[#465f78] transition hover:bg-[#f4f8fc]"
                                    >
                                        <span>{query}</span>
                                        <ArrowRight size={16}
                                            className="shrink-0 text-[#8195a9] transition-transform duration-200 group-hover:translate-x-1 group-hover:text-[#0f4c81]"
                                        />

                                    </button>
                                ),
                            )}

                        </div>
                    </div>

                    {/* Useful resources */}
                    <div className="mt-4 rounded-xl border border-[#17395f]/6 bg-[#edf8f3] p-5">

                        <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white">
                                <BookOpen size={20} className="text-[#198754]" />
                            </div>

                            <h2 className="text-sm font-bold text-[#17663e]">
                                Useful Resources
                            </h2>
                        </div>

                        <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-4">
                            <a
                                href="https://www.bis.gov.in/"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="group flex items-center justify-between text-xs font-medium text-[#0f4c81]"
                            >
                                BIS Website
                                <ArrowRight size={14} className="transition-transform group-hover:translate-x-1" />
                            </a>

                            <Link href="/standards" className="group flex items-center justify-between text-xs font-medium text-[#0f4c81]">
                                Standards Catalogue
                                <ArrowRight size={14} className="transition-transform group-hover:translate-x-1" />
                            </Link>

                            <a
                                href="https://www.bis.gov.in/product-certification/?lang=en"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="group flex items-center justify-between text-xs font-medium text-[#0f4c81]"
                            >
                                Certification Process

                                <ArrowRight size={14} className="transition-transform group-hover:translate-x-1" />
                            </a>

                            <Link href="/laboratories" className="group flex items-center justify-between text-xs font-medium text-[#0f4c81]" >
                                Laboratory Search
                                <ArrowRight size={14} className="transition-transform group-hover:translate-x-1" />
                            </Link>

                        </div>
                    </div>

                    {/* CTA */}
                    <div className="relative mt-4 h-48 overflow-hidden rounded-xl">
                        {/* Background image */}
                        <img src="/chat_mini_right_bottom.jpg" alt="book" className="absolute inset-0 h-full w-full object-cover" />
                        <div className="absolute inset-0 bg-linear-to-r from-black/75 via-black/45 to-transparent" />

                        {/* Content */}
                        <div className="relative z-10 flex h-full flex-col justify-between p-4">
                            <div>
                                <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/30 backdrop-blur-sm">
                                    <MessageCircle size={17} strokeWidth={2} className="text-white" />
                                </div>

                                <h2 className="max-w-37 text-[15px] font-bold leading-[1.15] text-white">
                                    Not sure where
                                    <br />
                                    to start?
                                </h2>

                                <p className="mt-1 max-w-40 text-[9px] leading-[1.45] text-white/90">
                                    Let the BIS Assistant guide
                                    you step by step.
                                </p>
                            </div>

                            <button type="button"
                                onClick={() => onSubmit({ search_query: "Help me understand BIS certification" })}
                                className="flex w-fit items-center gap-2 rounded-full bg-[#0f4c81] px-3.5 py-1.5 text-[10px] font-semibold text-white shadow-sm transition hover:bg-[#0b3e6a] active:scale-[0.97]"
                            >
                                Ask Now
                                <ArrowRight size={13} strokeWidth={2.3} />
                            </button>
                        </div>
                    </div>
                </aside>
            </div>
        </main>
    );
};

function LoaderIcon() {
    return (
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#0f4c81]/20 border-t-[#0f4c81]" />
    );
}

export default Page;