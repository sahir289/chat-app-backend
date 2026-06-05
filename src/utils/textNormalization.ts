const HTML_ENTITY_MAP: Record<string, string> = {
  "&quot;": '"',
  "&#34;": '"',
  "&#x22;": '"',
  "&apos;": "'",
  "&#39;": "'",
  "&#x27;": "'",
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&nbsp;": " ",
};

function replaceHtmlEntities(input: string): string {
  return input.replace(
    /&quot;|&#34;|&#x22;|&apos;|&#39;|&#x27;|&amp;|&lt;|&gt;|&nbsp;/gi,
    (match) => HTML_ENTITY_MAP[match.toLowerCase()] ?? match
  );
}

export function normalizeUserText(input: string): string {
  return replaceHtmlEntities(input)
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u00A0]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildSearchQuery(input: string): string {
  const normalized = normalizeUserText(input);
  if (!normalized) {
    return "";
  }

  return normalized
    .replace(/^["']+|["']+$/g, "")
    .replace(/["']/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
