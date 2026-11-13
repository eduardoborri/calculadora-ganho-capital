// pt-BR labels shared by the screen, the PDF and the workbook, so the three never disagree.

import type { AcquisitionForm, CostNature, Operation, Ownership, SaleMode } from "../types";

export const OPERATION_LABEL: Record<Operation, string> = {
  venda: "Venda",
  permuta: "Permuta com torna",
};

export const ACQUISITION_FORM_LABEL: Record<AcquisitionForm, string> = {
  compra: "Compra (ou construção)",
  heranca: "Herança",
  legado: "Legado",
  doacao_adiantamento: "Doação em adiantamento da legítima",
  dissolucao: "Dissolução da sociedade conjugal (partilha)",
};

export const OWNERSHIP_LABEL: Record<Ownership, string> = {
  exclusivo: "Exclusivo",
  condominio: "Condomínio",
  comunhao: "Comunhão (casamento)",
};

export const COST_NATURE_LABEL: Record<CostNature, string> = {
  preco: "Parcela do preço",
  benfeitoria: "Benfeitoria",
  parte: "Parte adquirida depois",
};

export const SALE_MODE_LABEL: Record<SaleMode, string> = {
  vista: "À vista",
  prazo: "A prazo",
  partes: "Em partes",
};

// Options for a select or segmented control, in the order of the map.
export function labelOptions<T extends string>(labels: Record<T, string>): { value: T; label: string }[] {
  return (Object.keys(labels) as T[]).map((value) => ({ value, label: labels[value] }));
}
