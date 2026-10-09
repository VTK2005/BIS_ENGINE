import * as cheerio from "cheerio";

const BIS_LIMS_BASE_URL = process.env.BIS_LIMS_BASE_URL || "https://lims.bis.gov.in";
const BIS_LABS_PATH = "/home/bis_labs/";

export interface BisLaboratory {
    id: string;
    labCode: string;
    name: string;
    address: string;
    contactPerson: string;
    contactNumber: string;
    email: string;
    imageUrl: string;
    scopeUrl: string;
}

export interface BisLaboratorySearchParams {
    name?: string;
    state?: string;
    district?: string;
}

function cleanText(value: string | undefined | null): string {
    if (!value) {
        return "";
    }

    return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}


function absoluteUrl(url: string): string {
    return new URL(url, BIS_LIMS_BASE_URL).href;
}

export async function scrapeBisLaboratories(params: BisLaboratorySearchParams = {}): Promise<BisLaboratory[]> {

    const searchParams = new URLSearchParams();
    if (params.name?.trim()) {
        searchParams.set("lab_name__icontains", params.name.trim());
    }

    if (params.state?.trim()) {
        searchParams.set("lab_state", params.state.trim());
    }

    if (params.district?.trim()) {
        searchParams.set("lab_district", params.district.trim());
    }

    const queryString = searchParams.toString();
    const url = queryString ? `${BIS_LIMS_BASE_URL}${BIS_LABS_PATH}?${queryString}` : `${BIS_LIMS_BASE_URL}${BIS_LABS_PATH}`;
    console.log(`[BIS LIMS] Fetching: ${url}`);

    const response = await fetch(url, {
        method: "GET",
        headers: {
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36",
        },
        cache: "no-store",
    });

    if (!response.ok) {
        throw new Error(`BIS LIMS returned ${response.status} ${response.statusText}`);
    }

    const html = await response.text();
    if (!html.trim()) {
        throw new Error("BIS LIMS returned an empty response");
    }

    const $ = cheerio.load(html);
    const laboratories: BisLaboratory[] = [];

    $("table#dataTable tbody tr").each((index, element) => {

        const row = $(element);
        const rowId = row.attr("id") || "";
        const id = rowId.startsWith("tr_") ? rowId.substring(3) : String(index + 1);
        const cells = row.find("td");

        if (cells.length < 8) {
            return;
        }

        // Column 0 = S.No.
        // Column 1 = Lab Code
        // Column 2 = Lab Name
        // Column 3 = Address
        // Column 4 = Contact Person
        // Column 5 = Contact Number
        // Column 6 = Email
        // Column 7 = View Scope

        const labCode = cleanText(cells.eq(1).text());
        const labNameCell = cells.eq(2);
        const name = cleanText(labNameCell.text());
        const image = labNameCell.find("img").first();
        const imageSrc = image.attr("src") || "";
        const imageUrl = imageSrc ? absoluteUrl(imageSrc) : "";
        const address = cleanText(cells.eq(3).text());
        const contactPerson = cleanText(cells.eq(4).text());
        const contactNumber = cleanText(cells.eq(5).text());
        const email = cleanText(cells.eq(6).text());
        const scopeLink = cells.eq(7).find("a").first();
        const scopeHref = scopeLink.attr("href") || "";
        const scopeUrl = scopeHref ? absoluteUrl(scopeHref) : "";

        if (!name) {
            return;
        }

        laboratories.push({
            id,
            labCode,
            name,
            address,
            contactPerson,
            contactNumber,
            email,
            imageUrl,
            scopeUrl,
        });
    });

    console.log(`[BIS LIMS] Found ${laboratories.length} laboratories`);
    return laboratories;
}