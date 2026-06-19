// Pure, DOM-free display formatters. The data is the messy shared Noroff pool, so each formatter degrades gracefully on absent or junk values.

const ELLIPSIS = "…";

// Read in UTC so a timestamp renders the same date for every viewer.
const DATE_FORMAT = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

// Returns "" to mean "omit" — the data rules drop a row rather than render an absent or junk year.
export function formatYear(value) {
  if (value === null || value === undefined) return "";
  const text = String(value).trim();
  if (!/^\d+$/.test(text)) return "";
  return Number(text) > 0 ? text : "";
}

// API created/updated timestamps → an editorial date. Empty string for an absent or unparseable value, so the caller can drop the row.
export function formatDate(value) {
  if (value === null || value === undefined || value === "") return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : DATE_FORMAT.format(date);
}

// Shorten free text to a preview on a word boundary where possible, ending in a single ellipsis.
// Descriptions range from one word to long paragraphs.
export function truncate(text, maxLength) {
  if (text === null || text === undefined) return "";
  const str = String(text);
  if (maxLength <= 0) return "";
  if (str.length <= maxLength) return str;

  let cut = str.slice(0, maxLength);
  const brokeMidWord = !/\s/.test(str.charAt(maxLength)) && !/\s$/.test(cut);
  if (brokeMidWord) {
    const lastSpace = cut.lastIndexOf(" ");
    if (lastSpace > 0) cut = cut.slice(0, lastSpace);
  }
  const preview = cut.trim();
  return preview ? preview + ELLIPSIS : "";
}
