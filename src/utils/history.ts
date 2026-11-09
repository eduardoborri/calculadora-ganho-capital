import type {Moeda} from "../data/custoAte1995";
import type {
  AcquisitionForm,
  Application,
  CaseInput,
  CostItem,
  OutOfScope,
  Ownership,
  SaleMode,
  ValueUpdate,
} from "../types";
import {defaultCaseInput} from "./capitalGain";

export const HISTORY_KEY = "gsga-ganho-capital-historico";
const MAX_ENTRIES = 50;

export interface HistoryEntry {
  id: string;
  savedAt: string;
  input: CaseInput;
}

// Resolve the storage; the getter itself may throw (blocked storage), so it is guarded.
function resolveStorage(storage?: Storage): Storage | null {
  if (storage) return storage;
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function newId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    // fall through to the fallback
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// ---- Per-field coercion: a stored value is kept only if it has the expected type ----

function str(v: unknown, d: string): string {
  return typeof v === "string" ? v : d;
}
function num(v: unknown, d: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : d;
}
function bool(v: unknown, d: boolean): boolean {
  return typeof v === "boolean" ? v : d;
}
function oneOf<T extends string>(v: unknown, allowed: readonly T[], d: T): T {
  return allowed.includes(v as T) ? (v as T) : d;
}
function objects(v: unknown): Record<string, unknown>[] {
  return Array.isArray(v) ? v.filter(isObject) : [];
}
function elementId(v: unknown): string {
  return typeof v === "string" && v !== "" ? v : newId();
}

// Record keys make these lists exhaustive: adding a union member breaks the build here.
const keysOf = <T extends string>(r: Record<T, true>): T[] => Object.keys(r) as T[];
const MOEDAS = keysOf<Moeda>({
  "Reais": true,
  "Cruzeiros Reais": true,
  "Cruzeiros": true,
  "Cruzados Novos": true,
  "Cruzados": true,
  "Cruzeiros Novos": true,
  "Mil-Réis": true,
});
const FORMS = keysOf<AcquisitionForm>({
  compra: true,
  heranca: true,
  legado: true,
  doacao_adiantamento: true,
  dissolucao: true,
});
const OWNERSHIPS = keysOf<Ownership>({exclusivo: true, condominio: true, comunhao: true});
const SALE_MODES = keysOf<SaleMode>({vista: true, prazo: true, partes: true});
const OUT_OF_SCOPE = keysOf<OutOfScope>({
  nao_residente: true,
  pessoa_juridica: true,
  rural_terra_nua: true,
  exterior: true,
  moeda_estrangeira: true,
  permuta_torna: true,
});

function normalizeCostItem(r: Record<string, unknown>): CostItem {
  const item: CostItem = {
    id: elementId(r.id),
    description: str(r.description, ""),
    date: str(r.date, ""),
    value: num(r.value, 0),
    hasDocument: bool(r.hasDocument, false),
  };
  if (typeof r.isLand === "boolean") item.isLand = r.isLand;
  if (typeof r.manual === "boolean") item.manual = r.manual;
  const o = r.original;
  if (isObject(o) && typeof o.amount === "number" && Number.isFinite(o.amount) && MOEDAS.includes(o.moeda as Moeda)) {
    item.original = {amount: o.amount, moeda: o.moeda as Moeda};
  }
  return item;
}

function normalizeUpdate(v: unknown): ValueUpdate | null {
  if (!isObject(v) || (v.law !== "14973" && v.law !== "rearp")) return null;
  return {
    law: v.law,
    date: str(v.date, ""),
    caa: num(v.caa, 0),
    dta: num(v.dta, 0),
    originalAcquisitionDate: str(v.originalAcquisitionDate, ""),
    migratedFrom14973: bool(v.migratedFrom14973, false),
    taxPaidSelic: num(v.taxPaidSelic, 0),
    exceptionCausaMortisOuPartilha: bool(v.exceptionCausaMortisOuPartilha, false),
  };
}

// Rebuild a stored (possibly old or corrupted) input field by field over the defaults, so
// calculateCase never meets a missing field, a wrong type or a bad list element.
function normalizeInput(raw: Record<string, unknown>): CaseInput {
  const d = defaultCaseInput();
  const sv = isObject(raw.smallValue) ? raw.smallValue : {};
  const sp = isObject(raw.singleProperty) ? raw.singleProperty : {};
  const re = isObject(raw.reinvestment) ? raw.reinvestment : {};
  return {
    taxpayerName: str(raw.taxpayerName, d.taxpayerName),
    calendarYear: num(raw.calendarYear, d.calendarYear),
    propertyDescription: str(raw.propertyDescription, d.propertyDescription),
    residential: bool(raw.residential, d.residential),
    acquisitionDate: str(raw.acquisitionDate, d.acquisitionDate),
    acquisitionForm: oneOf(raw.acquisitionForm, FORMS, d.acquisitionForm),
    transferAtMarket: bool(raw.transferAtMarket, d.transferAtMarket),
    ownership: oneOf(raw.ownership, OWNERSHIPS, d.ownership),
    quotaPct: num(raw.quotaPct, d.quotaPct),
    landRule: bool(raw.landRule, d.landRule),
    costItems: objects(raw.costItems).map(normalizeCostItem),
    contractDate: str(raw.contractDate, d.contractDate),
    saleValue: num(raw.saleValue, d.saleValue),
    brokerage: num(raw.brokerage, d.brokerage),
    saleMode: oneOf(raw.saleMode, SALE_MODES, d.saleMode),
    belowMarket: bool(raw.belowMarket, d.belowMarket),
    installments: objects(raw.installments).map((r) => ({
      id: elementId(r.id),
      date: str(r.date, ""),
      value: num(r.value, 0),
      brokerage: num(r.brokerage, 0),
    })),
    priorParts: objects(raw.priorParts).map((r) => ({
      id: elementId(r.id),
      date: str(r.date, ""),
      gain: num(r.gain, 0),
      taxPaid: num(r.taxPaid, 0),
    })),
    smallValue: {
      sameNatureMonthTotal: num(sv.sameNatureMonthTotal, d.smallValue.sameNatureMonthTotal),
      confirmed: bool(sv.confirmed, d.smallValue.confirmed),
    },
    singleProperty: {
      onlyProperty: bool(sp.onlyProperty, d.singleProperty.onlyProperty),
      noSaleIn5Years: bool(sp.noSaleIn5Years, d.singleProperty.noSaleIn5Years),
    },
    reinvestment: {
      enabled: bool(re.enabled, d.reinvestment.enabled),
      firstContractDate: str(re.firstContractDate, d.reinvestment.firstContractDate),
      applications: objects(re.applications).map((r) => ({
        id: elementId(r.id),
        date: str(r.date, ""),
        value: num(r.value, 0),
        kind: oneOf<Application["kind"]>(r.kind, ["aquisicao", "quitacao"], "aquisicao"),
      })),
      usedInLast5Years: bool(re.usedInLast5Years, d.reinvestment.usedInLast5Years),
      moreThanOneSale: bool(re.moreThanOneSale, d.reinvestment.moreThanOneSale),
      landOrGarage: bool(re.landOrGarage, d.reinvestment.landOrGarage),
    },
    update: normalizeUpdate(raw.update),
    outOfScope: Array.isArray(raw.outOfScope)
      ? raw.outOfScope.filter((k): k is OutOfScope => OUT_OF_SCOPE.includes(k as OutOfScope))
      : [],
  };
}

export function loadHistory(storage?: Storage): HistoryEntry[] {
  try {
    const store = resolveStorage(storage);
    if (!store) return [];
    const text = store.getItem(HISTORY_KEY);
    if (!text) return [];
    const parsed: unknown = JSON.parse(text);
    if (!Array.isArray(parsed)) return [];
    const entries: HistoryEntry[] = [];
    for (const item of parsed) {
      if (!isObject(item) || !isObject(item.input)) continue;
      // An entry without a stored id cannot be addressed by removeEntry: drop it.
      if (typeof item.id !== "string" || item.id === "") continue;
      entries.push({
        id: item.id,
        savedAt: typeof item.savedAt === "string" ? item.savedAt : "",
        input: normalizeInput(item.input),
      });
    }
    return entries;
  } catch {
    return [];
  }
}

function write(store: Storage, entries: HistoryEntry[]): void {
  store.setItem(HISTORY_KEY, JSON.stringify(entries));
}

// Newest first, capped at 50. The client name is blanked: it never persists.
export function saveEntry(input: CaseInput, storage?: Storage): boolean {
  try {
    const store = resolveStorage(storage);
    if (!store) return false;
    const entry: HistoryEntry = {
      id: newId(),
      savedAt: new Date().toISOString(),
      input: {...input, taxpayerName: ""},
    };
    write(store, [entry, ...loadHistory(store)].slice(0, MAX_ENTRIES));
    return true;
  } catch {
    return false;
  }
}

export function removeEntry(id: string, storage?: Storage): void {
  try {
    const store = resolveStorage(storage);
    if (!store) return;
    write(store, loadHistory(store).filter((e) => e.id !== id));
  } catch {
    // ignore storage failures
  }
}

export function clearHistory(storage?: Storage): void {
  try {
    resolveStorage(storage)?.removeItem(HISTORY_KEY);
  } catch {
    // ignore storage failures
  }
}
