/**
 * Pure helpers that translate dashboard search matches into a destination
 * "Accounts" row. Designed to be unit-testable — no I/O, no fetch, no env.
 */

import type { AllowedClassification } from "./sheets-config";

export type MatchedEntry = {
  sheet: string;
  displayName: string;
  classification: AllowedClassification;
  data: Record<string, unknown>;
};

export const DEST_TAB_DIAMOND = "L2 Diamond Accounts";
export const DEST_TAB_GOLD = "L2 Gold Accounts";

export const DEST_PHONE_COLUMN_INDEX = 5; // zero-indexed; spreadsheet column F (6th col)

const DEST_ROW_LENGTH = 32;

const CLASSIFICATION_LABELS: Record<string, string> = {
  "002": "L2 Application",
  "003": "L2 Diamond",
  "004": "L2 Gold",
  "005": "L2 EMI",
};

export function classificationLabel(code: string): string {
  return CLASSIFICATION_LABELS[code] ?? code;
}

export function targetTab(code: string): string {
  // 003 + 002 + 005 -> Diamond, 004 -> Gold
  return code === "004" ? DEST_TAB_GOLD : DEST_TAB_DIAMOND;
}

/* ------------------------------------------------------------------------- */
/* Per-field extractors                                                       */
/* ------------------------------------------------------------------------- */

const NAME_HEADERS_BY_SHEET: Record<string, string[]> = {
  Razorpay: ["order_receipt", "Notes", "name"],
  "Pine Labs": ["Name"],
  Savein: ["Customer Name", "Applicant Name"],
  "Bajaj Sheet": ["Customer Name"],
  Paytm: ["Customer_Nickname"],
  Phonepay: ["Merchant Order Id"],
  Jodo: ["Student Name"],
  Easebuzz: ["Customer Name"],
  Tagmamgo: ["name"],
  ICICI: ["Transaction Remarks"],
};

export function clientNameFrom(data: Record<string, unknown>, sheet: string): string {
  const candidates = NAME_HEADERS_BY_SHEET[sheet] ?? ["Customer Name", "Name", "name"];
  for (const k of candidates) {
    const v = data[k];
    if (v == null) continue;
    const s = String(v).trim();
    if (s === "") continue;
    // If the value looks like Razorpay's Notes JSON, extract its `name` field.
    if (s.startsWith("{") && s.includes('"name"')) {
      try {
        const parsed = JSON.parse(s);
        if (parsed && typeof parsed.name === "string" && parsed.name.trim() !== "") {
          return parsed.name.trim();
        }
      } catch {
        // fall through and use the raw string only if reasonable length
      }
      continue;
    }
    return s;
  }
  return "";
}

const DATE_HEADERS_BY_SHEET: Record<string, string[]> = {
  Razorpay: ["Date", "created_at"],
  "Pine Labs": ["Date"],
  Savein: ["Transaction Date"],
  "Bajaj Sheet": ["Actual Transaction Date", "Cheque or Payment Date"],
  Paytm: ["Transaction_Date"],
  Phonepay: ["Date", "Transaction Date"],
  Jodo: ["Paid Date"],
  Easebuzz: ["Date of Transaction"],
  Tagmamgo: ["Subscription Date", "Date"],
  ICICI: ["Date", "Transaction Date"],
};

export function paidDateFrom(data: Record<string, unknown>, sheet: string): string {
  const candidates = DATE_HEADERS_BY_SHEET[sheet] ?? ["Date", "Paid Date", "Transaction Date"];
  for (const k of candidates) {
    const v = data[k];
    if (v != null && String(v).trim() !== "") return String(v).trim();
  }
  return "";
}

/**
 * Best-effort timestamp parse for sorting. Returns 0 if unparseable.
 * Handles common Indian date formats:
 *   "10 Apr 2026", "10-04-2026", "10/04/2026", "2026-04-10", "1-Apr-2026"
 * Also "10/04/2026 18:14:15" (24h time).
 */
export function paidDateAsTimestamp(data: Record<string, unknown>, sheet: string): number {
  const s = paidDateFrom(data, sheet);
  if (!s) return 0;
  return parseLooseDate(s);
}

