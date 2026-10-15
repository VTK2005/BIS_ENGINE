"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Lock, Mail, ArrowRight, ShieldCheck, AlertCircle, Loader2 } from "lucide-react";
import { apiFetch, apiUrl, getTokenFromResponse, readJson, setAccessToken } from "@/lib/apiClient";

declare global {
    interface Window {
        google?: {
            accounts: {
                id: {
                    initialize: (options: any) => void;
                    renderButton: (parent: HTMLElement, options: any) => void;
                    prompt: () => void;
                };
            };
        };
    }
}

export default function LoginPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const redirectUrl = searchParams.get("redirect") || "/assistant";

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Read error from URL query params (set by Google OAuth callback on failure)
    useEffect(() => {
        const urlError = searchParams.get("error");
        if (urlError) setError(decodeURIComponent(urlError));
    }, [searchParams]);

    const handleOAuthRedirect = () => {
        const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
        if (!clientId) {
            setError(
                "Google Client ID is not configured. Please set NEXT_PUBLIC_GOOGLE_CLIENT_ID in your environment."
            );
            return;
        }

        const redirectUri =
            process.env.NEXT_PUBLIC_GOOGLE_REDIRECT_URI || apiUrl("auth/callback/google");
        const scope = "email profile openid";
        // Pass the desired redirect as 'state' so the callback can redirect there after login
        const state = encodeURIComponent(redirectUrl);
        const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(
            clientId
        )}&redirect_uri=${encodeURIComponent(
            redirectUri
        )}&response_type=code&scope=${encodeURIComponent(scope)}&access_type=offline&prompt=consent&state=${state}`;

        window.location.href = url;
    };

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setLoading(true);

        try {
            const res = await apiFetch("/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password }),
            });

            const data = await readJson<{ message?: string } & Record<string, unknown>>(res);

            if (!res.ok) {
                throw new Error(data?.message || "Invalid credentials");
            }

            const token = getTokenFromResponse(data);
            if (token) setAccessToken(token);

            router.push(redirectUrl);
            router.refresh();
        } catch (err: any) {
            setError(err.message || "Login failed. Please try again.");
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
                        Welcome Back
                    </h1>
                    <p className="mt-1.5 text-sm text-[#5f7d9c]">
                        Sign in to access your BIS search history & conversations
                    </p>
                </div>

                {/* Error Banner */}
                {error && (
                    <div className="mt-6 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-3.5 text-xs text-red-800">
                        <AlertCircle size={16} className="mt-0.5 shrink-0 text-red-600" />
                        <span>{error}</span>
                    </div>
                )}

                {/* Login Form */}
                <form onSubmit={handleLogin} className="mt-6 space-y-4">
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
                        <div className="flex items-center justify-between">
                            <label className="block text-xs font-semibold text-[#17395f]">
                                Password
                            </label>
                        </div>
                        <div className="relative mt-1.5">
                            <Lock
                                size={17}
                                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400"
                            />
                            <input
                                type="password"
                                required
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
                                <span>Signing in...</span>
                            </>
                        ) : (
                            <>
                                <span>Sign In</span>
                                <ArrowRight size={16} />
                            </>
                        )}
                    </button>
                </form>

                {/* Divider */}
                <div className="relative my-6">
                    <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t border-gray-200" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                        <span className="bg-white px-3 text-[#7e9bb9]">Or continue with</span>
                    </div>
                </div>

                {/* Google Sign-In Button */}
                <button
                    type="button"
                    onClick={handleOAuthRedirect}
                    className="flex w-full items-center justify-center gap-3 rounded-xl border border-gray-200 bg-white py-3 text-sm font-semibold text-gray-700 shadow-xs transition hover:bg-gray-50 hover:border-gray-300 active:scale-[0.99]"
                >
                    <svg className="h-5 w-5" viewBox="0 0 24 24">
                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                    </svg>
                    <span>Sign in with Google</span>
                </button>

                {/* Footer Link */}
                <p className="mt-8 text-center text-xs text-[#5f7d9c]">
                    Don't have an account?{" "}
                    <Link
                        href={`/register?redirect=${encodeURIComponent(redirectUrl)}`}
                        className="font-semibold text-[#0f4c81] hover:underline"
                    >
                        Create an account
                    </Link>
                </p>
            </div>
        </div>
    );
}
