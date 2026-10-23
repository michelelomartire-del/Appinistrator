/** Formattazioni italiane condivise da client e server (report, export, UI). */

const euroFmt = new Intl.NumberFormat("it-IT", {
  style: "currency",
  currency: "EUR",
});
const numFmt = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 2 });
const numFmt3 = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 3 });

export function formatEuro(
  value: number | string | null | undefined,
): string | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) return null;
  return euroFmt.format(n);
}

export function formatNumber(
  value: number | string | null | undefined,
  decimals: 0 | 2 | 3 = 2,
): string | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) return null;
  return decimals === 3
    ? numFmt3.format(n)
    : n % 1 === 0
      ? numFmt.format(n)
      : numFmt.format(n);
}

/** Data pura (YYYY-MM-DD) → gg/mm/aaaa. Accetta anche timestamp ISO. */
export function formatDate(
  value: string | Date | null | undefined,
): string | null {
  if (!value) return null;
  const s = value instanceof Date ? value.toISOString() : String(value);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

export function formatDateTime(
  value: string | Date | null | undefined,
): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("it-IT", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Europe/Rome",
  }).format(d);
}

export function formatPercent(
  value: number | null | undefined,
  decimals = 1,
): string | null {
  if (value === null || value === undefined || !Number.isFinite(value))
    return null;
  return `${new Intl.NumberFormat("it-IT", { maximumFractionDigits: decimals }).format(value)}%`;
}

export function formatMillesimi(
  value: number | string | null | undefined,
): string | null {
  return formatNumber(value, 3);
}

/** Oggi in formato ISO (YYYY-MM-DD) secondo il fuso italiano. */
export function todayIso(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Rome" }).format(
    new Date(),
  );
}

export function addDaysIso(base: string, days: number): string {
  const d = new Date(`${base}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Normalizza per confronti di ricerca: minuscole, senza accenti e spazi doppi. */
export function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}
