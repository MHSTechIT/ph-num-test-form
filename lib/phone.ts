export function normalizePhone(input: unknown): string | null {
  if (input == null) return null;
  let s = String(input).trim();
  if (!s) return null;
  s = s.replace(/[^\d]/g, "");
  if (s.length < 10) return null;
  return s.slice(-10);
}

export function isPhoneQuery(query: string): boolean {
  return /^\d{10}$/.test(query.replace(/[^\d]/g, "").slice(-10)) && query.replace(/[^\d]/g, "").length >= 10;
}
