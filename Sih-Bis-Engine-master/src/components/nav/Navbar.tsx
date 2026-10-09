"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import BisLogo from "@/components/nav/NavLogo";

const navLinks = [
    { name: "Home", href: "/" },
    { name: "Assistant", href: "/assistant" },
    { name: "Standards", href: "/standards" },
    { name: "Laboratories", href: "/laboratories" },
    { name: "Updates", href: "/updates" },
    { name: "About", href: "/about" }
];

const Navbar = () => {
    const pathname = usePathname();

    return (
        <nav className="sticky top-0 z-50 flex items-center justify-between bg-white px-4 shadow">
            <Link href="/" className="shrink-0">
                <BisLogo />
            </Link>

            <ul className="flex items-center">
                {navLinks.map((link) => {
                    const isActive = pathname === link.href;
                    return (
                        <li key={link.href} className="relative">
                            <Link
                                href={link.href}
                                className={`relative z-10 block rounded-md px-6 py-2 text-sm font-medium transition-colors duration-200 ${isActive ? "text-white" : "text-gray-600 hover:text-blue-700"}`
                                }
                            >
                                {link.name}
                            </Link>

                            {isActive && (
                                <motion.div
                                    layoutId="active-tab"
                                    className="absolute inset-0 rounded-md bg-green-600"
                                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                                />
                            )}
                        </li>
                    );
                })}
            </ul>
        </nav>
    );
};

export default Navbar;