import { chromium, Browser } from "playwright";

const BIS_URL = "https://standards.bis.gov.in/website/know-your-standards";

export interface BisStandard {
    standardNumber: string;
    title: string;
    publishedIn: string | null;
    url: string;
}

async function getBrowser(): Promise<Browser> {
    const launchOptions = {
        headless: true,
        args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--disable-gpu",
        ],
    };

    // 1. Try default Playwright Chromium (now installed)
    try {
        return await chromium.launch(launchOptions);
    } catch {
        // 2. Fallback to installed system Google Chrome
        try {
            return await chromium.launch({ ...launchOptions, channel: "chrome" });
        } catch {
            // 3. Fallback to installed system Microsoft Edge
            return await chromium.launch({ ...launchOptions, channel: "msedge" });
        }
    }
}

export async function scrapeBisStandards(searchTerm: string): Promise<BisStandard[]> {
    const browser = await getBrowser();

    try {
        const page = await browser.newPage({
            userAgent:
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        });

        const url = `${BIS_URL}?searchTerm=${encodeURIComponent(searchTerm)}`;

        // Fast DOM navigation
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });

        // Wait for search listings; graceful catch so 0-result searches don't throw an error
        await page.waitForSelector(".search__listing", { timeout: 15_000 }).catch(() => null);

        const results = await page.locator(".search__listing").evaluateAll((elements) => {
            return elements.map((element) => {
                const link = element.querySelector("h2 a") as HTMLAnchorElement | null;
                const description = element.querySelector("p")?.textContent?.trim() ?? "";
                const publishedText =
                    element.querySelector(".text-secondary")?.textContent?.replace("Published In:", "").trim() ?? "";

                return {
                    standardNumber: link?.getAttribute("title")?.trim() || link?.textContent?.trim() || "",
                    title: description || link?.textContent?.trim() || "",
                    publishedIn: publishedText || null,
                    url: link?.getAttribute("href") ?? "",
                };
            });
        });

        return results
            .filter((item) => item.standardNumber && item.url)
            .map((item) => ({
                ...item,
                url: item.url.startsWith("http")
                    ? item.url
                    : new URL(item.url, "https://standards.bis.gov.in").href,
            }));
    } finally {
        await browser.close().catch(() => null);
    }
}