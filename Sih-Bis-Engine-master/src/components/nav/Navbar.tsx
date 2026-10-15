"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { LogOut, LogIn } from "lucide-react";
import BisLogo from "@/components/nav/NavLogo";
import { apiFetch, clearAccessToken, readJson } from "@/lib/apiClient";

const navLinks = [
    { name: "Home", href: "/" },
    { name: "Assistant", href: "/assistant" },
    { name: "Standards", href: "/standards" },
    { name: "Laboratories", href: "/laboratories" },
    { name: "Updates", href: "/updates" },
    { name: "About", href: "/about" },
];

interface UserProfile {
    id: string;
    name: string;
    email: string;
    image?: string;
}

const Navbar = () => {
    const pathname = usePathname();
    const router = useRouter();
    const [user, setUser] = useState<UserProfile | null>(null);

    useEffect(() => {
        const checkAuth = async () => {
            try {
                const res = await apiFetch("/auth/me");
                if (res.ok) {
                    const data = await readJson<{ authenticated?: boolean; user?: UserProfile }>(res);
                    if (data?.authenticated && data.user) {
                        setUser(data.user);
                    } else {
                        setUser(null);
                    }
                } else {
                    setUser(null);
                }
            } catch {
                setUser(null);
            }
        };

        checkAuth();
    }, [pathname]);

    const handleLogout = async () => {
        try {
            await apiFetch("/auth/logout", { method: "POST" });
            clearAccessToken();
            setUser(null);
            router.push("/");
            router.refresh();
        } catch (error) {
            console.error("Logout failed:", error);
        }
    };

    return (
        <nav className="sticky top-0 z-50 flex items-center justify-between border-b border-gray-100 bg-white px-6 py-2.5 shadow-sm">

            {/* ── Logo ── */}
            <Link href="/" className="shrink-0 flex items-center">
                <BisLogo />
            </Link>

            {/* ── Nav links + Auth ── */}
            <div className="flex items-center gap-3">
                <ul className="flex items-center">
                    {navLinks.map((link) => {
                        const isActive = pathname === link.href;
                        return (
                            <li key={link.href} className="relative">
                                <Link
                                    href={link.href}
                                    className={`relative z-10 block rounded-md px-4 py-2 text-sm font-medium transition-colors duration-200 ${
                                        isActive ? "text-white" : "text-gray-600 hover:text-[#0f4c81]"
                                    }`}
                                >
                                    {link.name}
                                </Link>

                                {isActive && (
                                    <motion.div
                                        layoutId="active-tab"
                                        className="absolute inset-0 rounded-md bg-[#0f4c81]"
                                        transition={{ type: "spring", stiffness: 400, damping: 30 }}
                                    />
                                )}
                            </li>
                        );
                    })}
                </ul>

                {/* Divider */}
                <div className="ml-1 h-6 w-px bg-gray-200" />

                {/* User Auth Section */}
                <div className="flex items-center">
                    {user ? (
                        <div className="flex items-center gap-2.5">
                            {/* Avatar */}
                            <div className="flex items-center gap-2">
                                {user.image ? (
                                    <img
                                        src={user.image}
                                        alt={user.name}
                                        className="h-8 w-8 rounded-full object-cover border border-gray-200 shadow-sm"
                                    />
                                ) : (
                                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#0f4c81] text-xs font-bold text-white shadow-sm">
                                        {user.name.charAt(0).toUpperCase()}
                                    </div>
                                )}
                                <span className="hidden text-sm font-semibold text-[#17395f] md:inline max-w-32 truncate">
                                    {user.name}
                                </span>
                            </div>

                            {/* Sign out */}
                            <button
                                onClick={handleLogout}
                                title="Sign Out"
                                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-gray-500 transition hover:bg-red-50 hover:text-red-600"
                            >
                                <LogOut size={14} />
                                <span className="hidden sm:inline">Sign Out</span>
                            </button>
                        </div>
                    ) : (
                        <Link
                            href="/login"
                            className="flex items-center gap-1.5 rounded-lg bg-[#0f4c81] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0b3e6a] active:scale-[0.98]"
                        >
                            <LogIn size={15} />
                            <span>Sign In</span>
                        </Link>
                    )}
                </div>
            </div>
        </nav>
    );
};

export default Navbar;
