import BISSourceComponent, { BISSource } from "./BISSourceComponent";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type BISResponseData = {
    answer: string;
    sources: BISSource[];
};

type BISResponseProps = {
    response: BISResponseData;
};

const BISResponse = ({
    response,
}: BISResponseProps) => {
    return (
        <div className="flex flex-col gap-5 rounded-xl bg-[#edf5fb]/65 px-4 py-4">
            {/* ANSWER */}
            <div className="text-[15px] leading-7 text-[#334e68]">
                <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                        p: ({ children }) => (
                            <p className="mb-3 last:mb-0">
                                {children}
                            </p>
                        ),

                        ul: ({ children }) => (
                            <ul className="mb-4 list-disc space-y-2 pl-6">
                                {children}
                            </ul>
                        ),

                        ol: ({ children }) => (
                            <ol className="mb-4 list-decimal space-y-2 pl-6">
                                {children}
                            </ol>
                        ),

                        li: ({ children }) => (
                            <li className="leading-7">
                                {children}
                            </li>
                        ),

                        h1: ({ children }) => (
                            <h1 className="mb-3 text-xl font-bold tracking-tight text-[#17395f]">
                                {children}
                            </h1>
                        ),

                        h2: ({ children }) => (
                            <h2 className="mb-3 mt-5 text-lg font-semibold tracking-tight text-[#17395f]">
                                {children}
                            </h2>
                        ),

                        h3: ({ children }) => (
                            <h3 className="mb-2 mt-4 text-base font-semibold text-[#17395f]">
                                {children}
                            </h3>
                        ),

                        strong: ({ children }) => (
                            <strong className="font-semibold text-[#17395f]">
                                {children}
                            </strong>
                        ),

                        em: ({ children }) => (
                            <em className="italic text-[#526d87]">
                                {children}
                            </em>
                        ),

                        blockquote: ({ children }) => (
                            <blockquote className="my-4 border-l-[3px] border-[#0f4c81]/40 pl-4 text-[#607b96]">
                                {children}
                            </blockquote>
                        ),

                        code: ({ children }) => (
                            <code className="rounded-md bg-[#e3edf6] px-1.5 py-0.5 text-[13px] font-medium text-[#174d7b]">
                                {children}
                            </code>
                        ),

                        table: ({ children }) => (
                            <div className="my-5 w-full overflow-x-auto rounded-xl border border-[#17395f]/10 bg-white shadow-[0_3px_14px_rgba(23,57,95,0.04)]">
                                <table className="w-full min-w-155 border-collapse text-left text-[13px]">
                                    {children}
                                </table>
                            </div>
                        ),

                        thead: ({ children }) => (
                            <thead className="bg-[#eaf2f9]">
                                {children}
                            </thead>
                        ),

                        tbody: ({ children }) => (
                            <tbody className="divide-y divide-[#17395f]/8">
                                {children}
                            </tbody>
                        ),

                        tr: ({ children }) => (
                            <tr className="transition-colors hover:bg-[#f7fafc]">
                                {children}
                            </tr>
                        ),

                        th: ({ children }) => (
                            <th className="whitespace-nowrap border-b border-[#17395f]/10 px-4 py-3 text-[11px] font-bold uppercase tracking-[0.08em] text-[#315b7e]">
                                {children}
                            </th>
                        ),

                        td: ({ children }) => (
                            <td className="px-4 py-3 align-top leading-6 text-[#536e89]">
                                {children}
                            </td>
                        ),

                        hr: () => (
                            <hr className="my-6 border-0 border-t border-[#17395f]/10" />
                        ),

                        a: ({ children, href }) => (
                            <a
                                href={href}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-medium text-[#0f4c81] underline decoration-[#0f4c81]/25 underline-offset-2 transition hover:decoration-[#0f4c81]"
                            >
                                {children}
                            </a>
                        ),
                    }}
                >
                    {response.answer}
                </ReactMarkdown>

            </div>

            {/* SOURCES */}
            {response.sources.length > 0 && (
                <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2 px-2">
                        <div className="h-px w-4 bg-[#0f4c81]/25" />
                        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7890a6]">
                            References
                        </p>
                        <div className="h-px flex-1 bg-[#0f4c81]/10" />
                    </div>

                    <div className="space-y-2">
                        {response.sources.map((source, index) => (
                            <BISSourceComponent source={source} key={`${source.document}-${source.page}-${source.section}-${index}`} />
                        ),
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default BISResponse;