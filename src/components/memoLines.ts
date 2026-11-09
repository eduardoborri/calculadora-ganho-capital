// Lines of the calculation memo, built from the input and the engine result of a case with
// status "ok". Pure: the component only lays them out. Amounts go through money()
// (formatCurrency of round2), factors through formatFactor (6 decimals).

import type { CaseInput, CaseResult, ExemptionCheck, ItemReduction } from "../types";
import { correctedCost, usesCostIndex } from "../utils/capitalGain";
import { filledItems } from "../utils/costItems";
import { formatDate, formatFactor, formatPercent, money, round2 } from "../utils/format";
import { holderPart } from "../utils/holder";
import { applyValueUpdate } from "../utils/valueUpdate";

export interface MemoDetail {
  label: string;
  value?: string;
  // A heading row groups the rows under it (one cost item, one exemption).
  heading?: boolean;
}

export interface MemoLine {
  key: string;
  operator: string;
  label: string;
  value: string;
  detail: MemoDetail[];
  note?: string;
  // A subtotal: drawn over a thin rule.
  subtotal?: boolean;
}

interface CostDetail {
  id: string;
  label: string;
  cost: number;
}

// The same lines the engine used: the holder's part of each item, or the lines of the update.
function costDetails(input: CaseInput): CostDetail[] {
  if (input.update) {
    return applyValueUpdate(input).costItems.map((line) => ({
      id: line.id,
      label: `${line.description} (${formatDate(line.date)})`,
      cost: line.value,
    }));
  }
  return filledItems(input).map((item) => {
    // Same condition as the engine's correction: an item up to 31/12/1995 with an original amount.
    const indexed = usesCostIndex({ ...item, manual: false });
    const tag = !indexed ? "" : item.manual ? ", valor manual" : ", corrigido pelo Anexo Único";
    return {
      id: item.id,
      label: `${item.description.trim() || "Item sem descrição"} (${formatDate(item.date)}${tag})`,
      cost: holderPart(input, correctedCost(item)),
    };
  });
}

function saleLine(input: CaseInput, result: CaseResult): MemoLine {
  const detail: MemoDetail[] = [];
  if (input.ownership === "condominio") {
    detail.push({ label: "Valor do imóvel inteiro", value: money(input.saleValue) });
    detail.push({ label: `Quota do titular (${formatPercent(input.quotaPct / 100)})`, value: money(holderPart(input, input.saleValue)) });
  } else {
    detail.push({ label: "Valor de alienação", value: money(input.saleValue) });
  }
  if (input.saleMode !== "prazo" && input.brokerage > 0) {
    detail.push({ label: "Corretagem paga pelo titular", value: `− ${money(input.brokerage)}` });
  }
  return {
    key: "venda",
    operator: "",
    label: "Valor de alienação",
    value: money(result.saleNet),
    detail,
    note:
      input.saleMode === "prazo"
        ? "Venda a prazo: o valor fica bruto, e a corretagem sai da parcela do mês em que foi paga (IN SRF 84/2001, art. 19, § 4º)."
        : "Preço efetivo menos a corretagem paga pelo vendedor (Lei 7.713/1988, art. 19; IN SRF 84/2001, art. 19, § 4º).",
  };
}

function costLine(input: CaseInput, result: CaseResult, details: CostDetail[]): MemoLine {
  const updateNote = input.update
    ? input.update.law === "14973"
      ? "Lei 14.973/2024: CAA mais DTA × percentual pelos meses completos desde a atualização (IN RFB 2.222/2024, art. 12)."
      : "Rearp: custo e data da atualização, ou os originais quando a venda desfaz a adesão (Lei 15.265/2025, art. 7º)."
    : undefined;
  return {
    key: "custo",
    operator: "−",
    label: "Custo de aquisição",
    value: money(result.totalCost),
    detail: details.map((d) => ({ label: d.label, value: money(d.cost) })),
    note:
      updateNote ??
      (input.ownership === "condominio"
        ? "Itens do imóvel inteiro, na parte do titular. Custo até 31/12/1995 corrigido pelo Anexo Único (IN SRF 84/2001, art. 7º)."
        : "Custo até 31/12/1995 corrigido pelo Anexo Único (IN SRF 84/2001, art. 7º); depois, sem correção (art. 8º)."),
  };
}

