import * as cheerio from "cheerio";

const BIS_URL = "https://www.bis.gov.in/whats-new/?lang=en";

export interface ScrapedBisUpdate {
    title: string;
    publishedDate: string;
    readMoreLink: string | null;
    downloadLink: string | null;
    type: string | null;
    size: string | null;
}

function absoluteUrl(url: string | undefined): string | null {
    if (!url) {
        return null;
    }

    try {
        return new URL(url, BIS_URL).href;
    } catch {
        return null;
    }
}

export async function scrapeBisUpdates(): Promise<ScrapedBisUpdate[]> {
    const response = await fetch(BIS_URL, {
        headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140 Safari/537.36",
            Accept: "text/html,application/xhtml+xml",
        },
        cache: "no-store",
    });

    if (!response.ok) {
        throw new Error(`BIS request failed: ${response.status} ${response.statusText}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);
    const updates: ScrapedBisUpdate[] = [];

    $("h2").each((_, heading) => {
        const titleLink = $(heading).find("a").first();

        if (!titleLink.length) {
            return;
        }

        const title = titleLink.text().trim();
        if (!title) {
            return;
        }

        if (title.toLowerCase() === "whats new" || title.toLowerCase() === "what's new") {
            return;
        }

        let type: string | null = null;
        let size: string | null = null;
        let publishedDate: string | null = null;
        let readMoreLink: string | null = null;
        let downloadLink: string | null = null;

        let sibling = $(heading).next();

        while (sibling.length && sibling[0].name !== "h2") {
            const text = sibling.text().replace(/\s+/g, " ").trim();

            if (text.toLowerCase().startsWith("type:")) {
                type = text.substring(5).trim();
            }

            if (text.toLowerCase().startsWith("size:")) {
                size = text.substring(5).trim();
            }

            if (text.toLowerCase().startsWith("published on:")) {
                publishedDate = text.substring("published on:".length).trim();
            }

            sibling.find("a").each((_, anchor) => {
                const linkText = $(anchor).text().replace(/\s+/g, " ").trim().toLowerCase();
                const href = $(anchor).attr("href");

                if (linkText.includes("readmore")) {
                    readMoreLink = absoluteUrl(href);
                }

                if (linkText === "download") {
                    downloadLink = absoluteUrl(href);
                }
            });

            sibling = sibling.next();
        }

        const titleUrl = absoluteUrl(titleLink.attr("href"));

        if (!readMoreLink) {
            readMoreLink = titleUrl;
        }

        if (!downloadLink) {
            downloadLink = titleUrl;
        }

        if (!publishedDate) {
            return;
        }

        updates.push({
            title,
            publishedDate,
            readMoreLink,
            downloadLink,
            type,
            size,
        });
    });

    return updates;
}