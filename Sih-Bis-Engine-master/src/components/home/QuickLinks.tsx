import Link from "next/link";
import { BookOpen, FileText, BadgeCheck, FlaskConical, Info, ArrowUpRight } from "lucide-react";

const quickLinks = [
    {
        title: "BIS Assistant",
        description: "Get instant answers about standards, certification, procedures and more.",
        href: "/assistant",
        icon: BookOpen,
        cardClass: "bg-blue-50 border-blue-100",
        iconClass: "bg-blue-100 text-blue-700",
        arrowClass: "text-blue-700",
    },
    {
        title: "Standards",
        description: "Search and explore Indian Standards (IS) with ease.",
        href: "/standards",
        icon: FileText,
        cardClass: "bg-green-50 border-green-100",
        iconClass: "bg-green-100 text-green-700",
        arrowClass: "text-green-700",
    },
    {
        title: "Certification",
        description: "Learn about ISI mark, CRS, Compulsory Registration and certification process.",
        href: "/certification",
        icon: BadgeCheck,
        cardClass: "bg-orange-50 border-orange-100",
        iconClass: "bg-orange-100 text-orange-700",
        arrowClass: "text-orange-600",
    },
    {
        title: "Laboratories",
        description: "Find BIS recognized laboratories across India.",
        href: "/laboratories",
        icon: FlaskConical,
        cardClass: "bg-purple-50 border-purple-100",
        iconClass: "bg-purple-100 text-purple-700",
        arrowClass: "text-purple-700",
    },
    {
        title: "About BIS",
        description: "Know more about BIS, its mission, vision and initiatives.",
        href: "/about",
        icon: Info,
        cardClass: "bg-pink-50 border-pink-100",
        iconClass: "bg-pink-100 text-pink-700",
        arrowClass: "text-pink-700",
    },
];

const QuickLinks = () => {
    return (
        <section className="w-full bg-white px-6">
            <div className="mx-auto grid w-full max-w-375 grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
                {quickLinks.map((item) => {
                    const Icon = item.icon;
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={`group relative h-48 overflow-hidden rounded-2xl border px-6 py-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl ${item.cardClass}`}
                        >
                            <div className="absolute -right-8 -top-8 h-28 w-28 rounded-full bg-white/30 transition-transform duration-500 group-hover:scale-125" />
                            <div className="relative flex h-full flex-col">
                                {/* Icon + title */}
                                <div className="flex items-start gap-4">
                                    <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full ${item.iconClass}`} >
                                        <Icon size={26} strokeWidth={2} />
                                    </div>

                                    <div className="pt-1">
                                        <h3 className="text-base font-bold tracking-tight text-slate-950">
                                            {item.title}
                                        </h3>

                                        <p className="mt-2 text-xs leading-relaxed text-slate-700">
                                            {item.description}
                                        </p>
                                    </div>
                                </div>

                                <div
                                    className={`mt-auto flex justify-end ${item.arrowClass}`}>
                                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/60 transition-all duration-300 group-hover:bg-white group-hover:scale-110">
                                        <ArrowUpRight
                                            size={19}
                                            strokeWidth={2}
                                            className="transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                                        />
                                    </div>
                                </div>
                            </div>
                        </Link>
                    );
                })}
            </div>
        </section>
    );
};

export default QuickLinks;