function itemRows(item: ItemReduction, label: string): MemoDetail[] {
  const afterArt18 = item.gain * (1 - item.art18Pct);
  const afterFr1 = afterArt18 * item.fr1;
  return [
    { label: `${label}: ${formatPercent(item.share)} do custo`, heading: true },
    { label: "Ganho rateado", value: money(item.gain) },
    { label: `Art. 18 da Lei 7.713/1988: redução de ${formatPercent(item.art18Pct)}`, value: money(afterArt18) },
    { label: `FR1 = 1 ÷ 1,0060^${item.m1} = ${formatFactor(item.fr1)} (m1 = ${item.m1})`, value: money(afterFr1) },
    { label: `FR2 = 1 ÷ 1,0035^${item.m2} = ${formatFactor(item.fr2)} (m2 = ${item.m2})`, value: money(item.reducedGain) },
  ];
}

function reductionLine(result: CaseResult, details: CostDetail[]): MemoLine {
  const labelById = new Map(details.map((d) => [d.id, d.label]));
  return {
    key: "reducoes",
    operator: "−",
    label: "Reduções (art. 18, FR1 e FR2)",
    value: money(result.grossGain - result.gainAfterReductions),
    detail: result.items.flatMap((item) => itemRows(item, labelById.get(item.itemId) ?? "Imóvel (custo zero)")),
    note: "Ganho rateado pelo peso de cada item no custo. Cada redução incide sobre o saldo anterior (IN SRF 599/2005, art. 3º, §§ 2º a 5º). m1 conta de jan/1996, ou do mês de aquisição, até nov/2005; m2, de dez/2005, ou do mês de aquisição, até o mês da alienação, inclusive.",
  };
}

function exemptionRows(title: string, check: ExemptionCheck): MemoDetail[] {
  return [
    { label: `${title}: ${check.applies ? "aplicada" : "não aplicada"}`, heading: true },
    ...check.reasons.map((reason) => ({ label: reason })),
  ];
}

function exemptionLine(result: CaseResult): MemoLine {
  const { small, single } = result.exemption;
  const exempt = small.applies || single.applies;
  return {
    key: "isencoes",
    operator: "−",
    label: "Isenções",
    value: exempt ? money(result.gainAfterReductions) : "não aplicada",
    detail: [
      ...exemptionRows("Pequeno valor (IN SRF 599/2005, art. 1º)", small),
      ...exemptionRows("Único imóvel (Lei 9.250/1995, art. 23)", single),
    ],
    note: "Isenções de tudo ou nada: só valem com todos os requisitos atendidos e vêm antes da tabela.",
  };
}

function reinvestmentLine(input: CaseInput, result: CaseResult): MemoLine {
  const { deadline, applied, proceeds, taxedShare } = result.reinvestment;
  const blocked = taxedShare === 1 && applied > 0;
  return {
    key: "reinvestimento",
    operator: "×",
    label: "Parte tributada (art. 39)",
    value: formatPercent(taxedShare),
    detail: [
      { label: "Produto da venda, líquido de corretagem", value: money(proceeds) },
      { label: deadline ? `Aplicado até ${formatDate(deadline)}` : "Aplicado no prazo", value: money(applied) },
      { label: `1 − ${money(applied)} ÷ ${money(proceeds)}, entre 0 e 1`, value: formatPercent(taxedShare) },
    ],
    note: blocked
      ? "Requisito do art. 39 não atendido (ver alertas): todo o ganho segue tributado."
      : `Lei 11.196/2005, art. 39; IN SRF 599/2005, art. 2º.${input.reinvestment.moreThanOneSale ? " Com mais de uma venda, o prazo conta do primeiro contrato." : ""}`,
  };
}

