import { FileText, ExternalLink } from "lucide-react";

export type BISSource = {
    document: string;
    product?: string;
    category?: string;
    drive_url?: string;
    drive_path?: string;
    drive_file_id?: string;
    page: number;
    page_start?: number;
    page_end?: number;
    section: string;
    type: string;
    table_number?: string | null;
    table_title?: string | null;
    score?: number;
};

type BISSourceComponentProps = {
    source: BISSource;
};

const BISSourceComponent = ({ source }: BISSourceComponentProps) => {
    // Prefer Google Drive URL if present; otherwise fall back to local PDF route
    const documentUrl =
        source.drive_url && source.drive_url.trim()
            ? source.drive_url
            : `/pdfs/${encodeURIComponent(source.document)}#page=${source.page}`;

    const title = source.product || source.document;
    const subtitle = source.product ? source.document : null;

    return (
        <a
            href={documentUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="group block rounded-xl border border-gray-200 bg-white p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md"
        >
            <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 transition-colors group-hover:bg-blue-100">
                    <FileText size={18} />
                </div>

                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-semibold text-gray-900" title={title}>
                            {title}
                        </p>
                        {source.category && (
                            <span className="hidden shrink-0 rounded-md bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700 sm:inline-block">
                                {source.category}
                            </span>
                        )}
                    </div>

                    {subtitle && (
                        <p className="mt-0.5 truncate text-xs text-gray-500 font-mono" title={subtitle}>
                            {subtitle}
                        </p>
                    )}

                    <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500">
                        <span>Page {source.page}</span>
                        {source.section && (
                            <>
                                <span className="text-gray-300">•</span>
                                <span className="truncate max-w-[200px]" title={source.section}>
                                    {source.section}
                                </span>
                            </>
                        )}
                        {source.type && (
                            <>
                                <span className="text-gray-300">•</span>
                                <span className="rounded-md bg-gray-100 px-2 py-0.5 capitalize text-[11px]">
                                    {source.type}
                                </span>
                            </>
                        )}
                        {source.drive_url && (
                            <>
                                <span className="text-gray-300">•</span>
                                <span className="text-[11px] text-blue-600 font-medium">Google Drive</span>
                            </>
                        )}
                    </div>
                </div>

                <ExternalLink size={16} className="mt-1 shrink-0 text-gray-300 transition-colors group-hover:text-blue-600" />
            </div>
        </a>
    );
};

export default BISSourceComponent;