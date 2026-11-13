// Exemptions and reinvestment (spec 4.2, items 7 and 8). Pure functions, full precision.

import {
  REINVESTMENT_DAYS,
  SINGLE_PROPERTY_LIMIT,
  SINGLE_PROPERTY_LOCK_YEARS,
  SMALL_VALUE_LIMIT,
} from "../constants";
import type {Application, CaseInput, CaseResult, ExemptionCheck} from "../types";
import {addDays, addYears, isValidDate} from "./dates";
import {money} from "./format";
import {isPermuta, operationTotal} from "./holder";

// Reasons say whether a requirement was not informed (a box left unchecked) or is not met by the
// figures. They describe; the instruction to check a box stays on screen.
const NOT_INFORMED = "Requisito não informado";
const NOT_MET = "Requisito não atendido";

function permutaTotalNote(input: CaseInput): string {
  return isPermuta(input) ? " Na permuta, conta o valor total da operação: torna mais imóvel recebido." : "";
}

// Small value (IN SRF 599/2005, art. 1): all or nothing. The total is the holder's part, as typed.
// The month total includes this sale, so the larger of the two is compared to the limit. In a
// permuta the operation counts by its total value, torna plus property received, not by the torna
// alone (Perguntao IRPF 2026, 681).
export function checkSmallValue(input: CaseInput): ExemptionCheck {
  const {sameNatureMonthTotal: total, confirmed} = input.smallValue;
  const reasons: string[] = [];
  if (!confirmed) {
    reasons.push(
      `${NOT_INFORMED}: total de bens da mesma natureza alienados no mês${input.ownership === "condominio" ? ", na parte do titular," : ""} até ${money(SMALL_VALUE_LIMIT)}.`,
    );
  }
  const effective = Math.max(total, operationTotal(input));
  if (!Number.isFinite(total) || total < 0) {
    reasons.push(`${NOT_INFORMED}: total válido de bens da mesma natureza alienados no mês.`);
  } else if (effective > SMALL_VALUE_LIMIT) {
    reasons.push(
      `${NOT_MET}: o total de bens da mesma natureza no mês, pelo preço bruto (${money(effective)}), supera o limite de ${money(SMALL_VALUE_LIMIT)}.${permutaTotalNote(input)}`,
    );
  }
  return {applies: reasons.length === 0, reasons};
}

// An earlier part of this sale is another sale in the period, and the 5th anniversary is still in
// it (Codigo Civil, art. 132, par. 3). Prior parts count only in "partes": other modes may hold
// them from an earlier choice on screen.
function hasRecentPriorPart(input: CaseInput): boolean {
  if (input.saleMode !== "partes" || !isValidDate(input.contractDate)) return false;
  return input.priorParts.some(
    (part) => isValidDate(part.date) && input.contractDate <= addYears(part.date, SINGLE_PROPERTY_LOCK_YEARS),
  );
}

// Single property (Lei 9.250/1995, art. 23): the limit compares the holder's sale value,
// before brokerage. In a permuta it compares the total value, torna plus property received: the
// Perguntao does not say which one, so the larger, conservative one is used (alert
// permuta-limite-unico-imovel).
export function checkSingleProperty(input: CaseInput): ExemptionCheck {
  const {onlyProperty, noSaleIn5Years} = input.singleProperty;
  const reasons: string[] = [];
  if (!onlyProperty) reasons.push(`${NOT_INFORMED}: único imóvel do alienante.`);
  if (!noSaleIn5Years) {
    reasons.push(
      `${NOT_INFORMED}: nenhuma outra alienação de imóvel, tributada ou não, nos últimos ${SINGLE_PROPERTY_LOCK_YEARS} anos.`,
    );
  }
  if (hasRecentPriorPart(input)) {
    reasons.push(
      `${NOT_MET}: há parte anterior desta alienação nos ${SINGLE_PROPERTY_LOCK_YEARS} anos antes do contrato: ela conta como outra alienação e afasta a isenção do único imóvel.`,
    );
  }
  const value = operationTotal(input);
  if (!(value <= SINGLE_PROPERTY_LIMIT)) {
    const holder = input.ownership === "condominio" ? ", na parte do titular" : "";
    const label = isPermuta(input) ? `o valor total da permuta${holder}` : `o preço da operação, bruto de corretagem${holder}`;
    reasons.push(
      `${NOT_MET}: ${label} (${money(value)}) supera o limite de ${money(SINGLE_PROPERTY_LIMIT)}.${permutaTotalNote(input)}`,
    );
  }
  return {applies: reasons.length === 0, reasons};
}

// Art. 39 deadline, the 180th day. Only with several sales does it count from the first contract;
// empty, it counts from this sale. Null without a valid start date.
export function reinvestmentDeadline(input: CaseInput): string | null {
  const {moreThanOneSale, firstContractDate} = input.reinvestment;
  const first = moreThanOneSale ? firstContractDate.trim() : "";
  const start = first || input.contractDate;
  return isValidDate(start) ? addDays(start, REINVESTMENT_DAYS) : null;
}

// Both kinds (acquisition and settlement of financing) count. Undated ones, ones before this
// sale's contract, late ones and ones without a positive value do not.
export function isApplicationCounted(input: CaseInput, app: Application, deadline: string | null): boolean {
  return (
    deadline !== null &&
    isValidDate(app.date) &&
    app.date >= input.contractDate &&
    app.date <= deadline &&
    Number.isFinite(app.value) &&
    app.value > 0
  );
}

// Reinvestment (Lei 11.196/2005, art. 39). `proceeds` is the sale net of brokerage.
export function reinvestmentOutcome(input: CaseInput, proceeds: number): CaseResult["reinvestment"] {
  const {reinvestment} = input;
  if (!reinvestment.enabled) return {deadline: null, applied: 0, proceeds, taxedShare: 1};

  const deadline = reinvestmentDeadline(input);
  if (deadline === null) return {deadline: null, applied: 0, proceeds, taxedShare: 1};

  const applied = reinvestment.applications
    .filter((app) => isApplicationCounted(input, app, deadline))
    .reduce((sum, app) => sum + app.value, 0);

  const benefit = input.residential && !reinvestment.usedInLast5Years && !reinvestment.landOrGarage;
  if (!benefit || proceeds <= 0) return {deadline, applied, proceeds, taxedShare: 1};

  const taxedShare = Math.min(1, Math.max(0, 1 - applied / proceeds));
  return {deadline, applied, proceeds, taxedShare};
}
