// Holder's share of the sale. Shared by the engine and the exemption rules.

import type {CaseInput} from "../types";

// Holder's part of a whole-property amount: the quota in a condominium, the whole asset
// otherwise, including marital community (IN SRF 84/2001, arts. 19, IV, and 22).
// Multiplies before dividing so round quotas give exact results (800000 * 55 / 100 = 440000).
export function holderPart(input: CaseInput, amount: number): number {
  return input.ownership === "condominio" ? (amount * input.quotaPct) / 100 : amount;
}

export function isPermuta(input: CaseInput): boolean {
  return input.operation === "permuta";
}

// Amount received by the holder, gross of brokerage: the sale value, or in a permuta the torna,
// which is the only amount received in money (RIR/2018, art. 132, II; Perguntao IRPF 2026, 632).
export function saleShare(input: CaseInput): number {
  return holderPart(input, isPermuta(input) ? input.permuta.torna : input.saleValue);
}

// Total value of the holder's operation: in a permuta, torna plus the property received
// (Perguntao IRPF 2026, 681); in a sale, the sale value.
export function operationTotal(input: CaseInput): number {
  if (!isPermuta(input)) return saleShare(input);
  return holderPart(input, input.permuta.torna) + holderPart(input, input.permuta.receivedValue);
}

// pt-BR name of the amount received, for messages, with its article ("a torna") or, with
// `contracted`, the preposition "de" joined to it ("da torna").
// Only a condominium has a holder's part; exclusive ownership and marital community take the whole
// property (IN SRF 84/2001, art. 22).
export function receivedLabel(input: CaseInput, contracted = false): string {
  const condo = input.ownership === "condominio";
  if (isPermuta(input)) return `${contracted ? "da" : "a"} torna${condo ? " do titular" : ""}`;
  return `${contracted ? "do" : "o"} valor de alienação ${condo ? "do titular" : "do imóvel"}`;
}

