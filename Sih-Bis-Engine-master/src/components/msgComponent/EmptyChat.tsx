import { ShieldCheck } from "lucide-react";

type EmptyChatProps = {
    onSuggestionClick?: (query: string) => void;
};

const EmptyChat = ({ onSuggestionClick }: EmptyChatProps) => {
    return (
        <section className="flex min-h-[calc(100vh-220px)] items-center justify-center px-4">
            <div className="w-full max-w-3xl text-center">
                <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#0B1F3A] shadow-[0_8px_24px_rgba(11,31,58,0.18)]">
                    <span className="text-xl font-bold text-white">B</span>
                </div>

                <h2 className="text-3xl font-bold tracking-tight text-[#0B1F3A] sm:text-4xl">
                    How can I help with BIS?
                </h2>

                <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-gray-500 sm:text-[15px]">
                    Ask about Indian Standards, certification,
                    testing, laboratories, hallmarking, or any
                    BIS-related requirement.
                </p>

                <div className="mt-8 flex items-center justify-center gap-2 text-xs text-gray-400">
                    <ShieldCheck size={14} className="text-emerald-500" />
                    <span> Source-backed answers from BIS knowledge </span>
                </div>
            </div>
        </section>
    );
};

export default EmptyChat;