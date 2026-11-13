// Cost rows of the input. Shared by the engine and the alerts.

import type {CaseInput, CostItem} from "../types";
import {COST_NATURE_LABEL} from "../data/labels";
import {isValidDate} from "./dates";
import {formatDate} from "./format";

// A row the user left untouched: it is neither a cost nor a pending field.
function isBlankItem(item: CostItem): boolean {
  return item.value === 0 && !item.original && !item.date.trim() && !item.description.trim();
}

export function filledItems(input: CaseInput): CostItem[] {
  return input.costItems.filter((item) => !isBlankItem(item));
}

// Date that sets the reductions of an item (art. 18, m1 and m2). A part of the price ("preco")
// takes the date of the purchase contract, the case acquisitionDate, whatever the payment date;
// an improvement or a part acquired later keeps its own date (IN SRF 599/2005, art. 3º, §§ 4º
// and 5º), as does an item without nature. The land rule (§ 6º) has priority: with it on, every
// item keeps its own date and the rule decides.
export function reductionDate(input: CaseInput, item: CostItem): string {
  if (item.nature === "preco" && !input.landRule && isValidDate(input.acquisitionDate)) return input.acquisitionDate;
  return item.date;
}

// pt-BR tag of an item's nature and the date its reductions use, for memo, PDF and workbook.
// Null for an item without nature (its own date, as before).
export function natureText(input: CaseInput, item: CostItem): string | null {
  if (!item.nature) return null;
  return `${COST_NATURE_LABEL[item.nature]}; reduções pela data ${formatDate(reductionDate(input, item))}`;
}
