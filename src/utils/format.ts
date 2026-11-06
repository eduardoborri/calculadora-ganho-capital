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
// Trims the product to 15 significant digits first to drop binary noise.
export function round2(value: number): number {
  return Math.round(Number((value * 100).toPrecision(15))) / 100;
}

// Correction factors are shown with 6 decimals: 0.5059546 → "0,505955".
export const formatFactor = (value: number): string =>
  new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 6,
    maximumFractionDigits: 6,
  }).format(value);
