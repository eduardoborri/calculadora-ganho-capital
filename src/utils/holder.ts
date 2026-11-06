// Holder's share of the sale. Shared by the engine and the exemption rules.

import type {CaseInput} from "../types";

// Holder's fraction of the property: the quota in a condominium, the whole asset otherwise,
// including marital community (IN SRF 84/2001, arts. 19, IV, and 22).
export function holderFraction(input: CaseInput): number {
  return input.ownership === "condominio" ? input.quotaPct / 100 : 1;
}

// Sale value for the holder, gross of brokerage.
export function saleShare(input: CaseInput): number {
  return input.saleValue * holderFraction(input);
}
