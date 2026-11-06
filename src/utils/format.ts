export const formatCurrency = (value: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);

export const formatPercent = (value: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "percent",
    minimumFractionDigits: 2,
  }).format(value);

// "Marina Coelho Leme" → "marina_coelho_leme" (safe file name).
export function slug(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function parseCurrencyBR(raw: string): number {
  const normalized = raw.replace(/\./g, "").replace(",", ".");
  const value = parseFloat(normalized);
  return Number.isFinite(value) ? value : 0;
}

// Rounds to cents without floating-point drift (1.005 → 1.01).
// Rounds the magnitude (half away from zero) and restores the sign; never -0.
// Trims first to 15 significant digits to drop binary noise.
export function round2(value: number): number {
  const magnitude = Math.round(Number((Math.abs(value) * 100).toPrecision(15))) / 100;
  return value < 0 && magnitude !== 0 ? -magnitude : magnitude;
}

// Amount for pt-BR text, in cents.
export const money = (value: number): string => formatCurrency(round2(value));

// Correction factors are shown with 6 decimals: 0.5059546 → "0,505955".
export const formatFactor = (value: number): string =>
  new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 6,
    maximumFractionDigits: 6,
  }).format(value);
