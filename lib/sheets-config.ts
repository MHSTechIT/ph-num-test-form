export type SheetConfig = {
  sheetName: string;
  displayName: string;
  phoneColumnHints?: string[];
  highlightColumns?: string[];
};

export const ALLOWED_CLASSIFICATIONS = ["002", "003", "004", "005"] as const;

export type AllowedClassification = (typeof ALLOWED_CLASSIFICATIONS)[number];

export const SHEETS: SheetConfig[] = [
  {
    sheetName: "Razorpay",
    displayName: "Razorpay",
    phoneColumnHints: ["Phone No"],
    highlightColumns: ["Date", "amount", "method", "card_issuer"],
  },
  {
    sheetName: "Pine Labs",
    displayName: "Pine Labs",
    phoneColumnHints: ["Phone No"],
    highlightColumns: ["Name", "Amount", "Card Issuer", "Card Type"],
  },
  {
    sheetName: "Savein",
    displayName: "Savein",
    phoneColumnHints: ["Mobile No", "Alter No"],
    highlightColumns: ["Customer Name", "Total Loan Amount", "Transaction Date"],
  },
  {
    sheetName: "Bajaj Sheet",
    displayName: "Bajaj",
    phoneColumnHints: ["Phone No", "Alter  No", "Alter No"],
    highlightColumns: ["Customer Name", "Loan Finance Amount", "Actual Transaction Date"],
  },
  {
    sheetName: "Paytm",
    displayName: "Paytm",
    phoneColumnHints: [
      "Payment_Mobile_Number",
      "Mobile No",
      "Alternative Mobile No",
    ],
    highlightColumns: ["Transaction_Date", "Amount", "Status"],
  },
  {
    sheetName: "Phonepay",
    displayName: "PhonePe",
    phoneColumnHints: ["Phone Number", "Phone Number'"],
    highlightColumns: ["Transaction Date", "Transaction Amount", "Transaction Status"],
  },
  {
    sheetName: "Jodo",
    displayName: "Jodo",
    phoneColumnHints: ["Roll Number", "Alter No"],
    highlightColumns: ["Student Name", "Fee Component Transaction Amount", "Paid Date"],
  },
  {
    sheetName: "Easebuzz",
    displayName: "Easebuzz",
    phoneColumnHints: ["Customer Phone"],
    highlightColumns: ["Customer Name", "Amount", "Date of Transaction"],
  },
  {
    sheetName: "Tagmamgo",
    displayName: "Tagmamgo",
    phoneColumnHints: ["Phone No"],
    highlightColumns: ["name", "Amount Received (Sub)", "Payment Type"],
  },
];

const CLASSIFICATION_RE = /^\s*0(0[1-9]|1\d|2\d)\s*\(/;

export function extractClassificationCode(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value);
  const m = s.match(CLASSIFICATION_RE);
  if (!m) return null;
  return s.trim().slice(0, 3);
}

export function isAllowedClassification(code: string | null): boolean {
  if (!code) return false;
  return (ALLOWED_CLASSIFICATIONS as readonly string[]).includes(code);
}

export function findClassificationInRow(row: Record<string, unknown>): string | null {
  for (const v of Object.values(row)) {
    const code = extractClassificationCode(v);
    if (code) return code;
  }
  return null;
}

const PHONE_HEADER_RE = /(phone|mobile|alter\s*no|customer\s*phone|whatsapp)/i;

export function findPhoneHeaders(headers: string[], hints: string[] = []): string[] {
  const matched = new Set<string>();
  for (const h of headers) {
    if (!h) continue;
    if (hints.some((hint) => normalizeHeader(hint) === normalizeHeader(h))) {
      matched.add(h);
      continue;
    }
    if (PHONE_HEADER_RE.test(h)) matched.add(h);
  }
  return [...matched];
}

function normalizeHeader(h: string) {
  return h.replace(/\s+/g, " ").trim().toLowerCase();
}
