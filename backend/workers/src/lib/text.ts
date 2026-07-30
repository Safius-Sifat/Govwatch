/**
 * Text utilities: normalization, FTS5 query building, Bangla detection.
 */

/**
 * Normalize a vendor name so that variants of the same company match.
 * "M/S CHOWDHURY CONSTRUCTION" → "ms chowdhury construction"
 */
export function normalizeVendorName(raw: string | undefined | null): string {
  if (!raw) return "";
  let s = raw.toLowerCase().trim();
  s = s.replace(/\b(m\/s\.?|ms\.?)\b/g, "ms");
  s = s.replace(/[.,]/g, "");
  s = s.replace(/\s+/g, " ");
  return s;
}

/**
 * Detect if a string contains Bengali script.
 */
export function isBangla(text: string): boolean {
  return /[\u0980-\u09FF]/.test(text);
}

/**
 * Build a safe FTS5 MATCH expression from a free-form query.
 * Splits on whitespace, strips FTS5 syntax characters, ANDs terms with prefix matches.
 */
export function buildFtsQuery(input: string): string {
  if (!input) return "";

  // Strip FTS5 operators.
  const cleaned = input
    .replace(/['"()*:^]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const tokens = cleaned
    .split(" ")
    .filter((t) => t.length >= 2)
    .slice(0, 8);

  if (tokens.length === 0) return "";

  return tokens.map((t) => `"${t}"*`).join(" AND ");
}

/**
 * Detect language code ("bn" or "en") from a query string.
 */
export function detectLanguage(text: string): "bn" | "en" {
  return isBangla(text) ? "bn" : "en";
}

/**
 * Format a BDT amount as a human-readable string with Bengali/English digits.
 */
export function formatBdt(amount: number, lang: "bn" | "en" = "en"): string {
  if (!amount || isNaN(amount)) return lang === "bn" ? "৳০" : "৳0";
  const formatted = new Intl.NumberFormat(lang === "bn" ? "bn-BD" : "en-US").format(
    Math.round(amount)
  );
  return `৳${formatted}`;
}