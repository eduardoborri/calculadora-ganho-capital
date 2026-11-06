// Legal constants, each stated once with its law and validity period.

// Progressive tax on capital gain of individuals.
// Lei 8.981/1995, art. 21, as amended by Lei 13.259/2016; in force from 01/01/2017.
// `upTo` is the cumulative upper limit of the bracket, in reais.
export const TAX_BRACKETS: { upTo: number; rate: number }[] = [
  { upTo: 5_000_000, rate: 0.15 },
  { upTo: 10_000_000, rate: 0.175 },
  { upTo: 30_000_000, rate: 0.2 },
  { upTo: Infinity, rate: 0.225 },
];

// Reduction of the gain on real estate by year of acquisition, as a fraction (1 = 100%).
// Lei 7.713/1988, art. 18: 100% up to 1969, minus 5 points per year down to 5% in 1988;
// no reduction for acquisitions from 01/01/1989 on.
export function ART18_REDUCTION(year: number): number {
  if (year <= 1969) return 1;
  if (year >= 1989) return 0;
  return (100 - 5 * (year - 1969)) / 100;
}

// Monthly reduction factor FR1 = 1 / (1 + FR1_RATE)^m1.
// Lei 11.196/2005, art. 40, and IN RFB 599/2005, art. 3; applies Jan/1996 to Nov/2005.
export const FR1_RATE = 0.006;
export const FR1_START = "1996-01";
export const FR1_END = "2005-11";

// Monthly reduction factor FR2 = 1 / (1 + FR2_RATE)^m2.
// Lei 11.196/2005, art. 40, and IN RFB 599/2005, art. 3; applies from Dec/2005 on.
export const FR2_RATE = 0.0035;
export const FR2_START = "2005-12";

// Costs paid up to this date are updated by the Anexo Unico index (IN SRF 84/2001, art. 7);
// later costs are not corrected (art. 8).
export const COST_INDEX_END = "1995-12-31";

// Land with construction started up to these dates: the land date governs the whole gain,
// for art. 18 (IN SRF 84/2001, art. 26, par. 1) and for FR1/FR2 (IN RFB 599/2005, art. 3, par. 6).
export const LAND_RULE_ART18_LIMIT = "1988-12-31";
export const LAND_RULE_FACTOR_LIMIT = "1995-12-31";

// Earliest sale date handled: earlier sales follow other factors
// (IN RFB 599/2005, art. 3, par. 1, I and II).
export const MIN_SALE_DATE = "2005-12-01";

// Small-value exemption: sales up to R$ 35.000,00 in the month (IN RFB 599/2005, art. 1).
export const SMALL_VALUE_LIMIT = 35_000;

// Single-property exemption: value up to R$ 440.000,00, no other sale in 5 years
// (Lei 9.250/1995, art. 23; IN SRF 84/2001, art. 29, I).
export const SINGLE_PROPERTY_LIMIT = 440_000;

// Reinvestment exemption: proceeds applied within 180 days of the contract
// (Lei 11.196/2005, art. 39; IN RFB 599/2005, art. 2). Day 180 counts, day 181 does not.
export const REINVESTMENT_DAYS = 180;
// The exemption can be used once every 5 years (Lei 11.196/2005, art. 39, par. 2).
export const REINVESTMENT_LOCK_YEARS = 5;

// Lei 14.973/2024 (IN RFB 2.222/2024, art. 12): percentage of the update amount (DTA) taxed,
// by completed months since the update. First row with `upToMonths >= months` applies.
export const LAW14973_PERCENT_TABLE: { upToMonths: number; percent: number }[] = [
  { upToMonths: 36, percent: 0 },
  { upToMonths: 48, percent: 0.08 },
  { upToMonths: 60, percent: 0.16 },
  { upToMonths: 72, percent: 0.24 },
  { upToMonths: 84, percent: 0.32 },
  { upToMonths: 96, percent: 0.4 },
  { upToMonths: 108, percent: 0.48 },
  { upToMonths: 120, percent: 0.56 },
  { upToMonths: 132, percent: 0.62 },
  { upToMonths: 144, percent: 0.7 },
  { upToMonths: 156, percent: 0.78 },
  { upToMonths: 168, percent: 0.86 },
  { upToMonths: 180, percent: 0.94 },
  { upToMonths: Infinity, percent: 1 },
];

// Rearp (Lei 15.265/2025, art. 7): a sale within 5 years of adhesion restores the original
// cost and date.
export const REARP_LOCK_YEARS = 5;
// Option period ended on 19/02/2026 (IN RFB 2.302, art. 9); new adhesions are not simulated.
export const REARP_OPTION_DEADLINE = "2026-02-19";

// Darf revenue code. OPEN POINT: cited by the Perguntao for donations, without the act that sets it.
export const DARF_CODE = "4600";