function taxLine(input: CaseInput, result: CaseResult): MemoLine {
  const totalGain = result.brackets.reduce((sum, b) => sum + b.base, 0);
  const summed = input.saleMode === "partes" && Math.abs(totalGain - result.taxableBase) > 0.005;
  return {
    key: "imposto",
    operator: "",
    label: "Imposto pela tabela",
    value: money(result.taxDue),
    detail: result.brackets.map((b) => ({
      label: `${formatPercent(b.rate)} sobre ${money(b.base)} (de ${money(b.from)} ${Number.isFinite(b.to) ? `a ${money(b.to)}` : "em diante"})`,
      value: money(b.tax),
    })),
    note: summed
      ? `Alienação em partes: a tabela incide sobre o total somado de ${money(totalGain)} (esta operação e as partes anteriores no prazo). Lei 8.981/1995, art. 21.`
      : "Tabela progressiva por faixa sobre a base (Lei 8.981/1995, art. 21).",
  };
}

function priorTaxLine(input: CaseInput, result: CaseResult): MemoLine {
  const rearp = input.update ? applyValueUpdate(input).deductFromTax : 0;
  const parts = result.priorTaxPaid - rearp;
  const detail: MemoDetail[] = [];
  if (parts > 0) detail.push({ label: "Imposto pago nas partes anteriores", value: money(parts) });
  if (rearp > 0) detail.push({ label: "Rearp desfeito: imposto pago corrigido pela Selic", value: money(rearp) });
  return {
    key: "pago",
    operator: "−",
    label: "Imposto já pago",
    value: money(result.priorTaxPaid),
    detail,
    note:
      rearp > 0
        ? "A venda em até 5 anos da adesão desfaz o Rearp e deduz o imposto pago, corrigido pela Selic (Lei 15.265/2025, art. 7º)."
        : "Alienação em partes: deduz-se o imposto já pago nas partes anteriores.",
  };
}

export function buildMemoLines(input: CaseInput, result: CaseResult): MemoLine[] {
  const details = costDetails(input);
  const lines: MemoLine[] = [saleLine(input, result), costLine(input, result, details)];
  lines.push({
    key: "bruto",
    operator: "=",
    label: "Ganho bruto",
    value: money(result.grossGain),
    detail: [],
    note: result.grossGain <= 0 ? "Ganho zero ou negativo: sem imposto e sem base negativa." : undefined,
    subtotal: true,
  });
  if (result.items.length > 0) {
    lines.push(reductionLine(result, details));
    lines.push({
      key: "reduzido",
      operator: "=",
      label: "Ganho após reduções",
      value: money(result.gainAfterReductions),
      detail: [],
      subtotal: true,
    });
    lines.push(exemptionLine(result));
    if (input.reinvestment.enabled) lines.push(reinvestmentLine(input, result));
  }
  lines.push({ key: "base", operator: "=", label: "Base tributável", value: money(result.taxableBase), detail: [], subtotal: true });
  lines.push(taxLine(input, result));
  if (result.priorTaxPaid > 0) lines.push(priorTaxLine(input, result));
  return lines;
}

// How the amount payable relates to the tax of the table, per sale mode.
function modeNote(input: CaseInput, result: CaseResult): string | null {
  if (input.saleMode === "prazo") {
    return "Venda a prazo: soma das linhas do cronograma. Cada parcela informada paga a sua proporção do imposto (IN SRF 84/2001, art. 31).";
  }
  if (input.saleMode === "partes" && result.priorTaxPaid > 0) {
    return "Imposto da tabela sobre o total somado, menos o imposto já pago.";
  }
  if (result.priorTaxPaid > 0) return "Imposto da tabela menos a dedução do Rearp desfeito.";
  return null;
}

export const EXCESS_DEDUCTION_NOTE =
  "O imposto a pagar não fica abaixo de zero, e o excesso da dedução não é restituído por esta apuração.";

// Compared in cents, as shown: a deduction above the tax of the table adds the excess sentence.
export function payableNote(input: CaseInput, result: CaseResult): string | null {
  const note = modeNote(input, result);
  if (round2(result.priorTaxPaid) <= round2(result.taxDue)) return note;
  return note ? `${note} ${EXCESS_DEDUCTION_NOTE}` : EXCESS_DEDUCTION_NOTE;
}
