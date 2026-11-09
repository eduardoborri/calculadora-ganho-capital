// Holder's share of the sale. Shared by the engine and the exemption rules.

import type {CaseInput} from "../types";

// Holder's part of a whole-property amount: the quota in a condominium, the whole asset
// otherwise, including marital community (IN SRF 84/2001, arts. 19, IV, and 22).
// Multiplies before dividing so round quotas give exact results (800000 * 55 / 100 = 440000).
export function holderPart(input: CaseInput, amount: number): number {
  return input.ownership === "condominio" ? (amount * input.quotaPct) / 100 : amount;
}

// Sale value for the holder, gross of brokerage.
export function saleShare(input: CaseInput): number {
  return holderPart(input, input.saleValue);
}
