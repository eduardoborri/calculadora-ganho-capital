import type {CaseInput} from "../types";
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

function arrayOrEmpty<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

// Merge a stored (possibly old or corrupted) input over the defaults so calculateCase never
// meets a missing field or a non-array list.
function normalizeInput(raw: Record<string, unknown>): CaseInput {
  const base = defaultCaseInput();
  const merged = {...base, ...raw} as CaseInput;
  merged.smallValue = {...base.smallValue, ...(isObject(raw.smallValue) ? raw.smallValue : {})};
  merged.singleProperty = {
    ...base.singleProperty,
    ...(isObject(raw.singleProperty) ? raw.singleProperty : {}),
  };
  const reinv = isObject(raw.reinvestment) ? raw.reinvestment : {};
  merged.reinvestment = {...base.reinvestment, ...reinv};
  merged.reinvestment.applications = arrayOrEmpty(reinv.applications);
  merged.costItems = arrayOrEmpty(raw.costItems);
  merged.installments = arrayOrEmpty(raw.installments);
  merged.priorParts = arrayOrEmpty(raw.priorParts);
  merged.outOfScope = arrayOrEmpty(raw.outOfScope);
  merged.update = isObject(raw.update) ? (raw.update as unknown as CaseInput["update"]) : null;
  return merged;
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
      entries.push({
        id: typeof item.id === "string" ? item.id : newId(),
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
