// Value updates (spec 4.4 and 4.5): Lei 14.973/2024 and Rearp (Lei 15.265/2025). Each one becomes
// virtual cost lines that replace the cost items, so the per-item split of the engine gives the
// reductions by date. Art. 18 stops after the option date through the date of the line alone.

import {LAW14973_PERCENT_TABLE, REARP_LOCK_YEARS} from "../constants";
import type {Alert, CaseInput, CostItem, ValueUpdate} from "../types";
import {law14973Alerts, rearpAlerts, updateInputAlerts} from "./alerts";
import {addYears, completedMonths} from "./dates";

export function law14973Percent(months: number): number {
  return LAW14973_PERCENT_TABLE.find((row) => months <= row.upToMonths).percent;
}

// A term in years expires on the day of equal number, which is still inside it
// (Codigo Civil, art. 132, par. 3).
function isWithinRearpLock(update: ValueUpdate, contractDate: string): boolean {
  return update.law === "rearp" && contractDate <= addYears(update.date, REARP_LOCK_YEARS);
}

// A migrated case follows the Rearp in full, so the lock also applies to it.
export function isRearpReversal(update: ValueUpdate, contractDate: string): boolean {
  return isWithinRearpLock(update, contractDate) && !update.exceptionCausaMortisOuPartilha;
}

// No document field exists for a virtual line, so none is claimed.
function virtualLine(id: string, description: string, date: string, value: number): CostItem {
  return {id, description, date, value, hasDocument: false};
}

// GK = sale net - [CAA + DTA x %] (IN RFB 2.222/2024, art. 12). At 0% only the CAA line exists.
function law14973Lines(update: ValueUpdate, percent: number): CostItem[] {
  const caa = virtualLine("atualizacao-caa", "CAA", update.originalAcquisitionDate, update.caa);
  if (percent === 0) return [caa];
  return [caa, virtualLine("atualizacao-dta", "DTA × percentual", update.date, update.dta * percent)];
}

function rearpLines(update: ValueUpdate, reversal: boolean): CostItem[] {
  if (reversal) return [virtualLine("atualizacao-caa", "CAA", update.originalAcquisitionDate, update.caa)];
  return [virtualLine("atualizacao-rearp", "CAA + DTA", update.date, update.caa + update.dta)];
}

// Expects validated dates. gainOverride stays null: the virtual lines give GK by themselves. It is
// kept for the interface of the plan.
export function applyValueUpdate(input: CaseInput): {
  costItems: CostItem[];
  gainOverride: number | null;
  deductFromTax: number;
  alerts: Alert[];
} {
  const {update, contractDate} = input;
  if (!update) return {costItems: input.costItems, gainOverride: null, deductFromTax: 0, alerts: []};

  if (update.law === "14973") {
    const months = completedMonths(update.date, contractDate);
    const percent = law14973Percent(months);
    return {
      costItems: law14973Lines(update, percent),
      gainOverride: null,
      deductFromTax: 0,
      alerts: [...law14973Alerts(months, percent), ...updateInputAlerts(input, false)],
    };
  }

  const withinLock = isWithinRearpLock(update, contractDate);
  const reversal = isRearpReversal(update, contractDate);
  return {
    costItems: rearpLines(update, reversal),
    gainOverride: null,
    deductFromTax: reversal ? update.taxPaidSelic : 0,
    alerts: [...rearpAlerts(input, withinLock, reversal), ...updateInputAlerts(input, reversal)],
  };
}
