export default function BisLogo() {
    return (
        <div className="flex items-center shrink-0" aria-label="BISAssist Home">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
                src="/bis-assist-logo.png"
                alt="BISAssist – Your Guide to Indian Standards"
                style={{ height: "48px", width: "auto", objectFit: "contain" }}
            />
        </div>
    );
}