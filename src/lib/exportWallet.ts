/**
 * exportWallet.ts
 *
 * Client-side CSV and JSON export helpers for the wallet view.
 * All CSV values are safely escaped to prevent formula injection and handle
 * embedded commas, quotes, and newlines.
 *
 * No server round-trip is required — exports are generated in-browser and
 * triggered as file downloads via a temporary anchor element.
 */

import type { WalletItem } from "@/types/domain";

// ---------------------------------------------------------------------------
// CSV helpers
// ---------------------------------------------------------------------------

/**
 * Safely escape a single CSV field value.
 *
 * Rules applied (RFC 4180):
 *  - Null / undefined → empty string.
 *  - If the value contains a comma, double-quote, newline, or carriage-return
 *    the entire field is wrapped in double-quotes and any embedded double-quotes
 *    are doubled ("").
 *  - Leading `=`, `+`, `-`, `@` are prefixed with a tab character to neutralise
 *    CSV formula injection (defensive measure for spreadsheet consumers).
 */
export function csvEscape(value: unknown): string {
  const raw = value == null ? "" : String(value);

  // Neutralise spreadsheet formula injection
  const safe =
    raw.length > 0 && ["=", "+", "-", "@"].includes(raw[0]) ? `\t${raw}` : raw;

  // Quote the field if it contains characters that require quoting
  if (
    safe.includes('"') ||
    safe.includes(",") ||
    safe.includes("\n") ||
    safe.includes("\r")
  ) {
    return '"' + safe.replace(/"/g, '""') + '"';
  }

  return safe;
}

// ---------------------------------------------------------------------------
// Serialisation
// ---------------------------------------------------------------------------

const CSV_HEADERS: Array<keyof WalletItem> = [
  "id",
  "name",
  "type",
  "balance",
  "currency",
  "address",
  "status",
  "createdAt",
];

/**
 * Serialise an array of WalletItem objects to CSV string.
 *
 * @param items - Array of wallet items (already filtered by the caller).
 * @returns A UTF-8 CSV string with a header row followed by one data row per item.
 */
export function walletItemsToCsv(items: WalletItem[]): string {
  const headerRow = CSV_HEADERS.map(csvEscape).join(",");

  const dataRows = items.map((item) =>
    [
      csvEscape(item.id),
      csvEscape(item.name),
      csvEscape(item.type),
      csvEscape(item.balance),
      csvEscape(item.currency),
      csvEscape(item.address ?? ""),
      csvEscape(item.status),
      csvEscape(item.createdAt),
    ].join(","),
  );

  return [headerRow, ...dataRows].join("\n");
}

/**
 * Serialise an array of WalletItem objects to a pretty-printed JSON string.
 *
 * @param items - Array of wallet items (already filtered by the caller).
 */
export function walletItemsToJson(items: WalletItem[]): string {
  return JSON.stringify(items, null, 2);
}

// ---------------------------------------------------------------------------
// Download trigger
// ---------------------------------------------------------------------------

/**
 * Triggers a client-side file download without a server round-trip.
 *
 * Creates a temporary in-memory Blob URL, clicks a hidden anchor element, and
 * immediately revokes the URL to free memory.
 *
 * @param content  - The file content as a string.
 * @param filename - Suggested download filename.
 * @param mimeType - MIME type of the content (e.g. `"text/csv;charset=utf-8;"`).
 */
export function triggerDownload(
  content: string,
  filename: string,
  mimeType: string,
): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);

  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Public download API
// ---------------------------------------------------------------------------

/**
 * Convert `items` to CSV and trigger a browser download.
 *
 * @param items    - The currently visible (already-filtered) wallet items.
 * @param filename - Defaults to `"wallet.csv"`.
 */
export function downloadWalletCsv(
  items: WalletItem[],
  filename = "wallet.csv",
): void {
  triggerDownload(walletItemsToCsv(items), filename, "text/csv;charset=utf-8;");
}

/**
 * Convert `items` to JSON and trigger a browser download.
 *
 * @param items    - The currently visible (already-filtered) wallet items.
 * @param filename - Defaults to `"wallet.json"`.
 */
export function downloadWalletJson(
  items: WalletItem[],
  filename = "wallet.json",
): void {
  triggerDownload(
    walletItemsToJson(items),
    filename,
    "application/json;charset=utf-8;",
  );
}
