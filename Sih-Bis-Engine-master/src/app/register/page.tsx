"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Lock, Mail, User as UserIcon, ArrowRight, ShieldCheck, AlertCircle, Loader2 } from "lucide-react";
import { apiFetch, getTokenFromResponse, readJson, setAccessToken } from "@/lib/apiClient";

export default function RegisterPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const redirectUrl = searchParams.get("redirect") || "/assistant";

    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (password.length < 6) {
            setError("Password must be at least 6 characters long");
            return;
        }

        setLoading(true);

        try {
            const res = await apiFetch("/auth/register", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name, email, password }),
            });

            const data = await readJson<{ message?: string } & Record<string, unknown>>(res);

            if (!res.ok) {
                throw new Error(data?.message || "Registration failed");
            }

            const token = getTokenFromResponse(data);
            if (token) setAccessToken(token);

            router.push(redirectUrl);
            router.refresh();
        } catch (err: any) {
            setError(err.message || "Registration failed. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex min-h-[90vh] items-center justify-center bg-[#f4f7fa] px-4 py-12">
            <div className="w-full max-w-md rounded-2xl border border-[#17395f]/10 bg-white p-8 shadow-sm sm:p-10">
                {/* Header */}
                <div className="text-center">
                    <div className="mx-auto flex h-13 w-13 items-center justify-center rounded-2xl bg-[#0f4c81]/10 text-[#0f4c81]">
                        <ShieldCheck size={30} strokeWidth={2.2} />
                    </div>
                    <h1 className="mt-4 text-2xl font-bold tracking-tight text-[#17395f]">
                        Create an Account
                    </h1>
                    <p className="mt-1.5 text-sm text-[#5f7d9c]">
                        Register to save chat history and standard queries
                    </p>
                </div>

                {/* Error Banner */}
                {error && (
                    <div className="mt-6 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-3.5 text-xs text-red-800">
                        <AlertCircle size={16} className="mt-0.5 shrink-0 text-red-600" />
                        <span>{error}</span>
                    </div>
                )}

                {/* Register Form */}
                <form onSubmit={handleRegister} className="mt-6 space-y-4">
                    <div>
                        <label className="block text-xs font-semibold text-[#17395f]">
                            Full Name
                        </label>
                        <div className="relative mt-1.5">
                            <UserIcon
                                size={17}
                                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400"
                            />
                            <input
                                type="text"
                                required
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="Tarun Verma"
                                className="w-full rounded-xl border border-gray-200 bg-[#fbfcfd] py-2.5 pl-10 pr-3.5 text-sm text-gray-800 outline-none transition focus:border-[#0f4c81] focus:bg-white focus:ring-2 focus:ring-[#0f4c81]/15"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-[#17395f]">
                            Email Address
                        </label>
                        <div className="relative mt-1.5">
                            <Mail
                                size={17}
                                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400"
                            />
                            <input
                                type="email"
                                required
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="name@domain.com"
                                className="w-full rounded-xl border border-gray-200 bg-[#fbfcfd] py-2.5 pl-10 pr-3.5 text-sm text-gray-800 outline-none transition focus:border-[#0f4c81] focus:bg-white focus:ring-2 focus:ring-[#0f4c81]/15"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-[#17395f]">
                            Password (min 6 characters)
                        </label>
                        <div className="relative mt-1.5">
                            <Lock
                                size={17}
                                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400"
                            />
                            <input
                                type="password"
                                required
                                minLength={6}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="••••••••"
                                className="w-full rounded-xl border border-gray-200 bg-[#fbfcfd] py-2.5 pl-10 pr-3.5 text-sm text-gray-800 outline-none transition focus:border-[#0f4c81] focus:bg-white focus:ring-2 focus:ring-[#0f4c81]/15"
                            />
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-[#0f4c81] py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0b3e6a] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-65"
                    >
                        {loading ? (
                            <>
                                <Loader2 size={17} className="animate-spin" />
                                <span>Creating account...</span>
                            </>
                        ) : (
                            <>
                                <span>Register</span>
                                <ArrowRight size={16} />
                            </>
                        )}
                    </button>
                </form>

                {/* Footer Link */}
                <p className="mt-8 text-center text-xs text-[#5f7d9c]">
                    Already have an account?{" "}
                    <Link
                        href={`/login?redirect=${encodeURIComponent(redirectUrl)}`}
                        className="font-semibold text-[#0f4c81] hover:underline"
                    >
                        Sign in
                    </Link>
                </p>
            </div>
        </div>
    );
}
