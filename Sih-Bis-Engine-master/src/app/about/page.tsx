"use client";

import Link from "next/link";
import {
    ArrowRight,
    ArrowUpRight,
    Bot,
    Building2,
    FileText,
    Search,
    ShieldCheck,
    Sparkles,
} from "lucide-react";

const features = [
    {
        icon: FileText,
        number: "01",
        title: "Standards",
        text: "Look up Indian Standards and get to the official BIS information without unnecessary searching.",
        href: "/standards",
    },
    {
        icon: Building2,
        number: "02",
        title: "Laboratories",
        text: "Find BIS laboratories, their contact details and the official testing scope published by BIS.",
        href: "/laboratories",
    },
    {
        icon: Bot,
        number: "03",
        title: "Assistant",
        text: "Ask BIS-related questions and use the assistant as a starting point for finding relevant information.",
        href: "/assistant",
    },
];

export default function AboutPage() {
    return (
        <main className="min-h-screen bg-white text-[#17395f]">
            {/* HERO */}
            <section className="border-b border-[#17395f]/10 bg-[#f4f8fc]">
                <div className="mx-auto max-w-6xl px-6 py-20 sm:py-28">
                    <div className="grid items-end gap-12 lg:grid-cols-[1.25fr_0.75fr]">
                        <div>
                            <div className="mb-6 flex items-center gap-3">
                                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#dcecff] text-[#0d4781]">
                                    <ShieldCheck size={20} />
                                </div>

                                <span className="text-sm font-semibold uppercase tracking-[0.16em] text-[#37648f]">
                                    About BIS Engine
                                </span>
                            </div>

                            <h1 className="max-w-4xl text-5xl font-semibold leading-[1.05] tracking-tight text-[#12365d] sm:text-6xl lg:text-7xl">
                                BIS information,
                                <br />
                                without the digging.
                            </h1>

                            <p className="mt-7 max-w-2xl text-lg leading-8 text-[#54708d]">
                                BIS Engine is a simpler way to explore standards,
                                laboratories, updates and BIS-related information
                                from one place.
                            </p>

                            <div className="mt-9 flex flex-wrap gap-3">
                                <Link
                                    href="/standards"
                                    className="inline-flex items-center gap-2 rounded-lg bg-[#0f4c81] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#0b3e6a]"
                                >
                                    Explore standards
                                    <ArrowUpRight size={16} />
                                </Link>

                                <Link
                                    href="/assistant"
                                    className="inline-flex items-center gap-2 rounded-lg border border-[#17395f]/15 bg-white px-5 py-3 text-sm font-semibold text-[#17395f] transition hover:bg-[#f7faff]"
                                >
                                    Try the assistant
                                    <ArrowUpRight size={16} />
                                </Link>
                            </div>
                        </div>

                        {/* RIGHT SIDE VISUAL */}
                        <div className="lg:justify-self-end">
                            <div className="relative w-full max-w-sm rounded-3xl border border-[#17395f]/10 bg-white p-5 shadow-[0_18px_50px_rgba(23,57,95,0.08)]">
                                <div className="flex items-center justify-between border-b border-[#17395f]/10 pb-4">
                                    <div>
                                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7590ab]">
                                            BIS Engine
                                        </p>

                                        <p className="mt-1 text-sm font-medium text-[#17395f]">
                                            A better way in
                                        </p>
                                    </div>

                                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#123f6c] text-white">
                                        <Sparkles size={18} />
                                    </div>
                                </div>

                                <div className="space-y-3 py-4">
                                    <MiniRow
                                        icon={<Search size={17} />}
                                        title="Find a standard"
                                        text="Search BIS standards"
                                    />

                                    <MiniRow
                                        icon={<Building2 size={17} />}
                                        title="Find a laboratory"
                                        text="Browse BIS laboratories"
                                    />

                                    <MiniRow
                                        icon={<Bot size={17} />}
                                        title="Ask BIS"
                                        text="Get help finding information"
                                    />
                                </div>

                                <div className="mt-1 rounded-xl bg-[#edf5fb] px-4 py-3">
                                    <p className="text-xs leading-5 text-[#52718f]">
                                        Designed to make official information easier
                                        to find and easier to use.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* WHY */}
            <section className="border-b border-[#17395f]/10">
                <div className="mx-auto max-w-6xl px-6 py-20 sm:py-24">
                    <div className="grid gap-14 lg:grid-cols-[0.7fr_1.3fr]">
                        <div>
                            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#7390ac]">
                                Why this exists
                            </p>

                            <div className="mt-5 h-px w-14 bg-[#0f4c81]" />
                        </div>

                        <div>
                            <h2 className="max-w-3xl text-3xl font-semibold leading-tight tracking-tight text-[#17395f] sm:text-4xl">
                                The information is already there.
                                <br />
                                Finding it is the annoying part.
                            </h2>

                            <div className="mt-7 max-w-2xl space-y-5 text-[15px] leading-8 text-[#607b96]">
                                <p>
                                    BIS publishes a large amount of useful information
                                    covering standards, certification, laboratories,
                                    testing and more.
                                </p>

                                <p>
                                    But when you are actually looking for something,
                                    the experience can involve multiple pages,
                                    different sections and a fair amount of searching.
                                </p>

                                <p>
                                    BIS Engine was built around that simple problem:
                                    make the information easier to discover without
                                    getting in the way.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* HOW IT WORKS */}
            <section className="border-b border-[#17395f]/10 bg-[#f4f8fc]">
                <div className="mx-auto max-w-6xl px-6 py-20 sm:py-24">
                    <div className="max-w-2xl">
                        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#7390ac]">
                            How BIS Engine works
                        </p>

                        <h2 className="mt-4 text-3xl font-semibold tracking-tight text-[#17395f] sm:text-4xl">
                            Three steps. Nothing complicated.
                        </h2>
                    </div>

                    <div className="mt-12 grid overflow-hidden rounded-2xl border border-[#17395f]/10 bg-white md:grid-cols-3">
                        <ProcessStep
                            number="01"
                            title="Official sources"
                            text="Information comes from BIS and its official information systems."
                        />

                        <ProcessStep
                            number="02"
                            title="BIS Engine"
                            text="We bring the relevant information into a cleaner, easier-to-use interface."
                            bordered
                        />

                        <ProcessStep
                            number="03"
                            title="You"
                            text="Search, browse and follow the official source when you need the full details."
                            bordered
                        />
                    </div>
                </div>
            </section>

            {/* FEATURES */}
            <section className="border-b border-[#17395f]/10">
                <div className="mx-auto max-w-6xl px-6 py-20 sm:py-24">
                    <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
                        <div>
                            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#7390ac]">
                                What you can do
                            </p>

                            <h2 className="mt-4 text-3xl font-semibold tracking-tight text-[#17395f] sm:text-4xl">
                                Built around actual use cases.
                            </h2>
                        </div>

                        <p className="max-w-md text-sm leading-6 text-[#6a839d]">
                            Three things you are likely to need when working
                            with BIS information.
                        </p>
                    </div>

                    <div className="mt-12 grid gap-4 md:grid-cols-3">
                        {features.map((feature) => {
                            const Icon = feature.icon;

                            return (
                                <Link
                                    key={feature.number}
                                    href={feature.href}
                                    className="group rounded-2xl border border-[#17395f]/10 bg-white p-6 transition duration-200 hover:-translate-y-1 hover:border-[#0f4c81]/25 hover:shadow-[0_12px_30px_rgba(23,57,95,0.07)]"
                                >
                                    <div className="flex items-center justify-between">
                                        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#edf5fb] text-[#0f4c81]">
                                            <Icon size={20} />
                                        </div>

                                        <span className="text-xs font-semibold tracking-[0.12em] text-[#9aafc1]">
                                            {feature.number}
                                        </span>
                                    </div>

                                    <h3 className="mt-12 text-xl font-semibold text-[#17395f]">
                                        {feature.title}
                                    </h3>

                                    <p className="mt-3 min-h-18 text-sm leading-7 text-[#69839c]">
                                        {feature.text}
                                    </p>

                                    <div className="mt-6 flex items-center gap-2 text-sm font-semibold text-[#0f4c81]">
                                        Explore
                                        <ArrowRight
                                            size={16}
                                            className="transition-transform duration-200 group-hover:translate-x-1"
                                        />
                                    </div>
                                </Link>
                            );
                        })}
                    </div>
                </div>
            </section>

            {/* PRINCIPLE */}
            <section className="border-b border-[#17395f]/10 bg-white">
                <div className="mx-auto max-w-5xl px-6 py-24 text-center sm:py-28">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#edf5fb] text-[#0f4c81]">
                        <ShieldCheck size={22} />
                    </div>

                    <p className="mt-7 text-sm font-semibold uppercase tracking-[0.16em] text-[#7390ac]">
                        The principle
                    </p>

                    <h2 className="mt-5 text-4xl font-semibold leading-tight tracking-tight text-[#17395f] sm:text-5xl">
                        Official information first.
                        <br />
                        Better discovery second.
                    </h2>

                    <p className="mx-auto mt-7 max-w-2xl text-base leading-8 text-[#69839c]">
                        BIS Engine is not a replacement for BIS. It is a
                        layer that helps you get to the relevant information
                        faster, while keeping the official source close at
                        hand.
                    </p>
                </div>
            </section>

            {/* BOTTOM CTA */}
            <section className="bg-[#123f6c]">
                <div className="mx-auto max-w-6xl px-6 py-16 sm:py-20">
                    <div className="flex flex-col gap-8 sm:flex-row sm:items-center sm:justify-between">
                        <div className="max-w-xl">
                            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-white/55">
                                Start exploring
                            </p>

                            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white">
                                Looking for something from BIS?
                            </h2>

                            <p className="mt-3 text-sm leading-7 text-white/65">
                                Start with a standard, a laboratory, or simply
                                ask the assistant.
                            </p>
                        </div>

                        <div className="flex flex-wrap gap-3">
                            <Link
                                href="/standards"
                                className="inline-flex items-center gap-2 rounded-lg bg-white px-5 py-3 text-sm font-semibold text-[#17395f] transition hover:bg-[#eef5fb]"
                            >
                                Search standards
                                <ArrowUpRight size={16} />
                            </Link>

                            <Link
                                href="/assistant"
                                className="inline-flex items-center gap-2 rounded-lg border border-white/25 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
                            >
                                Ask the assistant
                                <ArrowUpRight size={16} />
                            </Link>
                        </div>
                    </div>
                </div>
            </section>
        </main>
    );
}

function MiniRow({
    icon,
    title,
    text,
}: {
    icon: React.ReactNode;
    title: string;
    text: string;
}) {
    return (
        <div className="flex items-center gap-3 rounded-xl border border-[#17395f]/8 px-3 py-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#edf5fb] text-[#0f4c81]">
                {icon}
            </div>

            <div className="min-w-0">
                <p className="text-sm font-semibold text-[#17395f]">
                    {title}
                </p>

                <p className="mt-0.5 text-xs text-[#7790a8]">
                    {text}
                </p>
            </div>
        </div>
    );
}

function ProcessStep({ number, title, text, bordered = false }: {number: string; title: string; text: string; bordered?: boolean }) {
    return (
        <div className={`p-7 sm:p-8 ${bordered ? "border-t border-[#17395f]/10 md:border-l md:border-t-0" : ""}`} >
            <span className="text-xs font-bold tracking-[0.14em] text-[#8aa1b6]">
                {number}
            </span>

            <h3 className="mt-10 text-xl font-semibold text-[#17395f]">
                {title}
            </h3>

            <p className="mt-3 text-sm leading-7 text-[#6a839c]">
                {text}
            </p>
        </div>
    );
}