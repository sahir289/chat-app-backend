import { load } from "cheerio";
import { AppError } from "./appError";
import { assertPublicHttpUrl, fetchPublicUrl } from "./safeFetch";

const MAIN_CONTENT_SELECTORS = [
  "main",
  "article",
  "[role='main']",
  ".article",
  ".article-content",
  ".content",
  ".entry-content",
  ".page-content",
  ".post-content",
  ".main-content",
];

const CONTENT_NODE_SELECTORS = [
  "h1",
  "h2",
  "h3",
  "p",
  "li",
  "blockquote",
  "td",
  "th",
  "dt",
  "dd",
  "pre",
];

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function uniqueLines(lines: string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const line of lines) {
    const cleaned = collapseWhitespace(line);
    if (!cleaned || cleaned.length < 2) {
      continue;
    }

    const dedupeKey = cleaned.toLowerCase();
    if (seen.has(dedupeKey)) {
      continue;
    }

    seen.add(dedupeKey);
    normalized.push(cleaned);
  }

  return normalized;
}

function extractTextContent(html: string): { title: string; content: string } {
  const $ = load(html);

  $("script, style, noscript, svg, canvas, iframe, form, nav, footer, aside").remove();

  const rawTitle =
    $('meta[property="og:title"]').attr("content") ||
    $('meta[name="twitter:title"]').attr("content") ||
    $("title").first().text() ||
    $("h1").first().text() ||
    "";

  const rawDescription =
    $('meta[name="description"]').attr("content") ||
    $('meta[property="og:description"]').attr("content") ||
    $('meta[name="twitter:description"]').attr("content") ||
    "";

  const contentRoot =
    MAIN_CONTENT_SELECTORS.map((selector) => $(selector).first()).find((node) => node.length > 0) ||
    $("body").first();

  const lines: string[] = [];

  if (rawTitle) {
    lines.push(`# ${rawTitle}`);
  }

  if (rawDescription) {
    lines.push(rawDescription);
  }

  contentRoot.find(CONTENT_NODE_SELECTORS.join(", ")).each((_, element) => {
    const tagName = element.tagName?.toLowerCase();
    const text = collapseWhitespace($(element).text());

    if (!text) {
      return;
    }

    if (text.length < 20 && tagName !== "h1" && tagName !== "h2" && tagName !== "h3") {
      return;
    }

    if (tagName === "h1" || tagName === "h2" || tagName === "h3") {
      lines.push(`## ${text}`);
      return;
    }

    if (tagName === "li") {
      lines.push(`- ${text}`);
      return;
    }

    lines.push(text);
  });

  if (lines.length === 0) {
    const fallbackText = collapseWhitespace($.root().text());
    if (fallbackText) {
      lines.push(fallbackText);
    }
  }

  const content = uniqueLines(lines).join("\n\n").trim();
  const title = collapseWhitespace(rawTitle) || "Untitled page";
  return { title, content };
}

export async function scrapeUrlContent(rawUrl: string): Promise<{
  title: string;
  content: string;
}> {
  try {
    const parsed = await assertPublicHttpUrl(rawUrl);

    const response = await fetchPublicUrl(parsed, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
    }, {
      timeoutMs: 15000,
      maxRedirects: 5,
    });

    if (!response.ok) {
      throw new AppError(response.status, `Failed to fetch URL: ${response.statusText}`);
    }

    const html = await response.text();
    const { title, content } = extractTextContent(html);

    if (!content || content.length < 40) {
      throw new AppError(
        422,
        "The page was fetched, but not enough readable content could be extracted."
      );
    }

    const truncatedContent =
      content.length > 80000 ? `${content.slice(0, 80000).trim()}\n\n[content truncated]` : content;

    return {
      title,
      content: truncatedContent,
    };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    throw new AppError(
      500,
      `Failed to scrape URL: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}
