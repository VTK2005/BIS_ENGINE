"use client"
import Image from "next/image";
import { Search } from 'lucide-react';
import { useForm, SubmitHandler } from "react-hook-form";
import { useRouter } from "next/navigation";
import QuickLinks from "@/components/home/QuickLinks";
import HomeInfoCards from "@/components/home/HomeInfoCards";

type Inputs = {
    search_query: string;
};

export default function Home() {
    const router = useRouter();
    const { register, handleSubmit, setValue } = useForm<Inputs>();
    const onSubmit: SubmitHandler<Inputs> = (data) => {
        const query = data.search_query.trim();
        if (!query) return;
        router.push(`/assistant?query=${encodeURIComponent(query)}`);
    }

    const handlePopularSearch = (query: string) => {
        if (!query) return;
        setValue("search_query", query);
        onSubmit({ search_query: query });
    }
    const popularSearches = ["IS 456", "IS 875", "ISI Mark", "Food Safety", "Electrical Appliances"];
    return (
        <div className="bg-white">
            <main className="flex flex-col">
                <section className="relative overflow-hidden bg-[#f8f8f3]">
                    <div className="relative mx-auto h-120 w-full max-w-[1600px]">
                        <div className="absolute inset-y-0 right-0 w-[52%] overflow-hidden">
                            <Image src="/hero_home.jpg" alt="Bureau of Indian Standards" fill priority className="object-cover object-center" />

                            <div className="absolute inset-y-0 left-0 w-32 bg-linear-to-r from-[#f8f8f3] to-transparent" />
                        </div>

                        <div className="relative z-10 flex w-full items-center h-full">
                            <div className="w-full px-8 py-10 sm:px-10 md:w-[56%] md:px-12 lg:px-16">
                                <h1 className="max-w-130 text-4xl font-extrabold leading-[1.05] tracking-tight text-[#082b59] sm:text-5xl">
                                    Explore
                                    <br />
                                    Indian Standards
                                    <br />
                                    with Ease
                                </h1>

                                <p className="mt-3 text-sm text-[#243b53] sm:text-base">
                                    Search. Learn. Get Certified. All in one place.
                                </p>

                                <form onSubmit={handleSubmit(onSubmit)} className="mt-5 max-w-135">
                                    <div className="flex h-14 items-center rounded-full border border-gray-200 bg-white p-1 shadow-sm">
                                        <Search size={20} className="ml-3 shrink-0 text-gray-500" />

                                        <input
                                            type="text"
                                            id="search_query"
                                            placeholder="Search for BIS standards, codes, certification, laboratories..."
                                            {...register("search_query")}
                                            className="h-full min-w-0 flex-1 border-none bg-transparent px-3 text-xl text-gray-700 outline-none placeholder:text-gray-400 sm:text-sm"
                                        />

                                        <button
                                            type="submit"
                                            className="flex h-12 w-12 shrink-0 cursor-pointer items-center justify-center rounded-full bg-green-600 text-white transition hover:bg-green-700"
                                        >
                                            <span className="text-lg leading-none">→</span>
                                        </button>
                                    </div>
                                </form>

                                {/* Popular searches */}
                                <div className="mt-3 flex max-w-140 flex-wrap items-center gap-1.5">
                                    <span className="mr-1 text-[10px] font-medium text-gray-600">
                                        Popular Searches:
                                    </span>

                                    {popularSearches.map((item) => (
                                        <button
                                            key={item}
                                            type="button"
                                            onClick={() => handlePopularSearch(item)}
                                            className="rounded-full border border-gray-200 bg-white px-2.5 py-1 text-[10px] text-gray-600 transition hover:border-gray-300 hover:bg-gray-50"
                                        >
                                            {item}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Curved transition */}
                        <div
                            className="pointer-events-none absolute inset-y-0 left-[47%] z-20 hidden w-32 -translate-x-1/2 bg-[#f8f8f3] md:block"
                            style={{ clipPath: "ellipse(75% 100% at 0% 50%)" }}
                        />

                        {/* Right side highlights */}
                        <div className="absolute right-5 top-8 z-30 hidden flex-col gap-4 text-white lg:flex">
                            <div className="flex items-center gap-2 text-xs">
                                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-orange-500">
                                    ✓
                                </span>
                                <span>
                                    Safer
                                    <br />
                                    Products
                                </span>
                            </div>

                            <div className="flex items-center gap-2 text-xs">
                                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-green-600">
                                    ✓
                                </span>
                                <span>
                                    Greener
                                    <br />
                                    Tomorrow
                                </span>
                            </div>

                            <div className="flex items-center gap-2 text-xs">
                                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-600">
                                    ✓
                                </span>
                                <span>
                                    Stronger
                                    <br />
                                    Communities
                                </span>
                            </div>
                        </div>
                    </div>
                </section>

                <div className="mt-4">
                    <QuickLinks />
                </div>

                <div className="mt-4">
                    <HomeInfoCards />
                </div>
            </main>
        </div>
    );
}
