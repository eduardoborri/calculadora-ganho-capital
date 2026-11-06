// Pure calculation engine for capital gain on real estate (spec 4.1 to 4.3 and 4.6).
// No React and no I/O. Values keep full precision: only the UI and the reports call round2.

import {
  ART18_REDUCTION,
  COST_INDEX_END,
  FR1_END,
  FR1_RATE,
  FR1_START,
  FR2_RATE,
  FR2_START,
  LAND_RULE_ART18_LIMIT,
  LAND_RULE_FACTOR_LIMIT,
  MIN_SALE_DATE,
  TAX_BRACKETS,
} from "../constants";
import {costIndex} from "../data/custoAte1995";
import type {
  BracketLine,
  CaseInput,
  CaseResult,
  CaseStatus,
  CostItem,
  ExemptionCheck,
  ItemReduction,
  OutOfScope,
} from "../types";
import {monthsInclusive, isValidDate} from "./dates";
import {checkSingleProperty, checkSmallValue, reinvestmentOutcome} from "./exemptions";
import {holderFraction, saleShare} from "./holder";

export function defaultCaseInput(): CaseInput {
  return {
    taxpayerName: "",
    calendarYear: 0,
    propertyDescription: "",
    residential: true,
    acquisitionDate: "",
    acquisitionForm: "compra",
    transferAtMarket: false,
    ownership: "exclusivo",
    quotaPct: 100,
    landRule: false,
    costItems: [],
    contractDate: "",
    saleValue: 0,
    brokerage: 0,
    saleMode: "vista",
    belowMarket: false,
    installments: [],
    priorParts: [],
    smallValue: {sameNatureMonthTotal: 0, confirmed: false},
    singleProperty: {onlyProperty: false, noSaleIn5Years: false},
    reinvestment: {
      enabled: false,
      firstContractDate: "",
      applications: [],
      usedInLast5Years: false,
      moreThanOneSale: false,
      landOrGarage: false,
    },
    update: null,
    outOfScope: [],
  };
}

// ---- Tax table and reduction factors ----

// Progressive table by bracket (Lei 8.981/1995, art. 21). Only brackets reached are listed.
export function progressiveTax(base: number): {brackets: BracketLine[]; total: number} {
  const brackets: BracketLine[] = [];
  let total = 0;
  let from = 0;
  for (const {upTo, rate} of TAX_BRACKETS) {
    if (base <= from) break;
    const slice = Math.min(base, upTo) - from;
    const tax = slice * rate;
    brackets.push({from, to: upTo, rate, base: slice, tax});
    total += tax;
    from = upTo;
  }
  return {brackets, total};
}

export function factorFR1(m1: number): number {
  return 1 / (1 + FR1_RATE) ** m1;
}

export function factorFR2(m2: number): number {
  return 1 / (1 + FR2_RATE) ** m2;
}

export function art18Percent(year: number): number {
  return ART18_REDUCTION(year);
}

// Months from Jan/1996, or the acquisition month if later, to Nov/2005, both inclusive.
export function countM1(acquisition: string): number {
  const month = acquisition.slice(0, 7);
  if (month > FR1_END) return 0;
  const start = month < FR1_START ? FR1_START : month;
  return monthsInclusive(`${start}-01`, `${FR1_END}-01`);
}

// Months from Dec/2005, or the acquisition month if later, to the sale month, both inclusive.
export function countM2(acquisition: string, sale: string): number {
  const month = acquisition.slice(0, 7);
  const start = month < FR2_START ? FR2_START : month;
  return Math.max(0, monthsInclusive(`${start}-01`, sale));
}

// ---- Cost ----

// An item up to 31/12/1995 with an original amount is updated by the Anexo Unico index, unless
// the user typed a value over the default. Later costs are never corrected.
function usesCostIndex(item: CostItem): boolean {
  return Boolean(item.original) && !item.manual && isValidDate(item.date) && item.date <= COST_INDEX_END;
}

function itemIndex(item: CostItem): number | null {
  const [year, month] = item.date.split("-").map(Number);
  return costIndex(item.original.moeda, year, month);
}

// Without an index for the month the cost is 0; validation reports the case as invalid.
export function correctedCost(item: CostItem): number {
  if (!usesCostIndex(item)) return item.value;
  const index = itemIndex(item);
  return index === null ? 0 : item.original.amount / index;
}

// A row the user left untouched: it is neither a cost nor a pending field.
function isBlankItem(item: CostItem): boolean {
  return item.value === 0 && !item.original && !item.date.trim() && !item.description.trim();
}

function filledItems(input: CaseInput): CostItem[] {
  return input.costItems.filter((item) => !isBlankItem(item));
}

// ---- Scope and validation ----

const OUT_OF_SCOPE_REASONS: Record<OutOfScope, string> = {
  nao_residente: "Alienante não residente no Brasil: caso fora do escopo da ferramenta.",
  pessoa_juridica: "Alienante pessoa jurídica: caso fora do escopo da ferramenta.",
  rural_terra_nua: "Imóvel rural com regra de terra nua: caso fora do escopo da ferramenta.",
  exterior: "Imóvel no exterior: caso fora do escopo da ferramenta.",
  moeda_estrangeira: "Operação em moeda estrangeira: caso fora do escopo da ferramenta.",
  permuta_torna: "Permuta com torna: caso fora do escopo da ferramenta.",
};

