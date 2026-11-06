// Cost rows of the input. Shared by the engine and the alerts.

import type {CaseInput, CostItem} from "../types";

// A row the user left untouched: it is neither a cost nor a pending field.
function isBlankItem(item: CostItem): boolean {
  return item.value === 0 && !item.original && !item.date.trim() && !item.description.trim();
}

export function filledItems(input: CaseInput): CostItem[] {
  return input.costItems.filter((item) => !isBlankItem(item));
}
