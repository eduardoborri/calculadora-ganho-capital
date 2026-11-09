// Sale modes (spec 4.2, items 10 and 11): installment sale, payment schedule and sale in parts.
// Pure functions, full precision.

import {TAX_BRACKETS} from "../constants";
import type {Alert, CaseInput, Installment, PriorPart, ScheduleLine} from "../types";
import {lastBusinessDayOfNextMonth} from "./dates";
import {money} from "./format";
import {saleShare} from "./holder";
import {progressiveTax} from "./taxTable";

// Half a cent, not a legal value: a difference up to this is rounding, not a gap in the installments.
export const INSTALLMENT_TOLERANCE = 0.005;

export function installmentsTotal(input: CaseInput): number {
  return input.installments.reduce((sum, installment) => sum + installment.value, 0);
}

export function installmentsBrokerage(input: CaseInput): number {
  return input.installments.reduce((sum, installment) => sum + installment.brokerage, 0);
}

interface MonthTotal {
  month: string;
  received: number;
  brokerage: number;
}

function totalsByMonth(installments: Installment[]): MonthTotal[] {
  const months = new Map<string, MonthTotal>();
  for (const {date, value, brokerage} of installments) {
    const month = date.slice(0, 7);
    const total = months.get(month) ?? {month, received: 0, brokerage: 0};
    months.set(month, {month, received: total.received + value, brokerage: total.brokerage + brokerage});
  }
  return [...months.values()].sort((a, b) => (a.month < b.month ? -1 : 1));
}

// The tax of a month falls due on the last business day of the next month.
function scheduleLine(month: string, received: number, gain: number, tax: number): ScheduleLine {
  return {month, received, gain, tax, dueDate: lastBusinessDayOfNextMonth(`${month}-01`)};
}

// Takes from each tax its part of the deduction, never below zero. What a line cannot absorb moves
// to the next lines and then back to the earlier ones, so no deduction is lost while tax remains.
function deductFromLines(taxes: number[], parts: number[]): number[] {
  let left = 0;
  const net = taxes.map((tax, index) => {
    const wanted = parts[index] + left;
    const taken = Math.min(tax, wanted);
    left = wanted - taken;
    return tax - taken;
  });
  for (let index = net.length - 1; index >= 0; index -= 1) {
    const taken = Math.min(net[index], left);
    net[index] -= taken;
    left -= taken;
  }
  return net;
}

// Gain of each month = total gain / sale value x amount received, less the brokerage paid that
// month (IN SRF 84/2001, arts. 19, par. 4, and 31). Each month pays the share of the total tax
// that its gain carries. With no gain both ratios are 0 and the lines stay, without tax.
// The deduction follows the amount received, not the gain, so brokerage does not shrink it: with
// all installments typed the lines add up to tax x (1 - brokerage / sale value) - deduction.
function installmentLines(
  input: CaseInput,
  totalGain: number,
  totalTax: number,
  deduction: number,
): ScheduleLine[] {
  const share = saleShare(input);
  const gainRatio = share > 0 ? totalGain / share : 0;
  const taxRatio = totalGain > 0 ? totalTax / totalGain : 0;
  const months = totalsByMonth(input.installments);
  const gains = months.map(({received, brokerage}) => gainRatio * (received - brokerage));
  const parts = months.map(({received}) => (share > 0 ? (deduction * received) / share : 0));
  const taxes = deductFromLines(gains.map((gain) => gain * taxRatio), parts);
  return months.map(({month, received}, index) => scheduleLine(month, received, gains[index], taxes[index]));
}

// `totalTax` comes before `deduction` (Rearp reversal). Outside "prazo" the whole sale is one line
// by the contract date, and no tax means no line.
export function buildSchedule(
  input: CaseInput,
  totalGainForRatio: number,
  totalTax: number,
  deduction = 0,
): ScheduleLine[] {
  if (input.saleMode === "prazo") return installmentLines(input, totalGainForRatio, totalTax, deduction);
  const payable = Math.max(0, totalTax - deduction);
  if (payable <= 0) return [];
  return [scheduleLine(input.contractDate.slice(0, 7), saleShare(input), totalGainForRatio, payable)];
}

// Prior parts inside the window of the sale in parts. With no prior parts the minimum is Infinity
// and this sale is the first operation.
export function summedPriorParts(input: CaseInput): PriorPart[] {
  const firstYear = Math.min(...input.priorParts.map((part) => Number(part.date.slice(0, 4))));
  return Number(input.contractDate.slice(0, 4)) <= firstYear + 1 ? input.priorParts : [];
}

// Sale in parts (spec 4.2, item 10): up to the end of the calendar year after the first operation,
// gains are summed, the table applies to the total and the tax already paid comes off. Later, this
// operation stands alone. Prior gains are taxable gains already after reductions, as typed.
export function applyPriorParts(
  input: CaseInput,
  gain: number,
): {totalGain: number; tax: number; priorTaxPaid: number; payable: number} {
  const summed = summedPriorParts(input);
  const totalGain = summed.reduce((sum, part) => sum + part.gain, gain);
  const priorTaxPaid = summed.reduce((sum, part) => sum + part.taxPaid, 0);
  const tax = progressiveTax(totalGain).total;
  return {totalGain, tax, priorTaxPaid, payable: Math.max(0, tax - priorTaxPaid)};
}

// Prior parts count only in "partes": other modes may hold them from an earlier choice on screen.
export function settleTax(input: CaseInput, gain: number): ReturnType<typeof applyPriorParts> {
  return applyPriorParts(input.saleMode === "partes" ? input : {...input, priorParts: []}, gain);
}

// Prior parts typed but all outside the window: this operation is taxed on its own.
function priorPartsOutsideAlerts(input: CaseInput): Alert[] {
  if (input.saleMode !== "partes" || input.priorParts.length === 0 || summedPriorParts(input).length > 0) return [];
  return [
    {
      id: "partes-fora-do-prazo",
      level: "info",
      text: "Partes anteriores fora do prazo do art. 21, § 3º, da Lei 8.981: apuração própria desta operação.",
      legal: "Lei 8.981/1995, art. 21, § 3º",
    },
  ];
}

// Alerts of this module, merged by buildAlerts.
export function saleModeAlerts(input: CaseInput, taxableGain: number): Alert[] {
  if (input.saleMode === "partes") return priorPartsOutsideAlerts(input);
  if (input.saleMode !== "prazo") return [];
  const alerts: Alert[] = [];

  const share = saleShare(input);
  const total = installmentsTotal(input);
  if (share - total > INSTALLMENT_TOLERANCE) {
    alerts.push({
      id: "parcelas-diferenca",
      level: "aviso",
      text: `As parcelas informadas somam ${money(total)} e ficam ${money(share - total)} abaixo do valor de alienação do titular (${money(share)}). O cronograma mostra só o informado.`,
      legal: "IN SRF 84/2001, art. 31",
    });
  }

  const firstLimit = TAX_BRACKETS[0].upTo;
  if (taxableGain > firstLimit) {
    alerts.push({
      id: "prazo-progressiva",
      level: "aberto",
      text: `Venda a prazo com ganho acima de ${money(firstLimit)}: a alíquota por parcela é interpretação. O imposto total sai da tabela sobre o ganho total, e cada parcela paga a sua proporção.`,
      legal: "Lei 8.981/1995, art. 21; IN SRF 84/2001, art. 31",
    });
  }
  return alerts;
}
