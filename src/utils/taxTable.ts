// Progressive tax table, kept apart so the engine and the sale modes share it without a cycle.

import {TAX_BRACKETS} from "../constants";
import type {BracketLine} from "../types";

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
