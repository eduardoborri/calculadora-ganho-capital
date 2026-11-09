import type {Moeda} from "./data/custoAte1995";

export type AcquisitionForm = "compra" | "heranca" | "legado" | "doacao_adiantamento" | "dissolucao";
export type Ownership = "exclusivo" | "condominio" | "comunhao";
export type SaleMode = "vista" | "prazo" | "partes";
export type Operation = "venda" | "permuta";
export type OutOfScope = "nao_residente" | "pessoa_juridica" | "rural_terra_nua" | "exterior" | "moeda_estrangeira";

export interface CostItem {
  id: string;
  description: string;
  date: string; // for a construction item, the date the construction started
  value: number;
  hasDocument: boolean;
  isLand?: boolean;
  original?: {amount: number; moeda: Moeda}; // item up to 31/12/1995
  manual?: boolean; // value typed over the default
}

export interface Installment {
  id: string;
  date: string;
  value: number;
  brokerage: number;
}

export interface PriorPart {
  id: string;
  date: string;
  gain: number;
  taxPaid: number;
}

export interface Application {
  id: string;
  date: string;
  value: number;
  kind: "aquisicao" | "quitacao";
}

// caa, dta and taxPaidSelic are the holder's own values, as declared: the declaration and the Deap
// are per taxpayer, so they never scale by the quota, unlike cost items.
export interface ValueUpdate {
  law: "14973" | "rearp";
  date: string;
  caa: number;
  dta: number;
  originalAcquisitionDate: string;
  migratedFrom14973: boolean;
  taxPaidSelic: number; // Rearp: tax paid corrected by Selic, typed by the user
  exceptionCausaMortisOuPartilha: boolean;
}

// Amount convention: saleValue and costItems are entered for the whole property. Only with
// ownership "condominio" both scale by quotaPct; "exclusivo" and "comunhao" ignore it.
// brokerage is what the holder paid and is never scaled.
// Application.value and smallValue.sameNatureMonthTotal are the holder's part, as typed:
// they are never scaled by the quota, unlike saleValue and cost items (whole property).
// Installment.value and Installment.brokerage are also the holder's part, as typed. In saleMode
// "prazo" the case brokerage is not used: brokerage comes from each installment.
// PriorPart.gain is the taxable gain of that part, already after reductions, as typed.
// With `update` present, costItems and landRule are ignored: the update sets the cost lines.
// Operation "permuta" (permuta com torna): saleValue is ignored and the torna takes its place as
// the amount received. permuta.torna and permuta.receivedValue are for the whole operation, so in
// a condominium they scale by quotaPct like saleValue. Installments, in "prazo", are the torna's.
export interface CaseInput {
  taxpayerName: string;
  calendarYear: number;
  propertyDescription: string;
  residential: boolean;
  acquisitionDate: string;
  acquisitionForm: AcquisitionForm;
  transferAtMarket: boolean;
  ownership: Ownership;
  quotaPct: number;
  landRule: boolean;
  costItems: CostItem[];
  contractDate: string;
  operation: Operation;
  saleValue: number;
  permuta: {torna: number; receivedValue: number};
  brokerage: number;
  saleMode: SaleMode;
  belowMarket: boolean;
  installments: Installment[];
  priorParts: PriorPart[];
  smallValue: {sameNatureMonthTotal: number; confirmed: boolean};
  singleProperty: {onlyProperty: boolean; noSaleIn5Years: boolean};
  reinvestment: {
    enabled: boolean;
    firstContractDate: string;
    applications: Application[];
    usedInLast5Years: boolean;
    moreThanOneSale: boolean;
    landOrGarage: boolean;
  };
  update: ValueUpdate | null;
  outOfScope: OutOfScope[];
}

export interface ItemReduction {
  itemId: string;
  share: number;
  gain: number;
  art18Pct: number;
  m1: number;
  m2: number;
  fr1: number;
  fr2: number;
  reducedGain: number;
}

export interface BracketLine {
  from: number;
  to: number;
  rate: number;
  base: number;
  tax: number;
}

export interface ScheduleLine {
  month: string;
  received: number;
  gain: number;
  tax: number;
  dueDate: string;
}

export interface Alert {
  id: string;
  level: "info" | "aviso" | "risco" | "aberto";
  text: string;
  legal: string;
}

export type CaseStatus = "ok" | "incompleto" | "invalido" | "fora_de_escopo";

export interface ExemptionCheck {
  applies: boolean;
  reasons: string[];
}

export interface CaseResult {
  status: CaseStatus;
  missing: string[];
  saleNet: number;
  totalCost: number;
  grossGain: number;
  items: ItemReduction[];
  gainAfterReductions: number;
  exemption: {small: ExemptionCheck; single: ExemptionCheck};
  reinvestment: {deadline: string | null; applied: number; proceeds: number; taxedShare: number};
  taxableBase: number;
  brackets: BracketLine[];
  taxDue: number;
  priorTaxPaid: number;
  taxPayable: number;
  schedule: ScheduleLine[];
  // Permuta com torna, on the holder's figures; null for a sale (Perguntao IRPF 2026, 632).
  // proportion = torna / (total cost + torna); receivedCost = cost of the property received.
  permuta: {proportion: number; tornaGain: number; receivedCost: number} | null;
  alerts: Alert[];
}
