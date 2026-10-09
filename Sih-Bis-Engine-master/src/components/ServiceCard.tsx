import type { LucideIcon } from "lucide-react";

interface ServiceCardProps {
    icon: LucideIcon;
    title: string;
    description: string;
}

const ServiceCard = ({ icon: Icon, title, description }: ServiceCardProps) => {
    return (
        <div className="w-85 max-w-sm h-80 rounded-2xl border border-gray-300 bg-white p-7">
            <div className="mb-6 flex h-15 w-15 items-center justify-center rounded-xl bg-blue-100">
                <Icon className="h-7 w-7 text-blue-700" strokeWidth={2} />
            </div>

            <h3 className="text-2xl font-semibold tracking-tight text-[#07152B]">
                {title}
            </h3>

            <p className="mt-5 text-lg leading-relaxed text-gray-600">
                {description}
            </p>
        </div>
    );
};

export default ServiceCard;