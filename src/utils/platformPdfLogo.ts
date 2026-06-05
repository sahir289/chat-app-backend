import sharp from "sharp";

/** Raster source for Mitra Varta branding in PDF exports (PDFKit does not embed SVG). */
export const MITRAVARTA_PDF_LOGO_URL =
    process.env.MITRAVARTA_PDF_LOGO_URL ?? "https://mitravarta.serviots.tech/mitraVarta.svg";

let cached: Buffer | null | undefined;
let loadPromise: Promise<Buffer | null> | null = null;

/**
 * Fetches the platform logo and returns a PNG buffer suitable for PDFKit.
 * Memoized for the process lifetime.
 */
export async function getPlatformPdfLogoBuffer(): Promise<Buffer | null> {
    if (cached !== undefined) {
        return cached;
    }
    if (!loadPromise) {
        loadPromise = fetchLogoForPdf()
            .then((buf) => {
                cached = buf;
                return buf;
            })
            .catch(() => {
                cached = null;
                return null;
            });
    }
    return loadPromise;
}

async function fetchLogoForPdf(): Promise<Buffer | null> {
    const res = await fetch(MITRAVARTA_PDF_LOGO_URL, {
        headers: { Accept: "image/svg+xml,image/png,image/jpeg,image/*,*/*" },
    });
    if (!res.ok) {
        return null;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    const ct = (res.headers.get("content-type") || "").toLowerCase();
    const head = buf.subarray(0, Math.min(512, buf.length)).toString("utf8").trimStart();
    const isSvg = ct.includes("svg") || head.startsWith("<") || head.startsWith("\ufeff<");

    if (isSvg) {
        return sharp(buf, { density: 150 }).png().toBuffer();
    }
    return buf;
}
