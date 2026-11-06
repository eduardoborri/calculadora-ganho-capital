// Exemptions and reinvestment (spec 4.2, items 7 and 8). Pure functions, full precision.

import {REINVESTMENT_DAYS, SINGLE_PROPERTY_LIMIT, SMALL_VALUE_LIMIT} from "../constants";
import type {CaseInput, CaseResult, ExemptionCheck} from "../types";
import {addDays, isValidDate} from "./dates";
import {saleShare} from "./holder";

function brl(value: number): string {
  return `R$ ${value.toLocaleString("pt-BR", {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
}

// Small value (IN SRF 599/2005, art. 1): all or nothing. The total is the holder's part, as typed.
export function checkSmallValue(input: CaseInput): ExemptionCheck {
  const {sameNatureMonthTotal: total, confirmed} = input.smallValue;
  const reasons: string[] = [];
  if (!confirmed) {
    reasons.push(
      `Confirme que o total de bens da mesma natureza alienados no mês, na parte do titular, não passa de ${brl(SMALL_VALUE_LIMIT)}.`,
    );
  }
  if (!Number.isFinite(total) || total < 0) {
    reasons.push("Informe um total válido de bens da mesma natureza alienados no mês.");
  } else if (total > SMALL_VALUE_LIMIT) {
    reasons.push(
      `O total de bens da mesma natureza no mês (${brl(total)}) supera o limite de ${brl(SMALL_VALUE_LIMIT)}.`,
    );
  }
  return {applies: reasons.length === 0, reasons};
}

// Single property (Lei 9.250/1995, art. 23): the limit compares the holder's sale value,
// before brokerage.
export function checkSingleProperty(input: CaseInput): ExemptionCheck {
  const {onlyProperty, noSaleIn5Years} = input.singleProperty;
  const reasons: string[] = [];
  if (!onlyProperty) reasons.push("Marque que este é o único imóvel do alienante.");
  if (!noSaleIn5Years) {
    reasons.push("Marque que o alienante não vendeu outro imóvel, tributado ou não, nos últimos 5 anos.");
  }
  const value = saleShare(input);
  if (!(value <= SINGLE_PROPERTY_LIMIT)) {
    reasons.push(
      `O valor de alienação do titular (${brl(value)}) supera o limite de ${brl(SINGLE_PROPERTY_LIMIT)}.`,
    );
  }
  return {applies: reasons.length === 0, reasons};
}

// Reinvestment (Lei 11.196/2005, art. 39). `proceeds` is the sale net of brokerage.
export function reinvestmentOutcome(input: CaseInput, proceeds: number): CaseResult["reinvestment"] {
  const {reinvestment} = input;
  if (!reinvestment.enabled) return {deadline: null, applied: 0, proceeds, taxedShare: 1};

  const start = reinvestment.firstContractDate.trim() || input.contractDate;
  if (!isValidDate(start)) return {deadline: null, applied: 0, proceeds, taxedShare: 1};
  const deadline = addDays(start, REINVESTMENT_DAYS);

  // Both kinds (acquisition and settlement of financing) count; late or undated ones do not.
  const applied = reinvestment.applications
    .filter((app) => isValidDate(app.date) && app.date <= deadline)
    .filter((app) => Number.isFinite(app.value) && app.value > 0)
    .reduce((sum, app) => sum + app.value, 0);

  const benefit = input.residential && !reinvestment.usedInLast5Years && !reinvestment.landOrGarage;
  if (!benefit || proceeds <= 0) return {deadline, applied, proceeds, taxedShare: 1};

  const taxedShare = Math.min(1, Math.max(0, 1 - applied / proceeds));
  return {deadline, applied, proceeds, taxedShare};
}