export function parseLooseDate(s: string): number {
  const trimmed = s.trim();
  if (!trimmed) return 0;

  // ISO first
  const iso = Date.parse(trimmed);
  if (!Number.isNaN(iso)) return iso;

  // dd-mm-yyyy or dd/mm/yyyy (with optional time)
  const m = trimmed.match(
    /^(\d{1,2})[-\/](\d{1,2})[-\/](\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/
  );
  if (m) {
    const [, d, mo, y, hh, mm, ss] = m;
    const year = y.length === 2 ? 2000 + Number(y) : Number(y);
    return Date.UTC(
      year,
      Number(mo) - 1,
      Number(d),
      hh ? Number(hh) : 0,
      mm ? Number(mm) : 0,
      ss ? Number(ss) : 0
    );
  }

  // "10 Apr 2026" or "1-Apr-2026"
  const m2 = trimmed.match(/^(\d{1,2})[-\s]([A-Za-z]{3,})[-\s](\d{2,4})$/);
  if (m2) {
    const [, d, mon, y] = m2;
    const monthIdx = monthIndex(mon);
    if (monthIdx >= 0) {
      const year = y.length === 2 ? 2000 + Number(y) : Number(y);
      return Date.UTC(year, monthIdx, Number(d));
    }
  }

  return 0;
}

const MONTHS = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
];
function monthIndex(s: string): number {
  return MONTHS.indexOf(s.slice(0, 3).toLowerCase());
}

const AMOUNT_HEADERS_BY_SHEET: Record<string, string[]> = {
  Razorpay: ["amount"],
  "Pine Labs": ["Amount"],
  Savein: ["Total Loan Amount", "Amount Credited"],
  "Bajaj Sheet": ["Loan Finance Amount"],
  Paytm: ["Amount"],
  Phonepay: ["Transaction Amount"],
  Jodo: ["Fee Component Transaction Amount"],
  Easebuzz: ["Amount"],
  Tagmamgo: ["Amount Received (Sub)", "Amount Received"],
  ICICI: ["Deposit Amt (INR)"],
};

export function amountFrom(data: Record<string, unknown>, sheet: string): number {
  const candidates = AMOUNT_HEADERS_BY_SHEET[sheet] ?? ["Amount", "amount"];
  for (const k of candidates) {
    const v = data[k];
    if (v == null || v === "") continue;
    const num = parseAmount(v);
    if (Number.isFinite(num)) return num;
  }
  return 0;
}