// Sanity ceiling, not a legal value: keeps products and sums finite, so overflow cannot
// reach the result as NaN with status ok.
const MAX_AMOUNT = 1e15;

function isValidAmount(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= MAX_AMOUNT;
}

function checkScope(input: CaseInput): string[] {
  const reasons = input.outOfScope.map((key) => OUT_OF_SCOPE_REASONS[key]);
  if (isValidDate(input.contractDate) && input.contractDate < MIN_SALE_DATE) {
    reasons.push(
      "Alienação anterior a 01/12/2005: segue outros fatores (IN 599, art. 3º, § 1º, I e II) e fica fora do escopo da ferramenta.",
    );
  }
  return reasons;
}

interface Issues {
  invalid: string[]; // pt-BR sentences
  missing: string[]; // short pt-BR field labels
}

function checkDateField(date: string, label: string, issues: Issues): void {
  if (!date.trim()) issues.missing.push(label);
  else if (!isValidDate(date)) issues.invalid.push(`${label} inválida: ${date}.`);
}

function checkDates(input: CaseInput, issues: Issues): void {
  checkDateField(input.acquisitionDate, "Data de aquisição", issues);
  checkDateField(input.contractDate, "Data de alienação", issues);
  if (
    isValidDate(input.acquisitionDate) &&
    isValidDate(input.contractDate) &&
    input.contractDate < input.acquisitionDate
  ) {
    issues.invalid.push("A data de alienação não pode ser anterior à data de aquisição.");
  }
}

function checkSale(input: CaseInput, issues: Issues): void {
  if (!isValidAmount(input.saleValue)) {
    issues.invalid.push("O valor de alienação deve ser um número positivo de até 1 quatrilhão.");
  } else if (input.saleValue === 0) {
    issues.missing.push("Valor de alienação");
  }
  if (input.ownership === "condominio") {
    if (!isValidAmount(input.quotaPct) || input.quotaPct > 100) {
      issues.invalid.push("O percentual da quota deve estar entre 0 e 100.");
    } else if (input.quotaPct === 0) {
      issues.missing.push("Percentual da quota");
    }
  }
  if (!isValidAmount(input.brokerage)) {
    issues.invalid.push("A corretagem deve ser um número positivo de até 1 quatrilhão.");
  } else if (saleShare(input) > 0 && input.brokerage > saleShare(input)) {
    issues.invalid.push("A corretagem não pode superar o valor de alienação.");
  }
}

function checkCostItem(item: CostItem, input: CaseInput, issues: Issues): void {
  const name = item.description.trim() || item.id;
  checkDateField(item.date, "Data do item de custo", issues);
  if (isValidDate(input.contractDate) && isValidDate(item.date) && item.date > input.contractDate) {
    issues.invalid.push(`O item de custo "${name}" tem data posterior à alienação.`);
  }
  // An earlier date would give the item larger reductions than the acquisition date allows.
  // A property bought in stages takes the earliest date as acquisitionDate.
  if (isValidDate(input.acquisitionDate) && isValidDate(item.date) && item.date < input.acquisitionDate) {
    issues.invalid.push(`O item de custo "${name}" tem data anterior à aquisição.`);
  }
  if (!isValidAmount(item.value) || (item.original && !isValidAmount(item.original.amount))) {
    issues.invalid.push(`O item de custo "${name}" deve ter valor positivo de até 1 quatrilhão.`);
  } else if (usesCostIndex(item) && itemIndex(item) === null) {
    issues.invalid.push(
      `O Anexo Único não traz índice em ${item.original.moeda} para o mês do item de custo "${name}".`,
    );
  } else if (correctedCost(item) === 0 && (item.date.trim() || !item.original)) {
    issues.missing.push("Valor do item de custo");
  }
}

function checkCost(input: CaseInput, issues: Issues): void {
  const items = filledItems(input);
  items.forEach((item) => checkCostItem(item, input, issues));
  if (input.landRule && !items.some((item) => item.isLand)) {
    issues.missing.push("Terreno (item de custo marcado)");
  }
}

function checkInput(input: CaseInput): Issues {
  const issues: Issues = {invalid: [], missing: []};
  checkDates(input, issues);
  checkSale(input, issues);
  checkCost(input, issues);
  return {invalid: issues.invalid, missing: [...new Set(issues.missing)]};
}

// ---- Calculation steps ----

// Brokerage paid by the seller comes off the sale value (IN SRF 84/2001, art. 19, par. 4).
function computeSaleNet(input: CaseInput): number {
  return saleShare(input) - input.brokerage;
}

interface CostLine {
  id: string;
  date: string;
  cost: number;
  isLand: boolean;
}

