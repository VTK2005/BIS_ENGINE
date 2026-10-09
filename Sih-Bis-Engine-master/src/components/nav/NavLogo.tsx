import Image from "next/image";

export default function BisLogo() {
    return (
        <div className="flex items-center shrink-0" aria-label="BIS Engine Home">
            <Image
                src="/nav-icon.png"
                alt="BIS Engine"
                width={255}
                height={57}
                priority
                className="h-full w-auto sm:w-57 md:w-67"
            />
        </div>
    );
}