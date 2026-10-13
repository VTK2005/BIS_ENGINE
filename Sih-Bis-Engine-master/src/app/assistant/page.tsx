"use client";

import UserQuery from "@/components/msgComponent/UserQuery";
import BISResponse from "@/components/msgComponent/BISResponse";
import { BISSource } from "@/components/msgComponent/BISSourceComponent";
import EmptyChat from "@/components/msgComponent/EmptyChat";
import {
    Home,
    MessageCircle,
    FileText,
    FlaskConical,
    Bell,
    Lightbulb,
    ArrowRight,
    BookOpen,
    Search,
    Plus,
    Info,
    Database,
    Zap,
    Square,
    Trash2,
    Edit2,
    Check,
    X,
    Loader2,
    User as UserIcon,
    LogOut,
} from "lucide-react";
import { useForm, SubmitHandler } from "react-hook-form";
import { useEffect, useState, useRef, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";

type Inputs = {
    search_query: string;
};

export type Source = BISSource;

export type ChatResponse = {
    search_query: string;
    answer: string;
    sources: Source[];
    conversationId?: string;
    mode?: "vector" | "vectorless";
};

export type StoredResponse = ChatResponse & {
    id: string;
    createdAt: string;
    status: "loading" | "complete";
    mode: "vector" | "vectorless";
    stopped?: boolean;
};

type RagMode = "vector" | "vectorless";

interface ConversationItem {
    id: string;
    title: string;
    updatedAt: string;
    messageCount: number;
}

interface UserProfile {
    id: string;
    name: string;
    email: string;
    image?: string;
}

const Page = () => {
    const router = useRouter();
    const searchParams = useSearchParams();
    const initialQuery = searchParams.get("query");

    const { register, handleSubmit, reset, setValue } = useForm<Inputs>();
    const bottomRef = useRef<HTMLDivElement | null>(null);
    const initialQueryHandled = useRef(false);
    const abortControllerRef = useRef<AbortController | null>(null);
    const conversationCreatingRef = useRef(false); // guard: prevent double-creation

    // User & Authentication state
    const [user, setUser] = useState<UserProfile | null>(null);
    const [authChecking, setAuthChecking] = useState(true);

    // Chat and conversation state
    const [responses, setResponses] = useState<StoredResponse[]>([]);
    const [loading, setLoading] = useState(false);
    const [conversationId, setConversationId] = useState<string | null>(null);
    const [conversationLoading, setConversationLoading] = useState(true);
    const [ragMode, setRagMode] = useState<RagMode>("vector");

    // Sidebar conversation history state
    const [conversations, setConversations] = useState<ConversationItem[]>([]);
    const [loadingConversations, setLoadingConversations] = useState(false);
    const [editingConvId, setEditingConvId] = useState<string | null>(null);
    const [editTitleValue, setEditTitleValue] = useState("");

    // ──────────────────────────────────────────────────────────
    // 1. Check Authentication on Mount
    // ──────────────────────────────────────────────────────────
    useEffect(() => {
        const verifyAuth = async () => {
            try {
                const res = await fetch("/api/auth/me");
                if (res.ok) {
                    const data = await res.json();
                    if (data.authenticated && data.user) {
                        setUser(data.user);
                    } else {
                        router.push("/login?redirect=/assistant");
                    }
                } else {
                    router.push("/login?redirect=/assistant");
                }
            } catch {
                router.push("/login?redirect=/assistant");
            } finally {
                setAuthChecking(false);
            }
        };

        verifyAuth();
    }, [router]);

    // ──────────────────────────────────────────────────────────
    // 2. Load User Conversations for Sidebar
    // ──────────────────────────────────────────────────────────
    const loadConversations = useCallback(async () => {
        try {
            setLoadingConversations(true);
            const res = await fetch("/api/chat/conversations");
            if (res.ok) {
                const data = await res.json();
                if (data.success && Array.isArray(data.conversations)) {
                    setConversations(data.conversations);
                }
            }
        } catch (error) {
            console.error("Failed to fetch conversations:", error);
        } finally {
            setLoadingConversations(false);
        }
    }, []);

    useEffect(() => {
        if (user) {
            loadConversations();
        }
    }, [user, loadConversations]);

    // ──────────────────────────────────────────────────────────
    // 3. Initialize or Create Conversation
    // ──────────────────────────────────────────────────────────
    const createNewConversation = useCallback(async () => {
        if (conversationCreatingRef.current) return;  // already in-flight
        conversationCreatingRef.current = true;
        try {
            setConversationLoading(true);
            const response = await fetch("/api/chat/conversations", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ title: "New Chat" }),
            });

            const data = await response.json();
            if (!response.ok || !data.success) {
                throw new Error(data.message || "Failed to create conversation");
            }

            setConversationId(data.conversationId);
            setResponses([]);
            reset();
            loadConversations();
        } catch (error) {
            console.error("Conversation creation failed:", error);
        } finally {
            conversationCreatingRef.current = false;
            setConversationLoading(false);
        }
    }, [loadConversations, reset]);

    useEffect(() => {
        if (user && !conversationId && !conversationCreatingRef.current) {
            createNewConversation();
        }
    }, [user, conversationId, createNewConversation]);

    // ──────────────────────────────────────────────────────────
    // 4. Handle URL Query Param
    // ──────────────────────────────────────────────────────────
    useEffect(() => {
        if (!initialQuery || initialQueryHandled.current || !conversationId || conversationLoading)
            return;
        const query = initialQuery.trim();
        if (!query) return;
        initialQueryHandled.current = true;

        setValue("search_query", query);
        handleSubmit(onSubmit)();

        window.history.replaceState(null, "", "/assistant");
    }, [initialQuery, conversationId, conversationLoading, handleSubmit, setValue]);

    // ──────────────────────────────────────────────────────────
    // 5. Select & Load a Conversation from Sidebar
    // ──────────────────────────────────────────────────────────
    const handleSelectConversation = async (id: string) => {
        if (id === conversationId || loading) return;

        try {
            setConversationLoading(true);
            setConversationId(id);
            setResponses([]);

            const res = await fetch(`/api/chat/conversations/${id}`);
            if (!res.ok) {
                throw new Error("Failed to load conversation messages");
            }

            const data = await res.json();
            if (data.success && data.conversation?.messages) {
                const msgs = data.conversation.messages;
                const rebuiltResponses: StoredResponse[] = [];

                let currentUserQuery = "";
                for (const m of msgs) {
                    if (m.role === "user") {
                        currentUserQuery = m.content;
                    } else if (m.role === "assistant") {
                        rebuiltResponses.push({
                            id: m._id || crypto.randomUUID(),
                            createdAt: m.createdAt || new Date().toISOString(),
                            search_query: currentUserQuery || "Query",
                            answer: m.content,
                            sources: m.sources || [],
                            status: "complete",
                            mode: "vector",
                            stopped: m.stopped || false,
                        });
                        currentUserQuery = "";
                    }
                }

                setResponses(rebuiltResponses);
            }
        } catch (err) {
            console.error("Error switching conversation:", err);
        } finally {
            setConversationLoading(false);
        }
    };

    // ──────────────────────────────────────────────────────────
    // 6. Rename Conversation
    // ──────────────────────────────────────────────────────────
    const handleStartRename = (conv: ConversationItem, e: React.MouseEvent) => {
        e.stopPropagation();
        setEditingConvId(conv.id);
        setEditTitleValue(conv.title);
    };

    const handleSaveRename = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!editTitleValue.trim()) return;

        try {
            const res = await fetch(`/api/chat/conversations/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ title: editTitleValue.trim() }),
            });

            if (res.ok) {
                setConversations((prev) =>
                    prev.map((c) => (c.id === id ? { ...c, title: editTitleValue.trim() } : c))
                );
            }
        } catch (err) {
            console.error("Rename failed:", err);
        } finally {
            setEditingConvId(null);
        }
    };

    // ──────────────────────────────────────────────────────────
    // 7. Delete Conversation
    // ──────────────────────────────────────────────────────────
    const handleDeleteConversation = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!confirm("Are you sure you want to delete this conversation?")) return;

        try {
            const res = await fetch(`/api/chat/conversations/${id}`, {
                method: "DELETE",
            });

            if (res.ok) {
                setConversations((prev) => prev.filter((c) => c.id !== id));
                if (conversationId === id) {
                    createNewConversation();
                }
            }
        } catch (err) {
            console.error("Delete conversation failed:", err);
        }
    };

    // ──────────────────────────────────────────────────────────
    // 8. Stop Generating Answer
    // ──────────────────────────────────────────────────────────
    const handleStopGeneration = async () => {
        if (!loading) return;

        // Abort the ongoing fetch request
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
        }

        setLoading(false);

        // Find the active loading response
        const activeIdx = responses.findIndex((r) => r.status === "loading");
        if (activeIdx !== -1) {
            const activeResp = responses[activeIdx];
            const partialText = activeResp.answer.trim();
            const stoppedText = partialText
                ? `${partialText}\n\n*[Response stopped by user]*`
                : "*[Response generation stopped]*";

            setResponses((prev) =>
                prev.map((r, i) =>
                    i === activeIdx
                        ? { ...r, answer: stoppedText, status: "complete", stopped: true }
                        : r
                )
            );

            // Persist the stopped response in the database
            if (conversationId) {
                fetch("/api/chat/stop", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        conversationId,
                        partialAnswer: partialText,
                        sources: activeResp.sources || [],
                    }),
                }).catch((err) => console.error("Error saving stopped response:", err));
            }
        }
    };

    // ──────────────────────────────────────────────────────────
    // 9. Typewriter Simulation
    // ──────────────────────────────────────────────────────────
    const typeText = (
        text: string,
        callback: (value: string) => void,
        signal?: AbortSignal,
        speed = 10
    ) => {
        return new Promise<void>((resolve) => {
            let index = 0;
            const interval = setInterval(() => {
                if (signal?.aborted) {
                    clearInterval(interval);
                    resolve();
                    return;
                }
                index++;
                callback(text.slice(0, index));
                if (index >= text.length) {
                    clearInterval(interval);
                    resolve();
                }
            }, speed);
        });
    };

    const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    // ──────────────────────────────────────────────────────────
    // 10. Submit Query Handler
    // ──────────────────────────────────────────────────────────
    const onSubmit: SubmitHandler<Inputs> = async (data) => {
        const userQuery = data.search_query.trim();
        if (!userQuery || loading || conversationLoading || !conversationId) return;

        const messageId = crypto.randomUUID();
        const controller = new AbortController();
        abortControllerRef.current = controller;

        setResponses((prev) => [
            ...prev,
            {
                id: messageId,
                createdAt: new Date().toISOString(),
                search_query: userQuery,
                answer: "",
                sources: [],
                status: "loading",
                mode: ragMode,
            },
        ]);

        requestAnimationFrame(() => {
            bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
        });

        reset();
        setLoading(true);

        try {
            const searchReq = await fetch("/api/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    conversationId,
                    search_query: userQuery,
                    mode: ragMode,
                }),
                signal: controller.signal,
            });

            if (!searchReq.ok) {
                throw new Error(`Request failed with status ${searchReq.status}`);
            }

            const resp: ChatResponse = await searchReq.json();
            if (controller.signal.aborted) return;

            await delay(300);

            await typeText(
                resp.answer,
                (partial) => {
                    setResponses((prev) =>
                        prev.map((msg) =>
                            msg.id === messageId ? { ...msg, answer: partial } : msg
                        )
                    );
                },
                controller.signal,
                8
            );

            if (controller.signal.aborted) return;

            await delay(200);

            setResponses((prev) =>
                prev.map((msg) =>
                    msg.id === messageId
                        ? { ...msg, sources: resp.sources ?? [], status: "complete" }
                        : msg
                )
            );

            // Refresh sidebar list to show updated title and timestamp
            loadConversations();
        } catch (error: any) {
            if (error?.name === "AbortError" || controller.signal.aborted) {
                // Handled cleanly in handleStopGeneration
                return;
            }

            console.error("Failed to get BIS response:", error);
            setResponses((prev) =>
                prev.map((msg) =>
                    msg.id === messageId
                        ? {
                              ...msg,
                              answer:
                                  "Sorry, something went wrong while retrieving the BIS response. Please try again.",
                              sources: [],
                              status: "complete",
                          }
                        : msg
                )
            );
        } finally {
            setLoading(false);
            abortControllerRef.current = null;
        }
    };

    if (authChecking) {
        return (
            <div className="flex h-[90vh] items-center justify-center bg-[#f4f7fa]">
                <div className="flex items-center gap-3 text-sm text-[#0f4c81]">
                    <Loader2 className="animate-spin" size={24} />
                    <span>Checking authentication session...</span>
                </div>
            </div>
        );
    }

    return (
        <main className="h-[91vh] overflow-hidden bg-[#f4f7fa]">
            <div className="mx-auto flex h-full w-full max-w-[1600px] bg-white">
                {/* ────────────────────────────────────────────────────────── */}
                {/* LEFT SIDEBAR: Search History & Navigation                 */}
                {/* ────────────────────────────────────────────────────────── */}
                <aside className="hidden w-72 shrink-0 border-r border-[#17395f]/10 bg-[#fbfcfd] lg:flex lg:flex-col">
                    {/* NEW CHAT BUTTON */}
                    <div className="p-4 pb-2">
                        <button
                            type="button"
                            onClick={createNewConversation}
                            disabled={loading || conversationLoading}
                            className="flex w-full items-center justify-center gap-2.5 rounded-xl bg-[#0f4c81] px-4 py-2.5 text-sm font-semibold text-white shadow-xs transition hover:bg-[#0b3e6a] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            <Plus size={18} strokeWidth={2.5} />
                            <span>New Chat</span>
                        </button>
                    </div>

                    {/* SEARCH HISTORY LIST */}
                    <div className="flex-1 overflow-y-auto px-3 py-2">
                        <div className="mb-2 px-2 text-[11px] font-bold uppercase tracking-wider text-[#7992aa]">
                            Recent Conversations
                        </div>

                        {loadingConversations ? (
                            <div className="flex items-center justify-center py-6 text-xs text-gray-400">
                                <Loader2 size={16} className="animate-spin mr-2" />
                                Loading history...
                            </div>
                        ) : conversations.length === 0 ? (
                            <div className="px-3 py-4 text-center text-xs text-gray-400">
                                No previous conversations yet.
                            </div>
                        ) : (
                            <div className="space-y-1">
                                {conversations.map((c) => {
                                    const isActive = c.id === conversationId;
                                    const isEditing = editingConvId === c.id;

                                    return (
                                        <div
                                            key={c.id}
                                            onClick={() => handleSelectConversation(c.id)}
                                            className={`group relative flex cursor-pointer items-center justify-between rounded-xl px-3 py-2.5 text-xs transition-colors ${
                                                isActive
                                                    ? "bg-[#edf5fb] font-semibold text-[#0f4c81]"
                                                    : "text-[#465f78] hover:bg-gray-100/80 hover:text-[#17395f]"
                                            }`}
                                        >
                                            <div className="flex items-center gap-2 min-w-0 pr-2">
                                                <MessageCircle
                                                    size={15}
                                                    className={`shrink-0 ${
                                                        isActive ? "text-[#0f4c81]" : "text-gray-400"
                                                    }`}
                                                />
                                                {isEditing ? (
                                                    <input
                                                        type="text"
                                                        value={editTitleValue}
                                                        onChange={(e) =>
                                                            setEditTitleValue(e.target.value)
                                                        }
                                                        onClick={(e) => e.stopPropagation()}
                                                        onKeyDown={(e) => {
                                                            if (e.key === "Enter")
                                                                handleSaveRename(c.id, e as any);
                                                            if (e.key === "Escape")
                                                                setEditingConvId(null);
                                                        }}
                                                        autoFocus
                                                        className="w-36 rounded border border-[#0f4c81] bg-white px-1 py-0.5 text-xs text-[#17395f] outline-none"
                                                    />
                                                ) : (
                                                    <span className="truncate">{c.title}</span>
                                                )}
                                            </div>

                                            {/* Action buttons (Rename / Delete) */}
                                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                {isEditing ? (
                                                    <>
                                                        <button
                                                            type="button"
                                                            onClick={(e) =>
                                                                handleSaveRename(c.id, e)
                                                            }
                                                            title="Save title"
                                                            className="rounded p-1 hover:bg-green-100 text-green-700"
                                                        >
                                                            <Check size={13} />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setEditingConvId(null);
                                                            }}
                                                            title="Cancel"
                                                            className="rounded p-1 hover:bg-gray-200 text-gray-500"
                                                        >
                                                            <X size={13} />
                                                        </button>
                                                    </>
                                                ) : (
                                                    <>
                                                        <button
                                                            type="button"
                                                            onClick={(e) =>
                                                                handleStartRename(c, e)
                                                            }
                                                            title="Rename conversation"
                                                            className="rounded p-1 hover:bg-gray-200 text-gray-500 hover:text-gray-800"
                                                        >
                                                            <Edit2 size={12} />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={(e) =>
                                                                handleDeleteConversation(c.id, e)
                                                            }
                                                            title="Delete conversation"
                                                            className="rounded p-1 hover:bg-red-100 text-gray-500 hover:text-red-600"
                                                        >
                                                            <Trash2 size={12} />
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* USER PROFILE CARD */}
                    {user && (
                        <div className="border-t border-gray-200 p-3 bg-white">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2.5 min-w-0">
                                    {user.image ? (
                                        <img
                                            src={user.image}
                                            alt={user.name}
                                            className="h-7 w-7 rounded-full object-cover border border-gray-200"
                                        />
                                    ) : (
                                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#0f4c81] text-xs font-semibold text-white">
                                            {user.name.charAt(0).toUpperCase()}
                                        </div>
                                    )}
                                    <div className="min-w-0">
                                        <p className="truncate text-xs font-semibold text-[#17395f]">
                                            {user.name}
                                        </p>
                                        <p className="truncate text-[10px] text-gray-400">
                                            {user.email}
                                        </p>
                                    </div>
                                </div>
                                <button
                                    onClick={async () => {
                                        await fetch("/api/auth/logout", { method: "POST" });
                                        router.push("/login");
                                    }}
                                    title="Sign out"
                                    className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-red-600 transition"
                                >
                                    <LogOut size={15} />
                                </button>
                            </div>
                        </div>
                    )}
                </aside>

                {/* ────────────────────────────────────────────────────────── */}
                {/* CENTER CHAT AREA                                          */}
                {/* ────────────────────────────────────────────────────────── */}
                <section className="relative min-w-0 flex-1 bg-white flex flex-col">
                    {/* MESSAGES LIST */}
                    <div className="flex-1 overflow-y-auto pb-32">
                        <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-5 py-8">
                            {conversationLoading ? (
                                <div className="flex min-h-100 items-center justify-center">
                                    <div className="flex items-center gap-3 text-sm text-[#71879b]">
                                        <Loader2 className="animate-spin text-[#0f4c81]" size={20} />
                                        <span>Loading conversation...</span>
                                    </div>
                                </div>
                            ) : responses.length === 0 ? (
                                <EmptyChat
                                    onSuggestionClick={(query) => {
                                        onSubmit({ search_query: query });
                                    }}
                                />
                            ) : (
                                responses.map((response) => (
                                    <div
                                        key={response.id}
                                        className="flex flex-col gap-4 animate-in fade-in duration-300"
                                    >
                                        <UserQuery user_query={response.search_query} />
                                        <div className="w-full">
                                            <BISResponse response={response} />
                                            <div ref={bottomRef} />
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    {/* ────────────────────────────────────────────────────────── */}
                    {/* CHAT INPUT & STOP GENERATION CONTROLS                      */}
                    {/* ────────────────────────────────────────────────────────── */}
                    <div className="absolute bottom-0 left-0 right-0 z-30 border-t border-[#17395f]/8 bg-white/95 px-4 pt-2.5 pb-4 backdrop-blur">
                        {/* RAG MODE TOGGLE */}
                        <div className="mx-auto mb-2 flex max-w-5xl items-center justify-between">
                            <span className="text-[11px] font-medium text-[#8295a8]">
                                Retrieval Mode:
                            </span>
                            <div className="flex items-center gap-1 rounded-full border border-[#17395f]/12 bg-[#f4f8fc] p-0.5">
                                <button
                                    type="button"
                                    id="mode-vector"
                                    onClick={() => setRagMode("vector")}
                                    className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold transition ${
                                        ragMode === "vector"
                                            ? "bg-[#0f4c81] text-white shadow-xs"
                                            : "text-[#465f78] hover:text-[#17395f]"
                                    }`}
                                >
                                    <Zap size={11} strokeWidth={2.5} />
                                    Vector RAG
                                </button>
                                <button
                                    type="button"
                                    id="mode-vectorless"
                                    onClick={() => setRagMode("vectorless")}
                                    className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold transition ${
                                        ragMode === "vectorless"
                                            ? "bg-[#0f4c81] text-white shadow-xs"
                                            : "text-[#465f78] hover:text-[#17395f]"
                                    }`}
                                >
                                    <Database size={11} strokeWidth={2.5} />
                                    Vectorless RAG
                                </button>
                            </div>
                        </div>

                        {/* INPUT BOX & STOP BUTTON */}
                        <div className="mx-auto flex max-w-5xl items-center gap-2 rounded-xl border border-[#17395f]/15 bg-white p-2 shadow-[0_5px_25px_rgba(23,57,95,0.08)]">
                            <Search size={20} className="ml-2 shrink-0 text-[#69839c]" />

                            <form
                                className="flex w-full items-center gap-2"
                                onSubmit={handleSubmit(onSubmit)}
                            >
                                <input
                                    type="text"
                                    id="search_query"
                                    autoComplete="off"
                                    placeholder="Ask any technical BIS standard question (e.g. requirements of agricultural tractor)..."
                                    disabled={loading || conversationLoading}
                                    className="h-10 flex-1 bg-transparent px-2 text-sm text-[#17395f] outline-none placeholder:text-[#8295a8] disabled:cursor-not-allowed disabled:opacity-50 md:text-base"
                                    {...register("search_query", {
                                        required: "Please enter a question",
                                    })}
                                />

                                {/* STOP BUTTON (Visible while assistant is generating) */}
                                {loading && (
                                    <button
                                        type="button"
                                        onClick={handleStopGeneration}
                                        title="Stop generating answer"
                                        className="flex h-10 items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-4 text-xs font-semibold text-red-700 shadow-xs transition hover:bg-red-100 active:scale-[0.98]"
                                    >
                                        <Square size={13} className="fill-red-700" />
                                        <span>Stop</span>
                                    </button>
                                )}

                                {/* SUBMIT BUTTON */}
                                <button
                                    type="submit"
                                    disabled={loading || conversationLoading || !conversationId}
                                    className="h-10 rounded-lg bg-[#0f4c81] px-6 text-sm font-semibold text-white transition hover:bg-[#0b3e6a] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    {loading ? (
                                        <div className="flex items-center gap-2">
                                            <Loader2 size={16} className="animate-spin" />
                                            <span>Thinking...</span>
                                        </div>
                                    ) : (
                                        "Ask"
                                    )}
                                </button>
                            </form>
                        </div>
                    </div>
                </section>

                {/* ────────────────────────────────────────────────────────── */}
                {/* RIGHT SIDEBAR: Popular Queries & Resources                */}
                {/* ────────────────────────────────────────────────────────── */}
                <aside className="hidden w-75 shrink-0 border-l border-[#17395f]/10 bg-white p-4 xl:block">
                    <div className="rounded-xl border border-[#17395f]/10 bg-white shadow-xs">
                        <div className="flex items-center gap-3 border-b border-[#17395f]/8 px-4 py-3.5">
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#fff8df]">
                                <Lightbulb size={18} className="text-[#e9ad00]" />
                            </div>
                            <h2 className="text-sm font-bold text-[#0f4c81]">Popular Queries</h2>
                        </div>

                        <div className="divide-y divide-[#17395f]/8">
                            {[
                                "Requirements of agricultural tractor",
                                "Can you brief about the portland cement",
                                "Mixer grinder safety specifications",
                                "What is CRS certification under BIS?",
                            ].map((query) => (
                                <button
                                    key={query}
                                    type="button"
                                    onClick={() => {
                                        if (loading || conversationLoading || !conversationId) return;
                                        setValue("search_query", query);
                                        setTimeout(() => handleSubmit(onSubmit)(), 50);
                                    }}
                                    disabled={loading || conversationLoading || !conversationId}
                                    className="group flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-xs text-[#465f78] transition hover:bg-[#f4f8fc] disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <span>{query}</span>
                                    <ArrowRight
                                        size={14}
                                        className="shrink-0 text-[#8195a9] transition-transform duration-200 group-hover:translate-x-1 group-hover:text-[#0f4c81]"
                                    />
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="mt-4 rounded-xl border border-[#17395f]/6 bg-[#edf8f3] p-4">
                        <div className="flex items-center gap-3">
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white">
                                <BookOpen size={18} className="text-[#198754]" />
                            </div>
                            <h2 className="text-sm font-bold text-[#17663e]">Useful Links</h2>
                        </div>

                        <div className="mt-3 space-y-2">
                            <a
                                href="https://www.bis.gov.in/"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="group flex items-center justify-between text-xs font-medium text-[#0f4c81]"
                            >
                                Official BIS Portal
                                <ArrowRight
                                    size={13}
                                    className="transition-transform group-hover:translate-x-1"
                                />
                            </a>
                            <Link
                                href="/standards"
                                className="group flex items-center justify-between text-xs font-medium text-[#0f4c81]"
                            >
                                Browse Standards
                                <ArrowRight
                                    size={13}
                                    className="transition-transform group-hover:translate-x-1"
                                />
                            </Link>
                        </div>
                    </div>
                </aside>
            </div>
        </main>
    );
};

export default Page;