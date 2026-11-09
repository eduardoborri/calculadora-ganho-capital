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
} from "../constants";
import {costIndex} from "../data/custoAte1995";
import type {
  CaseInput,
  CaseResult,
  CaseStatus,
  CostItem,
  ExemptionCheck,
  Installment,
  ItemReduction,
  OutOfScope,
  PriorPart,
  ValueUpdate,
} from "../types";
import {buildAlerts} from "./alerts";
import {filledItems} from "./costItems";
import {isValidDate, monthsInclusive} from "./dates";
import {checkSingleProperty, checkSmallValue, reinvestmentOutcome} from "./exemptions";
import {money} from "./format";
import {holderPart, isPermuta, receivedLabel, saleShare} from "./holder";
import {
  buildSchedule,
  INSTALLMENT_TOLERANCE,
  installmentsBrokerage,
  installmentsTotal,
  settleTax,
} from "./saleModes";
import {progressiveTax} from "./taxTable";
import {applyValueUpdate, isRearpReversal} from "./valueUpdate";

export {progressiveTax};

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
    operation: "venda",
    saleValue: 0,
    permuta: {torna: 0, receivedValue: 0},
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

// ---- Reduction factors ----

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
// the user typed a value over the default. Later costs are never corrected. Reports and screen ask
// usesCostIndex({...item, manual: false}) to know whether the item has the Anexo Unico default.
export function usesCostIndex(item: CostItem): boolean {
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

// ---- Scope and validation ----

const OUT_OF_SCOPE_REASONS: Record<OutOfScope, string> = {
  nao_residente: "Alienante não residente no Brasil: caso fora do escopo da ferramenta.",
  pessoa_juridica: "Alienante pessoa jurídica: caso fora do escopo da ferramenta.",
  rural_terra_nua: "Imóvel rural com regra de terra nua: caso fora do escopo da ferramenta.",
  exterior: "Imóvel no exterior: caso fora do escopo da ferramenta.",
  moeda_estrangeira: "Operação em moeda estrangeira: caso fora do escopo da ferramenta.",
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
  checkFirstContract(input, issues);
}

// With several sales the deadline counts from the first contract. Empty falls back to the sale.
function checkFirstContract(input: CaseInput, issues: Issues): void {
  const {enabled, moreThanOneSale, firstContractDate} = input.reinvestment;
  if (!enabled || !moreThanOneSale || !firstContractDate.trim()) return;
  if (!isValidDate(firstContractDate)) {
    issues.invalid.push(`Data do primeiro contrato inválida: ${firstContractDate}.`);
  } else if (isValidDate(input.contractDate) && firstContractDate > input.contractDate) {
    issues.invalid.push("A data do primeiro contrato não pode ser posterior à data de alienação.");
  }
}

function checkApplications(input: CaseInput, issues: Issues): void {
  if (!input.reinvestment.enabled) return;
  for (const app of input.reinvestment.applications) {
    if (!isValidAmount(app.value)) {
      issues.invalid.push("O valor aplicado deve ser um número positivo de até 1 quatrilhão.");
      return;
    }
  }
}

// In a permuta the torna may be zero (permuta sem torna, no gain), but the value of the property
// received is always needed for the small-value and single-property limits.
function checkPermutaValues(input: CaseInput, issues: Issues): void {
  const {torna, receivedValue} = input.permuta;
  if (!isValidAmount(torna)) {
    issues.invalid.push("A torna deve ser um número positivo de até 1 quatrilhão.");
  }
  if (!isValidAmount(receivedValue)) {
    issues.invalid.push("O valor do imóvel recebido deve ser um número positivo de até 1 quatrilhão.");
  } else if (receivedValue === 0) {
    issues.missing.push("Valor do imóvel recebido");
  }
}

function checkSaleValue(input: CaseInput, issues: Issues): void {
  if (isPermuta(input)) {
    checkPermutaValues(input, issues);
  } else if (!isValidAmount(input.saleValue)) {
    issues.invalid.push("O valor de alienação deve ser um número positivo de até 1 quatrilhão.");
  } else if (input.saleValue === 0) {
    issues.missing.push("Valor de alienação");
  }
}

// In a permuta the brokerage comes off the torna, so it can never exceed it, even when the torna
// is zero (IN SRF 84/2001, art. 19, par. 4).
function checkBrokerage(input: CaseInput, issues: Issues): void {
  const share = saleShare(input);
  if (!isValidAmount(input.brokerage)) {
    issues.invalid.push("A corretagem deve ser um número positivo de até 1 quatrilhão.");
  } else if (isPermuta(input) && input.brokerage > share) {
    issues.invalid.push("A corretagem não pode superar a torna do titular.");
  } else if (!isPermuta(input) && share > 0 && input.brokerage > share) {
    issues.invalid.push("A corretagem não pode superar o valor de alienação.");
  }
}

function checkSale(input: CaseInput, issues: Issues): void {
  checkSaleValue(input, issues);
  if (input.ownership === "condominio") {
    if (!isValidAmount(input.quotaPct) || input.quotaPct > 100) {
      issues.invalid.push("O percentual da quota deve estar entre 0 e 100.");
    } else if (input.quotaPct === 0) {
      issues.missing.push("Percentual da quota");
    }
  }
  checkBrokerage(input, issues);
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

// With an update the cost comes from it, so cost items and the land rule are not looked at.
function checkCost(input: CaseInput, issues: Issues): void {
  if (input.update) return;
  const items = filledItems(input);
  items.forEach((item) => checkCostItem(item, input, issues));
  if (input.landRule && !items.some((item) => item.isLand)) {
    issues.missing.push("Terreno (item de custo marcado)");
  }
}

function checkUpdateDates(update: ValueUpdate, input: CaseInput, issues: Issues): void {
  checkDateField(update.date, "Data da atualização", issues);
  checkDateField(update.originalAcquisitionDate, "Data de aquisição original", issues);
  if (!isValidDate(update.date)) return;
  if (isValidDate(input.contractDate) && update.date > input.contractDate) {
    issues.invalid.push("A data da atualização não pode ser posterior à data de alienação.");
  }
  if (isValidDate(update.originalAcquisitionDate) && update.date < update.originalAcquisitionDate) {
    issues.invalid.push("A data da atualização não pode ser anterior à data de aquisição original.");
  }
}

function checkUpdate(input: CaseInput, issues: Issues): void {
  const {update} = input;
  if (!update) return;
  checkUpdateDates(update, input, issues);
  // A CAA of zero is a real declared cost, as long as the DTA is there.
  if (!isValidAmount(update.caa)) issues.invalid.push("CAA deve ser um número positivo de até 1 quatrilhão.");
  if (!isValidAmount(update.dta)) issues.invalid.push("DTA deve ser um número positivo de até 1 quatrilhão.");
  else if (update.dta === 0) issues.missing.push("DTA");

  const label = "Imposto pago corrigido pela Selic";
  const datesKnown = isValidDate(update.date) && isValidDate(input.contractDate);
  if (!isValidAmount(update.taxPaidSelic)) {
    issues.invalid.push(`${label} deve ser um número positivo de até 1 quatrilhão.`);
  } else if (update.taxPaidSelic === 0 && datesKnown && isRearpReversal(update, input.contractDate)) {
    issues.missing.push(label);
  }
}

function checkInstallment(installment: Installment, input: CaseInput, issues: Issues): void {
  const {date, value, brokerage} = installment;
  checkDateField(date, "Data da parcela", issues);
  if (isValidDate(input.contractDate) && isValidDate(date) && date < input.contractDate) {
    issues.invalid.push(`A parcela de ${date} tem data anterior à alienação.`);
  }
  if (!isValidAmount(value)) {
    issues.invalid.push("O valor da parcela deve ser um número positivo de até 1 quatrilhão.");
  } else if (value === 0) {
    issues.missing.push("Valor da parcela");
  }
  if (!isValidAmount(brokerage)) {
    issues.invalid.push("A corretagem da parcela deve ser um número positivo de até 1 quatrilhão.");
  } else if (isValidAmount(value) && brokerage > value) {
    // A negative net amount would take gain and tax away from the other months.
    issues.invalid.push("A corretagem da parcela não pode superar o valor da parcela.");
  }
}

function checkInstallments(input: CaseInput, issues: Issues): void {
  if (input.saleMode !== "prazo") return;
  if (input.installments.length === 0) issues.missing.push("Parcelas");
  input.installments.forEach((installment) => checkInstallment(installment, input, issues));

  // A permuta without torna has nothing to receive in installments, so any installment exceeds it.
  const share = saleShare(input);
  const total = installmentsTotal(input);
  if ((share > 0 || isPermuta(input)) && total - share > INSTALLMENT_TOLERANCE) {
    issues.invalid.push(`As parcelas somam ${money(total)} e superam ${receivedLabel(input)} (${money(share)}).`);
  }
}

function checkPriorPart(part: PriorPart, input: CaseInput, issues: Issues): void {
  checkDateField(part.date, "Data da parte anterior", issues);
  if (isValidDate(input.contractDate) && isValidDate(part.date) && part.date > input.contractDate) {
    issues.invalid.push(`A parte anterior de ${part.date} tem data posterior à alienação.`);
  }
  if (isValidDate(input.acquisitionDate) && isValidDate(part.date) && part.date < input.acquisitionDate) {
    issues.invalid.push(`A parte anterior de ${part.date} tem data anterior à aquisição.`);
  }
  if (!isValidAmount(part.gain) || !isValidAmount(part.taxPaid)) {
    issues.invalid.push("O ganho e o imposto pago da parte anterior devem ser números positivos de até 1 quatrilhão.");
  }
}

function checkPriorParts(input: CaseInput, issues: Issues): void {
  if (input.saleMode !== "partes") return;
  input.priorParts.forEach((part) => checkPriorPart(part, input, issues));
}

function checkInput(input: CaseInput): Issues {
  const issues: Issues = {invalid: [], missing: []};
  checkDates(input, issues);
  checkSale(input, issues);
  checkCost(input, issues);
  checkUpdate(input, issues);
  checkApplications(input, issues);
  checkInstallments(input, issues);
  checkPriorParts(input, issues);
  return {invalid: issues.invalid, missing: [...new Set(issues.missing)]};
}

// ---- Calculation steps ----

// Brokerage paid by the seller comes off the sale value (IN SRF 84/2001, art. 19, par. 4).
// In "prazo" it comes off each installment instead, so the sale stays gross here.
function computeSaleNet(input: CaseInput): number {
  return input.saleMode === "prazo" ? saleShare(input) : saleShare(input) - input.brokerage;
}

// Art. 39 divides by the sale net of brokerage. In "prazo" that brokerage is in the installments.
function computeProceeds(input: CaseInput, saleNet: number): number {
  return input.saleMode === "prazo" ? saleNet - installmentsBrokerage(input) : saleNet;
}

interface CostLine {
  id: string;
  date: string;
  cost: number;
  isLand: boolean;
}

// Items are entered for the whole property, so each line carries the holder's part of the cost.
// The lines of an update are already the holder's own declared values.
function costLines(input: CaseInput): CostLine[] {
  return filledItems(input).map((item) => ({
    id: item.id,
    date: item.date,
    cost: input.update ? correctedCost(item) : holderPart(input, correctedCost(item)),
    isLand: Boolean(item.isLand),
  }));
}

// Permuta com torna (Perguntao IRPF 2026, 632; IN SRF 84/2001, art. 29, par. 5): only the share
// torna / (cost + torna) of the cost goes against the torna. Taken on the holder's figures, so a
// condominium keeps the same proportion. Without torna the factor is 0: no gain (RIR/2018,
// art. 132, II). A sale keeps the whole cost.
function permutaFactor(input: CaseInput, holderTotalCost: number): number {
  if (!isPermuta(input)) return 1;
  const torna = saleShare(input);
  const base = holderTotalCost + torna;
  return base > 0 ? torna / base : 0;
}

// Each line, virtual update lines included, keeps its date and carries its share of the factor.
function scaleLines(lines: CostLine[], factor: number): CostLine[] {
  return factor === 1 ? lines : lines.map((line) => ({...line, cost: line.cost * factor}));
}

// Cost of the property received = cost of the property given - (torna - gain)
// (RIR/2018, art. 128, par. 4, II; Perguntao IRPF 2026, 632).
function permutaOutcome(
  input: CaseInput,
  factor: number,
  holderTotalCost: number,
  grossGain: number,
): CaseResult["permuta"] {
  if (!isPermuta(input)) return null;
  const tornaGain = Math.max(0, grossGain);
  return {proportion: factor, tornaGain, receivedCost: holderTotalCost - (saleShare(input) - tornaGain)};
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
    permuta: null,
    alerts: [],
  };
}

export function calculateCase(input: CaseInput): CaseResult {
  const scopeReasons = checkScope(input);
  if (scopeReasons.length > 0) return blockedResult("fora_de_escopo", scopeReasons);

  const {invalid, missing} = checkInput(input);
  if (invalid.length > 0) return blockedResult("invalido", [...invalid, ...missing]);
  if (missing.length > 0) return blockedResult("incompleto", missing);

  // The update replaces the cost items. Its lines hold no land item, so the land rule is off.
  const updated = applyValueUpdate(input);
  const costInput = input.update ? {...input, costItems: updated.costItems, landRule: false} : input;

  // In a permuta, saleNet is the torna net of brokerage and the lines hold only the torna's share.
  const saleNet = computeSaleNet(input);
  const holderLines = costLines(costInput);
  const holderTotalCost = holderLines.reduce((sum, line) => sum + line.cost, 0);
  const factor = permutaFactor(input, holderTotalCost);
  const lines = scaleLines(holderLines, factor);
  const totalCost = lines.reduce((sum, line) => sum + line.cost, 0);
  const grossGain = saleNet - totalCost;

  const items = reduceGain(costInput, lines, totalCost, grossGain);
  const gainAfterReductions = items.reduce((sum, item) => sum + item.reducedGain, 0);

  // Exemptions are all or nothing and come before the table; reinvestment scales the gain.
  const exemption = {small: checkSmallValue(input), single: checkSingleProperty(input)};
  const reinvestment = reinvestmentOutcome(input, computeProceeds(input, saleNet));
  const exempt = exemption.small.applies || exemption.single.applies;
  const taxableBase = exempt ? 0 : gainAfterReductions * reinvestment.taxedShare;

  // In "partes" the table may run on a total larger than this sale's taxableBase.
  const {totalGain, tax: taxDue, priorTaxPaid: partsTaxPaid, payable: owed} = settleTax(input, taxableBase);
  const {brackets} = progressiveTax(totalGain);
  // The Rearp deduction counts in every sale mode, also with prior parts out of the window.
  const priorTaxPaid = partsTaxPaid + updated.deductFromTax;
  const payable = Math.max(0, owed - updated.deductFromTax);
  const schedule = buildSchedule(input, taxableBase, owed, updated.deductFromTax);
  // In "prazo" only what was typed is due, so the lines set the amount payable.
  const taxPayable = input.saleMode === "prazo" ? schedule.reduce((sum, line) => sum + line.tax, 0) : payable;

  const partial: CaseResult = {
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
    taxPayable,
    schedule,
    permuta: permutaOutcome(input, factor, holderTotalCost, grossGain),
    alerts: updated.alerts,
  };
  return {...partial, alerts: buildAlerts(input, partial)};
}