export function parseAmount(v: unknown): number {
  if (typeof v === "number") return v;
  if (v == null) return 0;
  // Strip commas and currency markers; keep digits, minus, decimal point
  const s = String(v).replace(/[^\d.\-]/g, "");
  if (!s) return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

const INVOICE_HEADERS_BY_SHEET: Record<string, string[]> = {
  Razorpay: ["order_id", "Payment ID"],
  "Pine Labs": ["Transaction ID"],
  Savein: ["Loan ID", "UTR"],
  "Bajaj Sheet": ["Agreement LAN Number", "Deal ID"],
  Paytm: ["Transaction_ID"],
  Phonepay: ["PhonePe Order Id", "Merchant Order Id"],
  Jodo: ["Payment Id"],
  Easebuzz: ["Easebuzz ID"],
  Tagmamgo: ["Order Id"],
  ICICI: ["Tran. Id"],
};

export function invoiceNumberFrom(data: Record<string, unknown>, sheet: string): string {
  const candidates = INVOICE_HEADERS_BY_SHEET[sheet] ?? [];
  for (const k of candidates) {
    const v = data[k];
    if (v != null && String(v).trim() !== "") return String(v).trim();
  }
  return "";
}

/* ------------------------------------------------------------------------- */
/* Row builder                                                                */
/* ------------------------------------------------------------------------- */

export type BuildResult = {
  tab: string;
  row: (string | number)[];
  warnings: string[];
};

/**
 * Build one destination-tab row from a list of matched source rows.
 *
 * - Tagmamgo (if present) goes to Application Fees (cols 16-18).
 * - All other matches go into 1st/2nd/3rd Payment ordered by Paid Date.
 * - The classification used in col 8 is the most "advanced" classification
 *   present in the matches (with 003 ranked highest among Diamond-tab routes,
 *   then 005, 002, 004). Falls back to first match's classification.
 */
export function buildDestRow(matches: MatchedEntry[], query: string): BuildResult {
  if (matches.length === 0) {
    throw new Error("buildDestRow: no matches");
  }
  const warnings: string[] = [];

  // Pick classification. We prefer 003 / 004 (the "real" L2 tiers) over 002 / 005.
  const classification = pickClassification(matches);
  const tab = targetTab(classification);

  // Application Fees = first match with classification 002 (L2 Application).
  // Tagmamgo rows that aren't 002 still go to 1st/2nd/3rd Payment.
  const application = matches.find((m) => m.classification === "002");
  const others = matches.filter((m) => m !== application);
  // Sort others by Paid Date ascending
  others.sort(
    (a, b) =>
      paidDateAsTimestamp(a.data, a.sheet) - paidDateAsTimestamp(b.data, b.sheet)
  );

  if (others.length > 3) {
    warnings.push(
      `${others.length} non-Tagmamgo payments matched; only the 3 earliest fit. Add the rest manually.`
    );
  }

  // For the canonical "header" fields:
  //   - Client Name + Invoice Number: prefer application (clean name source),
  //     then any non-ICICI, then fall back. ICICI transaction remarks are
  //     UPI strings, useless as Client Name.
  //   - Paid Date + Invoice Date: first non-application payment by date.
  const headForId = pickHeadForIdentity(matches, application, others);
  const headForDate = others[0] ?? application ?? matches[0];
  const clientName = clientNameFrom(headForId.data, headForId.sheet);
  const headDate = paidDateFrom(headForDate.data, headForDate.sheet);
  const headInvoice = invoiceNumberFrom(headForId.data, headForId.sheet);

  const totalAmount = matches.reduce((sum, m) => sum + amountFrom(m.data, m.sheet), 0);
  const paymentModeList = others.map((m) => m.displayName).join(", ") || application?.displayName || "";

  const row: (string | number)[] = new Array(DEST_ROW_LENGTH).fill("");

  // 0-indexed cols
  row[4] = clientName;                                      // 5  Client Name
  row[5] = query;                                           // 6  Phone Number
  row[7] = classificationLabel(classification);             // 8  Payment Type
  row[8] = "WON";                                           // 9  Status
  row[9] = headDate;                                        // 10 Paid Date
  row[10] = totalAmount;                                    // 11 Amount Received
  row[11] = paymentModeList;                                // 12 Payment Mode
  row[12] = headInvoice;                                    // 13 Invoice Number
  row[13] = headDate;                                       // 14 Invoice Date
  row[14] = totalAmount;                                    // 15 Invoice Amount

  // Application Fees (cols 16-18 → indices 15-17)
  if (application) {
    row[15] = application.displayName;
    row[16] = paidDateFrom(application.data, application.sheet);
    row[17] = amountFrom(application.data, application.sheet);
  }

  // 1st / 2nd / 3rd Payment slots
  const PAYMENT_SLOTS: Array<[number, number, number]> = [
    [18, 19, 20], // 1st Payment
    [21, 22, 23], // 2nd Payment
    [24, 25, 26], // 3rd Payment
  ];
  for (let i = 0; i < Math.min(others.length, 3); i++) {
    const [modeIdx, dateIdx, amtIdx] = PAYMENT_SLOTS[i];
    const m = others[i];
    row[modeIdx] = m.displayName;
    row[dateIdx] = paidDateFrom(m.data, m.sheet);
    row[amtIdx] = amountFrom(m.data, m.sheet);
  }

  // 28 Sales (idx 27), 29 Accounts (idx 28), 30 Difference (idx 29)
  row[27] = totalAmount;
  row[28] = totalAmount;
  row[29] = 0;

  return { tab, row, warnings };
}

function pickClassification(matches: MatchedEntry[]): AllowedClassification {
  const order: AllowedClassification[] = ["003", "004", "002", "005"];
  for (const c of order) {
    if (matches.some((m) => m.classification === c)) return c;
  }
  return matches[0].classification;
}

function pickHeadForIdentity(
  matches: MatchedEntry[],
  application: MatchedEntry | undefined,
  others: MatchedEntry[]
): MatchedEntry {
  // 1. Application match if it has a clean name
  if (application && nameLooksClean(clientNameFrom(application.data, application.sheet))) {
    return application;
  }
  // 2. Any non-ICICI other match with a clean name
  for (const m of others) {
    if (m.sheet === "ICICI") continue;
    if (nameLooksClean(clientNameFrom(m.data, m.sheet))) return m;
  }
  // 3. Application even if name is empty
  if (application) return application;
  // 4. Anything else
  return others[0] ?? matches[0];
}

function nameLooksClean(n: string): boolean {
  if (!n) return false;
  if (n.length > 50) return false;
  if (/\//.test(n)) return false;
  return true;
}

/**
 * Merge a freshly-built row into an existing destination row. For each
 * column: keep the existing value if it's non-empty, otherwise take the
 * new value. Returns the merged row plus the indices of columns that
 * were filled in (so the UI can report "filled 4 blanks").
 */
export function mergeRows(
  existing: (string | number)[],
  next: (string | number)[]
): { merged: (string | number)[]; filled: number[] } {
  const length = Math.max(existing.length, next.length);
  const merged: (string | number)[] = new Array(length).fill("");
  const filled: number[] = [];
  for (let i = 0; i < length; i++) {
    const ex = existing[i];
    const nx = next[i];
    const exNonEmpty = ex != null && String(ex).trim() !== "";
    const nxNonEmpty = nx != null && String(nx).trim() !== "";
    if (exNonEmpty) {
      merged[i] = ex;
    } else if (nxNonEmpty) {
      merged[i] = nx;
      filled.push(i);
    } else {
      merged[i] = "";
    }
  }
  return { merged, filled };
}