// Items are entered for the whole property, so each line carries the holder's part of the cost.
function costLines(input: CaseInput): CostLine[] {
  const fraction = holderFraction(input);
  return filledItems(input).map((item) => ({
    id: item.id,
    date: item.date,
    cost: correctedCost(item) * fraction,
    isLand: Boolean(item.isLand),
  }));
}

// Zero total cost: a single virtual item takes the whole gain at the acquisition date.
function linesForReduction(lines: CostLine[], acquisitionDate: string): CostLine[] {
  return lines.length > 0 ? lines : [{id: "imovel", date: acquisitionDate, cost: 0, isLand: false}];
}

// With several land items, the construction follows the earliest one.
function landDate(input: CaseInput, lines: CostLine[]): string | null {
  if (!input.landRule) return null;
  return lines.filter((line) => line.isLand).map((line) => line.date).sort()[0];
}

// Land rule (spec 4.2, item 6): construction started up to each limit takes the land date for
// that reduction. Construction started after 1988 gets no art. 18 reduction: art. 18 applies
// only to the land share (IN SRF 84/2001, art. 26, par. 3). Outside the rule, each item keeps
// its own date.
function reductionDates(line: CostLine, land: string | null): {art18Date: string; factorDate: string} {
  if (land === null || line.isLand) return {art18Date: line.date, factorDate: line.date};
  return {
    art18Date: line.date <= LAND_RULE_ART18_LIMIT ? land : line.date,
    factorDate: line.date <= LAND_RULE_FACTOR_LIMIT ? land : line.date,
  };
}

// Each reduction applies in sequence on the previous balance (IN SRF 599/2005, art. 3, pars. 2-5).
function reduceLine(
  line: CostLine,
  share: number,
  gain: number,
  land: string | null,
  sale: string,
): ItemReduction {
  const {art18Date, factorDate} = reductionDates(line, land);
  const art18Pct = art18Percent(Number(art18Date.slice(0, 4)));
  const m1 = countM1(factorDate);
  const m2 = countM2(factorDate, sale);
  const fr1 = factorFR1(m1);
  const fr2 = factorFR2(m2);
  const reducedGain = gain * (1 - art18Pct) * fr1 * fr2;
  return {itemId: line.id, share, gain, art18Pct, m1, m2, fr1, fr2, reducedGain};
}

// Gain split by each item's weight in the total cost. A gain of zero or less has nothing to
// reduce and never yields a negative base.
function reduceGain(input: CaseInput, lines: CostLine[], totalCost: number, grossGain: number): ItemReduction[] {
  if (grossGain <= 0) return [];
  const land = landDate(input, lines);
  return linesForReduction(lines, input.acquisitionDate).map((line) => {
    const share = totalCost > 0 ? line.cost / totalCost : 1;
    return reduceLine(line, share, grossGain * share, land, input.contractDate);
  });
}

function neutralExemption(): ExemptionCheck {
  return {applies: false, reasons: []};
}

function blockedResult(status: CaseStatus, missing: string[]): CaseResult {
  return {
    status,
    missing,
    saleNet: 0,
    totalCost: 0,
    grossGain: 0,
    items: [],
    gainAfterReductions: 0,
    exemption: {small: neutralExemption(), single: neutralExemption()},
    reinvestment: {deadline: null, applied: 0, proceeds: 0, taxedShare: 0},
    taxableBase: 0,
    brackets: [],
    taxDue: 0,
    priorTaxPaid: 0,
    taxPayable: 0,
    schedule: [],
    alerts: [],
  };
}

export function calculateCase(input: CaseInput): CaseResult {
  const scopeReasons = checkScope(input);
  if (scopeReasons.length > 0) return blockedResult("fora_de_escopo", scopeReasons);

  const {invalid, missing} = checkInput(input);
  if (invalid.length > 0) return blockedResult("invalido", [...invalid, ...missing]);
  if (missing.length > 0) return blockedResult("incompleto", missing);

  const saleNet = computeSaleNet(input);
  const lines = costLines(input);
  const totalCost = lines.reduce((sum, line) => sum + line.cost, 0);
  const grossGain = saleNet - totalCost;

  const items = reduceGain(input, lines, totalCost, grossGain);
  const gainAfterReductions = items.reduce((sum, item) => sum + item.reducedGain, 0);

  // Exemptions are all or nothing and come before the table; reinvestment scales the gain.
  const exemption = {small: checkSmallValue(input), single: checkSingleProperty(input)};
  const reinvestment = reinvestmentOutcome(input, saleNet);
  const exempt = exemption.small.applies || exemption.single.applies;
  const taxableBase = exempt ? 0 : gainAfterReductions * reinvestment.taxedShare;

  const {brackets, total: taxDue} = progressiveTax(taxableBase);
  const priorTaxPaid = 0;

  return {
    status: "ok",
    missing: [],
    saleNet,
    totalCost,
    grossGain,
    items,
    gainAfterReductions,
    exemption,
    reinvestment,
    taxableBase,
    brackets,
    taxDue,
    priorTaxPaid,
    taxPayable: taxDue - priorTaxPaid,
    schedule: [],
    alerts: [],
  };
}
