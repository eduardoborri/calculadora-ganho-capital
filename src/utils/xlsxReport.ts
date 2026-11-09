import type * as ExcelJSTypes from "exceljs";
import {
  COST_INDEX_END,
  FR1_RATE,
  FR2_RATE,
  LAW14973_PERCENT_TABLE,
  REINVESTMENT_DAYS,
  SINGLE_PROPERTY_LIMIT,
  SMALL_VALUE_LIMIT,
  TAX_BRACKETS,
} from "../constants";
import { costIndex } from "../data/custoAte1995";
import type { AcquisitionForm, CaseInput, CaseResult, CostItem, ItemReduction, Ownership, SaleMode } from "../types";
import { art18Percent, countM1, countM2 } from "./capitalGain";
import { filledItems } from "./costItems";
import { completedMonths, isValidDate, lastBusinessDayOfNextMonth, todayInBrazil } from "./dates";
import { formatDate } from "./format";
import { reportFileName } from "./pdfReport";
import { summedPriorParts } from "./saleModes";
import { applyValueUpdate, isRearpReversal, law14973Percent } from "./valueUpdate";

/*
 * Excel workbook with the whole calculation of a case, adapted from the IRPF-M calculator.
 * One sheet, "Apuração". Every derived number is a real formula over input cells, so the
 * workbook can be audited and changed: blue font = input (the tool's value at export time),
 * yellow fill = input the user should check or fill (table lookups, month counts and legal
 * requirements), black = formula. The last sections compare the formulas with the tool's
 * result: the difference must be zero.
 *
 * Only Excel functions that fast-formula-parser also evaluates are used (SUM, MIN, MAX, IF, AND,
 * OR, ROUND and ^), so tests/xlsxReport.test.ts can recalculate the sheet in node.
 */

type ExcelJS = typeof ExcelJSTypes;
type Sheet = ExcelJSTypes.Worksheet;
type Cell = ExcelJSTypes.Cell;

export interface XlsxReportParams {
  input: CaseInput;
  result: CaseResult;
}

export interface GeneratedSpreadsheet {
  blob: Blob;
  fileName: string;
}

// Addresses of one row of the conference: the tool's value (pasted), the workbook's formula and
// the difference formula, ROUND(sheet, 2) - ROUND(tool, 2).
export interface ConferenceCells {
  label: string;
  tool: string;
  sheet: string;
  diff: string;
}

export interface BuiltWorkbook {
  workbook: ExcelJSTypes.Workbook;
  conference: ConferenceCells[];
}

// exceljs is about 1 MB, so it is loaded on demand and preloaded when the screen opens.
let excelPromise: Promise<ExcelJS> | null = null;
export function preloadExcel(): Promise<ExcelJS> {
  excelPromise ??= import("exceljs")
    .then((mod) => ((mod as unknown as { default?: ExcelJS }).default ?? mod) as ExcelJS)
    .catch((err) => {
      excelPromise = null;
      throw err;
    });
  return excelPromise;
}

// Builds the workbook without any browser API, so a test can pass the real exceljs module.
export function buildWorkbook(excel: ExcelJS, params: XlsxReportParams): BuiltWorkbook {
  if (params.result.status !== "ok") {
    throw new Error("A planilha só é gerada para um caso completo, válido e dentro do escopo.");
  }
  const workbook = new excel.Workbook();
  workbook.creator = "Calculadora de Ganho de Capital – Gaia Silva Gaede Advogados";
  workbook.calcProperties.fullCalcOnLoad = true;
  const conference = buildSheet(workbook.addWorksheet("Apuração"), params.input, params.result);
  return { workbook, conference };
}

export async function generateXlsxReport(params: XlsxReportParams): Promise<GeneratedSpreadsheet> {
  const excel = await preloadExcel();
  const { workbook } = buildWorkbook(excel, params);
  const buffer = await workbook.xlsx.writeBuffer();
  return {
    blob: new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    fileName: reportFileName(params.input.taxpayerName, "xlsx"),
  };
}

// ------------------------------------------------------------------ styles
const FONT = "Arial";
const BLUE = "FF0000FF";
const BLACK = "FF000000";
const DARK = "FF143E3C";
const TEAL = "FF238783";
const MUTED = "FF595959";
const RED = "FFC00000";
const INFO = "FF7F7F7F"; // grey italic: informative value, fixed at export
const MONEY = 'R$ #,##0.00;-R$ #,##0.00;"-"';
const PCT = "0.00%";
const PCT6 = "0.000000%";
const FACTOR = "0.000000";
const RATIO = "0.000000000";
const INDEX = "0.0000####";
const INT = "0";
const QUOTA = '0.00" %"';
const FLAG = '"Sim";"Sim";"Não"';
const FLAG_NOTE = "1 = Sim, 0 = Não.";
const fill = (argb: string): ExcelJSTypes.Fill => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
const YELLOW = fill("FFFFFF00");
const TOOL_FILL = fill("FFEDEDED");
const SECTION_FILL = fill(DARK);
const SUB_FILL = fill("FFDCEBEA");
const TOTAL_FILL = fill("FFF2F2F2");
const RESULT_FILL = fill("FFFCE4D6");
const thin: ExcelJSTypes.Border = { style: "thin", color: { argb: "FFBFBFBF" } };
const BOX: Partial<ExcelJSTypes.Borders> = { left: thin, right: thin, top: thin, bottom: thin };
const LAST_COL = 14; // A..N
const NOTE_COL = 14;
const WIDTHS = [7, 42, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 44];
const COL = "ABCDEFGHIJKLMN";

const FORM_LABEL: Record<AcquisitionForm, string> = {
  compra: "Compra",
  heranca: "Herança",
  legado: "Legado",
  doacao_adiantamento: "Doação em adiantamento da legítima",
  dissolucao: "Dissolução da sociedade conjugal",
};
const MODE_LABEL: Record<SaleMode, string> = { vista: "À vista", prazo: "A prazo", partes: "Em partes" };
const OWNERSHIP_LABEL: Record<Ownership, string> = {
  exclusivo: "Exclusiva",
  condominio: "Condomínio",
  comunhao: "Bem comum do casamento",
};
const LEVEL_LABEL: Record<string, string> = {
  info: "Informação",
  aviso: "Aviso",
  risco: "Risco",
  aberto: "PONTO EM ABERTO",
};

interface StyleOptions {
  bold?: boolean;
  color?: string;
  size?: number;
  fill?: ExcelJSTypes.Fill;
  fmt?: string;
  align?: "left" | "center" | "right";
  wrap?: boolean;
  italic?: boolean;
}

type Value = string | number | null | { formula: string };

// One cost line, in the order the engine builds them.
type CostKind = "plain" | "indexed" | "manual" | "caa" | "dta" | "rearp" | "zero";
interface CostRow {
  id: string;
  label: string;
  date: string;
  kind: CostKind;
  item?: CostItem;
}

const isoMonth = (iso: string) => `${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

// Same conditions as the engine's correctedCost: an item up to 31/12/1995 with an original amount.
function itemKind(item: CostItem): CostKind {
  const old = Boolean(item.original) && isValidDate(item.date) && item.date <= COST_INDEX_END;
  if (!old) return "plain";
  return item.manual ? "manual" : "indexed";
}

function costRows(input: CaseInput): CostRow[] {
  const { update } = input;
  if (update?.law === "14973") {
    // Both lines always: at 0% the DTA line costs 0 and carries no gain, as in the engine.
    return [
      { id: "atualizacao-caa", label: "CAA (custo de aquisição declarado)", date: update.originalAcquisitionDate, kind: "caa" },
      { id: "atualizacao-dta", label: "DTA × percentual", date: update.date, kind: "dta" },
    ];
  }
  if (update?.law === "rearp") {
    return applyValueUpdate(input).costItems.map((line) =>
      line.id === "atualizacao-rearp"
        ? { id: line.id, label: "CAA + DTA (Rearp)", date: line.date, kind: "rearp" as const }
        : { id: line.id, label: "CAA (custo original, Rearp desfeito)", date: line.date, kind: "caa" as const },
    );
  }
  const rows: CostRow[] = filledItems(input).map((item) => ({
    id: item.id,
    label: item.description.trim() || "Item sem descrição",
    date: item.date,
    kind: itemKind(item),
    item,
  }));
  if (rows.length > 0) return rows;
  return [{ id: "imovel", label: "Imóvel (custo zero)", date: input.acquisitionDate, kind: "zero" }];
}

// The engine's reduction inputs for a line. Without a gain the engine lists no items; any
// percentage then gives zero, so the plain values for the line's own date are shown.
function reductionInputs(row: CostRow, result: CaseResult, contractDate: string): Pick<ItemReduction, "art18Pct" | "m1" | "m2"> {
  const found = result.items.find((item) => item.itemId === row.id);
  if (found) return found;
  return {
    art18Pct: art18Percent(Number(row.date.slice(0, 4))),
    m1: countM1(row.date),
    m2: countM2(row.date, contractDate),
  };
}

function law14973Note(): string {
  const parts = LAW14973_PERCENT_TABLE.map((row) =>
    Number.isFinite(row.upToMonths)
      ? `até ${row.upToMonths}, ${Math.round(row.percent * 100)}%`
      : `acima de 180, ${Math.round(row.percent * 100)}%`,
  );
  return `IN RFB 2.222/2024, art. 12: percentual do DTA pelos meses completos desde a atualização (${parts.join("; ")}).`;
}

function buildSheet(ws: Sheet, input: CaseInput, result: CaseResult): ConferenceCells[] {
  ws.views = [{ state: "frozen", ySplit: 3, showGridLines: false }];
  ws.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: "1:3" };
  WIDTHS.forEach((w, i) => (ws.getColumn(i + 1).width = w));

  let row = 1;
  const R: Record<string, number> = {};

  const put = (r: number, c: number, value: Value, o: StyleOptions = {}): Cell => {
    const cell = ws.getCell(r, c);
    if (value !== null) cell.value = value;
    cell.font = { name: FONT, bold: o.bold, italic: o.italic, size: o.size ?? 10, color: { argb: o.color ?? BLACK } };
    if (o.fill) cell.fill = o.fill;
    if (o.fmt) cell.numFmt = o.fmt;
    cell.alignment = { horizontal: o.align ?? "left", vertical: "middle", wrapText: o.wrap };
    return cell;
  };
  const f = (formula: string) => ({ formula });
  const merge = (r: number, c1: number, c2: number) => {
    if (c2 > c1) ws.mergeCells(r, c1, r, c2);
  };
  const addr = (r: number, c: number) => `${COL[c - 1]}${r}`;
  const abs = (r: number, c: number) => `$${COL[c - 1]}$${r}`;
  // Value cell (column C) of a single-value row.
  const V = (key: string) => abs(R[key], 3);

  const finish = (height?: number) => {
    for (let c = 1; c <= LAST_COL; c++) ws.getCell(row, c).border = BOX;
    if (height) ws.getRow(row).height = height;
    row++;
  };
  const section = (title: string) => {
    row++;
    merge(row, 1, LAST_COL);
    put(row, 1, title, { bold: true, color: "FFFFFFFF", size: 11, fill: SECTION_FILL });
    ws.getRow(row).height = 20;
    row++;
  };
  const header = (labels: [number, string][], spans: Record<number, number> = {}) => {
    for (let c = 1; c <= LAST_COL; c++) {
      ws.getCell(row, c).border = BOX;
      ws.getCell(row, c).fill = SUB_FILL;
    }
    for (const [c, text] of labels) {
      put(row, c, text, { bold: true, color: DARK, fill: SUB_FILL, align: c > 2 && c < NOTE_COL ? "center" : "left", wrap: true });
      merge(row, c, spans[c] ?? c);
    }
    ws.getRow(row).height = 30;
    row++;
  };
  const sub = (title: string) => {
    merge(row, 1, LAST_COL);
    put(row, 1, title, { bold: true, color: TEAL, fill: SUB_FILL });
    row++;
  };
  const note = (r: number, text: string, from = 4) => {
    merge(r, from, LAST_COL);
    put(r, from, text, { size: 9, color: MUTED, wrap: true });
  };
  const textRow = (label: string, text: string) => {
    put(row, 2, label, { bold: true });
    merge(row, 3, LAST_COL);
    put(row, 3, text, { wrap: true });
    finish();
  };

  // "info": grey italic, a value that follows from the data on screen and is not meant to be edited
  // here (changing it would not recalculate consistently; a new export is needed).
  type Kind = "input" | "fill" | "formula" | "total" | "result" | "info";
  const flagCell = (r: number, c: number) => {
    const cell = ws.getCell(r, c);
    cell.dataValidation = { type: "list", allowBlank: false, formulae: ['"0,1"'] };
    cell.note = FLAG_NOTE;
  };
  // Single-value row: reference, label, value in column C and the note from column D on.
  const line = (ref: string, label: string, value: Value, fmt: string, text: string, kind: Kind = "formula") => {
    R[ref] = row;
    const rowFill = kind === "total" ? TOTAL_FILL : kind === "result" ? RESULT_FILL : undefined;
    const bold = kind === "total" || kind === "result";
    const isInput = kind === "input" || kind === "fill";
    put(row, 1, ref, { bold: true, color: DARK, align: "center", fill: rowFill });
    put(row, 2, label, { bold, wrap: true, fill: rowFill });
    put(row, 3, value, {
      bold,
      fmt,
      align: "right",
      color: isInput ? BLUE : kind === "info" ? INFO : BLACK,
      italic: kind === "info",
      fill: kind === "fill" ? YELLOW : rowFill,
    });
    const editableFlag = fmt === FLAG && isInput;
    if (editableFlag) flagCell(row, 3);
    if (editableFlag) text = `${text} ${FLAG_NOTE}`;
    note(row, text);
    finish(text.length > 120 ? 30 : undefined);
  };
  const inputCell = (r: number, c: number, value: number, fmt: string, yellow = false) => {
    put(r, c, value, { color: BLUE, fill: yellow ? YELLOW : undefined, fmt, align: "right" });
    if (fmt === FLAG) flagCell(r, c);
  };
  const infoCell = (r: number, c: number, value: number, fmt: string) =>
    put(r, c, value, { color: INFO, italic: true, fmt, align: "right" });
  const formulaCell = (r: number, c: number, formula: string, fmt: string, bold = false, rowFill?: ExcelJSTypes.Fill) =>
    put(r, c, f(formula), { fmt, align: "right", bold, fill: rowFill });

  const { update } = input;
  const prazo = input.saleMode === "prazo";
  const partes = input.saleMode === "partes";
  const condominio = input.ownership === "condominio";

  // ---------------------------------------------------------------- title
  merge(1, 1, LAST_COL);
  put(1, 1, "Apuração do ganho de capital na alienação de imóvel – memória de cálculo", { bold: true, color: DARK, size: 15 });
  ws.getRow(1).height = 24;
  merge(2, 1, LAST_COL);
  put(
    2,
    1,
    `CONFIDENCIAL – Contribuinte: ${input.taxpayerName.trim() || "não informado"}. Uso interno do Gaia Silva Gaede Advogados - PR. ` +
      `Emitida em ${formatDate(todayInBrazil())}. Simulação de caráter consultivo: não substitui o demonstrativo oficial da Receita Federal, a declaração nem a análise do caso.`,
    { italic: true, color: RED, wrap: true },
  );
  ws.getRow(2).height = 34;
  merge(3, 1, LAST_COL);
  put(
    3,
    1,
    "Legenda: texto azul = dado de entrada (valor da ferramenta na exportação) · fundo amarelo = dado a conferir ou preencher " +
      "(tabela legal, contagem de meses ou requisito; Sim/Não como 1 ou 0) · texto preto = fórmula · cinza itálico = informativo, " +
      "segue dos dados da tela e só muda com nova exportação. Alterar uma entrada recalcula toda a apuração; " +
      "a seção 10 compara o resultado com o da ferramenta.",
    { size: 9, color: MUTED, wrap: true },
  );
  ws.getRow(3).height = 30;
  row = 4;

  // ---------------------------------------------------------------- 1. premissas
  section("1. PREMISSAS E REFERÊNCIAS LEGAIS");
  header([[1, "Ref."], [2, "Premissa"], [3, "Valor"], [4, "Fundamento legal / observação"]], { 4: LAST_COL });
  line("P1", "Taxa mensal do fator de redução FR1", FR1_RATE, PCT,
    "Lei 11.196/2005, art. 40; IN SRF 599/2005, art. 3º. FR1 = 1 ÷ (1 + P1)^m1, para custo até nov/2005.", "fill");
  line("P2", "Taxa mensal do fator de redução FR2", FR2_RATE, PCT,
    "Lei 11.196/2005, art. 40; IN SRF 599/2005, art. 3º. FR2 = 1 ÷ (1 + P2)^m2.", "fill");
  line("P3", "Limite da isenção de pequeno valor (no mês)", SMALL_VALUE_LIMIT, MONEY,
    "IN SRF 599/2005, art. 1º: conjunto de bens da mesma natureza alienados no mês, na parte do titular. Informativo: o requisito entra como Sim/Não na seção 6.", "info");
  line("P4", "Limite da isenção do único imóvel", SINGLE_PROPERTY_LIMIT, MONEY,
    "Lei 9.250/1995, art. 23; IN SRF 84/2001, art. 29, I: sem outra alienação, tributada ou não, em 5 anos. Informativo: o requisito entra como Sim/Não na seção 6.", "info");
  line("P5", "Prazo do reinvestimento (dias)", REINVESTMENT_DAYS, INT,
    "Lei 11.196/2005, art. 39; IN SRF 599/2005, art. 2º: o dia 180 conta, o 181 não. Informativo: cada aplicação entra como dentro ou fora do prazo na seção 7.", "info");
  const qualitative: [string, string][] = [
    ["Q1", "Art. 18 da Lei 7.713/1988: redução de 5 pontos percentuais por ano de aquisição, de 100% até 1969 a 5% em 1988; sem redução para aquisição a partir de 1989. Percentual por item na coluna E da seção 5."],
    ["Q2", "m1 conta de jan/1996, ou do mês de aquisição se posterior, até nov/2005, só para item até nov/2005. m2 conta de dez/2005, ou do mês de aquisição se posterior, até o mês da alienação. Os dois contam o mês inicial e o final (Perguntão IRPF 2026, pergunta 649)."],
    ["Q3", "O ganho é rateado pelo peso de cada item no custo; art. 18, FR1 e FR2 incidem em sequência, cada um sobre o saldo anterior (IN SRF 599/2005, art. 3º, §§ 2º a 5º). Custo total zero: todo o ganho usa a data de aquisição do imóvel."],
    ["Q4", "Custo até 31/12/1995: valor original dividido pelo índice do Anexo Único da IN SRF 84/2001 (art. 7º); custo a partir de 1996 sem correção (art. 8º)."],
    ["Q5", "Imposto pela tabela progressiva, por faixa, sobre a base final (Lei 8.981/1995, art. 21, com a redação da Lei 13.259/2016). Contas em precisão total; arredondamento em duas casas só na conferência."],
  ];
  if (input.landRule && !update) {
    qualitative.push(["Q6", "Terreno com obra iniciada até o marco: a data do terreno vale para o art. 18 até 31/12/1988 (IN SRF 84/2001, art. 26, § 1º) e para FR1 e FR2 até 31/12/1995 (IN SRF 599/2005, art. 3º, § 6º). As colunas E, G e J da seção 5 já trazem essas datas."]);
  }
  for (const [ref, text] of qualitative) {
    put(row, 1, ref, { bold: true, color: DARK, align: "center" });
    merge(row, 2, LAST_COL);
    put(row, 2, text, { wrap: true });
    finish(30);
  }

  // ---------------------------------------------------------------- 2. dados
  section("2. DADOS DO CASO");
  textRow("Contribuinte", input.taxpayerName.trim() || "não informado");
  if (input.calendarYear) textRow("Ano-calendário", String(input.calendarYear));
  textRow("Imóvel", `${input.propertyDescription.trim() || "não descrito"}${input.residential ? " (residencial)" : ""}`);
  textRow("Data de aquisição", `${formatDate(input.acquisitionDate)} – ${FORM_LABEL[input.acquisitionForm]}`);
  textRow("Data da alienação (contrato)", formatDate(input.contractDate));
  textRow("Modalidade da venda", MODE_LABEL[input.saleMode]);
  textRow("Titularidade", OWNERSHIP_LABEL[input.ownership]);

  header([[1, "Ref."], [2, "Valor"], [3, "R$"], [4, "Fundamento legal / observação"]], { 4: LAST_COL });
  line("V1", "Valor de alienação do imóvel inteiro", input.saleValue, MONEY, "Preço efetivo da operação (Lei 7.713/1988, art. 19).", "input");
  if (condominio) {
    line("V2", "Quota do titular (%)", input.quotaPct, QUOTA, "Condomínio: valor de alienação e custo na parte do titular (IN SRF 84/2001, art. 19, IV).", "input");
    line("V3", "Valor de alienação do titular", f(`${V("V1")}*${V("V2")}/100`), MONEY, "V1 × V2 ÷ 100.");
  } else {
    const why =
      input.ownership === "comunhao"
        ? "Bem comum do casamento: o bem inteiro (IN SRF 84/2001, art. 22). O imposto pode ser recolhido 50% em nome de cada cônjuge ou pela totalidade em nome de um deles (art. 30, § 2º)."
        : "Titularidade exclusiva: o bem inteiro.";
    line("V3", "Valor de alienação do titular", f(V("V1")), MONEY, `= V1. ${why}`);
  }
  if (prazo) {
    line("V5", "Valor de alienação considerado", f(V("V3")), MONEY,
      "= V3. Venda a prazo: o valor fica bruto, e a corretagem sai da parcela do mês em que foi paga (IN SRF 84/2001, art. 19, § 4º; seção 9).");
  } else {
    line("V4", "Corretagem paga pelo vendedor", input.brokerage, MONEY, "Deduzida do valor de alienação (IN SRF 84/2001, art. 19, § 4º).", "input");
    line("V5", "Valor de alienação líquido", f(`${V("V3")}-${V("V4")}`), MONEY, "V3 − V4.");
  }

  if (update) {
    sub(update.law === "14973" ? "Atualização de valor pela Lei 14.973/2024" : "Regime Especial de Atualização e Regularização Patrimonial (Rearp, Lei 15.265/2025)");
    line("U1", "CAA – custo de aquisição declarado", update.caa, MONEY, "Valor do titular, como declarado.", "input");
    line("U2", "DTA – diferença tributada na atualização", update.dta, MONEY,
      `Valor do titular, como declarado. Data da atualização: ${formatDate(update.date)}.`, "input");
    if (update.law === "14973") {
      line("U3", "Meses completos desde a atualização", completedMonths(update.date, input.contractDate), INT,
        `De ${formatDate(update.date)} a ${formatDate(input.contractDate)}. Informativo: define o percentual de U4.`, "info");
      line("U4", "Percentual do DTA no custo", law14973Percent(completedMonths(update.date, input.contractDate)), PCT,
        `${law14973Note()} GK = valor de alienação − [CAA + (DTA × %)].`, "fill");
    } else {
      const reversal = isRearpReversal(update, input.contractDate);
      line("U3", "Imposto pago no Rearp, corrigido pela Selic", update.taxPaidSelic, MONEY,
        "Valor digitado pelo usuário. Deduzido do imposto só quando a venda desfaz a adesão (Lei 15.265/2025, art. 7º).", "input");
      // Informative only: the reversal also sets the cost line, its date and its factors, which are
      // fixed at export, so editing this cell alone would give a wrong amount payable.
      line("U4", "Venda em até 5 anos da adesão, fora de causa mortis ou partilha (desfaz o Rearp)", reversal ? 1 : 0, FLAG,
        "Segue das datas: alienação até 5 anos da adesão, salvo causa mortis ou partilha (Lei 15.265/2025, art. 7º). Desfeito, volta o custo e a data originais " +
          "(seção 3) e deduz-se U3. Fora desse caso, vale a data da Deap ou do pagamento, a que ocorrer por último (IN RFB 2.302/2025, art. 7º, § 2º). " +
          "Não alterar aqui: a mudança de regime exige nova exportação.", "info");
    }
  }

  // ---------------------------------------------------------------- 3. custo
  section("3. CUSTO DE AQUISIÇÃO");
  header([
    [1, "Ref."], [2, "Item"], [3, "Data"], [4, "Valor original"], [5, "Índice do Anexo Único"],
    [6, "Custo (imóvel inteiro)"], [7, "Custo do titular"], [8, "Observação"],
  ], { 8: LAST_COL });
  const rows = costRows(input);
  const costRowAt: number[] = [];
  rows.forEach((cr, index) => {
    const r = row;
    costRowAt.push(r);
    put(r, 1, `K${index + 1}`, { bold: true, color: DARK, align: "center" });
    put(r, 2, cr.label, { wrap: true });
    put(r, 3, formatDate(cr.date), { align: "center" });
    const notes: string[] = [];
    const item = cr.item;
    if (cr.kind === "indexed") {
      const [y, m] = item.date.split("-").map(Number);
      inputCell(r, 4, item.original.amount, MONEY);
      inputCell(r, 5, costIndex(item.original.moeda, y, m), INDEX, true);
      formulaCell(r, 6, `${addr(r, 4)}/${addr(r, 5)}`, MONEY);
      notes.push(`Valor original em ${item.original.moeda} ÷ índice do Anexo Único da IN SRF 84/2001 para ${isoMonth(item.date)} (art. 7º).`);
    } else if (cr.kind === "manual") {
      const [y, m] = item.date.split("-").map(Number);
      const index = costIndex(item.original.moeda, y, m);
      infoCell(r, 4, item.original.amount, MONEY);
      if (index !== null) infoCell(r, 5, index, INDEX);
      inputCell(r, 6, item.value, MONEY, true);
      notes.push("Valor informado manualmente, no lugar do valor padrão (valor original ÷ índice do Anexo Único, IN SRF 84/2001, art. 7º). Valor original e índice só informativos.");
    } else if (cr.kind === "plain") {
      inputCell(r, 6, item.value, MONEY);
      if (item.date > COST_INDEX_END) notes.push("Custo a partir de 1996, sem correção (IN SRF 84/2001, art. 8º).");
    } else if (cr.kind === "caa") {
      formulaCell(r, 6, V("U1"), MONEY);
      notes.push("= U1, na data de aquisição original.");
    } else if (cr.kind === "dta") {
      formulaCell(r, 6, `${V("U2")}*${V("U4")}`, MONEY);
      notes.push("= U2 × U4, na data da atualização (IN RFB 2.222/2024, art. 12, § 1º).");
    } else if (cr.kind === "rearp") {
      formulaCell(r, 6, `${V("U1")}+${V("U2")}`, MONEY);
      notes.push("= U1 + U2, na data da adesão (IN RFB 2.302/2025, art. 7º, § 2º).");
    } else {
      inputCell(r, 6, 0, MONEY);
      notes.push("Sem itens de custo: todo o ganho usa a data de aquisição do imóvel.");
    }
    // Items are entered for the whole property; the lines of an update are already the holder's.
    const holder = condominio && cr.item ? `${addr(r, 6)}*${V("V2")}/100` : addr(r, 6);
    formulaCell(r, 7, holder, MONEY);
    if (item && !item.hasDocument) notes.push("Sem documento comprobatório informado: limitação da análise (IN SRF 84/2001, art. 17, I).");
    if (item?.isLand) notes.push("Terreno.");
    note(r, notes.join(" "), 8);
    finish(notes.join(" ").length > 80 ? 30 : undefined);
  });
  const firstCost = costRowAt[0];
  const lastCost = costRowAt[costRowAt.length - 1];
  R.KT = row;
  put(row, 1, "KT", { bold: true, color: DARK, align: "center", fill: TOTAL_FILL });
  put(row, 2, "Custo total do titular", { bold: true, fill: TOTAL_FILL });
  for (let c = 3; c <= 6; c++) ws.getCell(row, c).fill = TOTAL_FILL;
  formulaCell(row, 7, `SUM(${addr(firstCost, 7)}:${addr(lastCost, 7)})`, MONEY, true, TOTAL_FILL);
  note(row, condominio ? "Itens do imóvel inteiro × quota (V2)." : "Soma da coluna G.", 8);
  finish();
  const totalCost = abs(R.KT, 7);

  // ---------------------------------------------------------------- 4. ganho bruto
  section("4. GANHO BRUTO");
  line("G1", "Ganho bruto", f(`${V("V5")}-${totalCost}`), MONEY,
    "V5 − KT. Zero ou negativo: sem imposto e sem base negativa (Lei 7.713/1988, art. 3º, § 2º).", "total");

  // ---------------------------------------------------------------- 5. reduções
  section("5. REDUÇÕES POR ITEM (ART. 18, FR1 E FR2)");
  header([
    [1, "Ref."], [2, "Item"], [3, "Peso no custo"], [4, "Ganho rateado"], [5, "Art. 18 (%)"], [6, "Após art. 18"],
    [7, "m1"], [8, "FR1"], [9, "Após FR1"], [10, "m2"], [11, "FR2"], [12, "Ganho reduzido"], [13, "Observação"],
  ], { 13: LAST_COL });
  const reductionRowAt: number[] = [];
  rows.forEach((cr, index) => {
    const r = row;
    reductionRowAt.push(r);
    const k = costRowAt[index];
    const { art18Pct, m1, m2 } = reductionInputs(cr, result, input.contractDate);
    put(r, 1, `K${index + 1}`, { bold: true, color: DARK, align: "center" });
    put(r, 2, cr.label, { wrap: true });
    // With a zero total only the first line takes the gain, as the engine's single virtual line.
    formulaCell(r, 3, `IF(${totalCost}>0,${addr(k, 7)}/${totalCost},${index === 0 ? 1 : 0})`, PCT6);
    formulaCell(r, 4, `IF(${V("G1")}>0,${V("G1")}*${addr(r, 3)},0)`, MONEY);
    inputCell(r, 5, art18Pct, PCT, true);
    formulaCell(r, 6, `${addr(r, 4)}*(1-${addr(r, 5)})`, MONEY);
    inputCell(r, 7, m1, INT, true);
    formulaCell(r, 8, `1/(1+${V("P1")})^${addr(r, 7)}`, FACTOR);
    formulaCell(r, 9, `${addr(r, 6)}*${addr(r, 8)}`, MONEY);
    inputCell(r, 10, m2, INT, true);
    formulaCell(r, 11, `1/(1+${V("P2")})^${addr(r, 10)}`, FACTOR);
    formulaCell(r, 12, `${addr(r, 9)}*${addr(r, 11)}`, MONEY);
    const text =
      `Data do item: ${formatDate(cr.date)}. Art. 18: Lei 7.713/1988 (Q1). m1 e m2 contam o mês inicial e o final ` +
      `(Perguntão IRPF 2026, pergunta 649).${input.landRule && !update ? " Com a regra do terreno (Q6)." : ""}`;
    note(r, text, 13);
    finish(34);
  });
  R.GR = row;
  put(row, 1, "GR", { bold: true, color: DARK, align: "center", fill: TOTAL_FILL });
  put(row, 2, "Ganho após reduções", { bold: true, fill: TOTAL_FILL });
  for (let c = 3; c <= 11; c++) ws.getCell(row, c).fill = TOTAL_FILL;
  formulaCell(row, 12, `SUM(${addr(reductionRowAt[0], 12)}:${addr(reductionRowAt[reductionRowAt.length - 1], 12)})`, MONEY, true, TOTAL_FILL);
  note(row, "Soma da coluna L. Cada redução incide sobre o saldo anterior (IN SRF 599/2005, art. 3º, §§ 2º a 5º).", 13);
  finish(30);
  const reducedGain = abs(R.GR, 12);

  // ---------------------------------------------------------------- 6. isenções
  section("6. ISENÇÕES (TUDO OU NADA)");
  header([[1, "Ref."], [2, "Isenção"], [3, "Requisitos atendidos?"], [4, "Fundamento legal / motivo"]], { 4: LAST_COL });
  const { small, single } = result.exemption;
  const reasonText = (reasons: string[]) => (reasons.length > 0 ? ` Motivo: ${reasons.join(" ")}` : " Todos os requisitos atendidos.");
  line("E1", "Pequeno valor", small.applies ? 1 : 0, FLAG, `IN SRF 599/2005, art. 1º; limite P3.${reasonText(small.reasons)}`, "fill");
  line("E2", "Único imóvel", single.applies ? 1 : 0, FLAG, `Lei 9.250/1995, art. 23; IN SRF 84/2001, art. 29, I; limite P4.${reasonText(single.reasons)}`, "fill");
  line("E3", "Ganho isento", f(`IF(OR(${V("E1")}=1,${V("E2")}=1),${reducedGain},0)`), MONEY,
    "Se E1 ou E2 = Sim, todo o ganho após reduções (GR) fica isento.");

  // ---------------------------------------------------------------- 7. reinvestimento
  let taxedShare: string | null = null;
  if (input.reinvestment.enabled) {
    section("7. REINVESTIMENTO EM IMÓVEL RESIDENCIAL (LEI 11.196/2005, ART. 39)");
    const { deadline } = result.reinvestment;
    header([
      [1, "Ref."], [2, "Aplicação"], [3, "Data"], [4, "Valor aplicado"], [5, "Dentro do prazo? (1 = Sim, 0 = Não)"], [6, "Valor considerado"], [7, "Observação"],
    ], { 7: LAST_COL });
    const appRows: number[] = [];
    input.reinvestment.applications.forEach((app, index) => {
      const r = row;
      appRows.push(r);
      const inside =
        deadline !== null &&
        isValidDate(app.date) &&
        app.date >= input.contractDate &&
        app.date <= deadline &&
        Number.isFinite(app.value) &&
        app.value > 0;
      put(r, 1, `A${index + 1}`, { bold: true, color: DARK, align: "center" });
      put(r, 2, app.kind === "quitacao" ? "Quitação de financiamento" : "Aquisição de imóvel residencial", { wrap: true });
      put(r, 3, isValidDate(app.date) ? formatDate(app.date) : "sem data", { align: "center" });
      inputCell(r, 4, Number.isFinite(app.value) ? app.value : 0, MONEY);
      inputCell(r, 5, inside ? 1 : 0, FLAG, true);
      formulaCell(r, 6, `${addr(r, 4)}*${addr(r, 5)}`, MONEY);
      note(r, deadline ? `Conta a aplicação entre ${formatDate(input.contractDate)} e ${formatDate(deadline)}, inclusive.` : "Sem data inicial válida do prazo.", 7);
      finish();
    });
    // In "prazo" the brokerage is in the installments of section 9: R1 is rewritten there.
    line("R1", "Produto da venda, líquido de corretagem", f(V("V5")), MONEY,
      prazo ? "V5 − corretagem das parcelas (seção 9)." : "= V5.");
    line("R2", "Aplicado no prazo", appRows.length > 0 ? f(`SUM(${addr(appRows[0], 6)}:${addr(appRows[appRows.length - 1], 6)})`) : 0, MONEY,
      deadline ? `Soma da coluna F. Prazo: ${formatDate(deadline)}${input.reinvestment.moreThanOneSale ? ", contado do primeiro contrato" : ""}.` : "Soma da coluna F.");
    const benefit = input.residential && !input.reinvestment.usedInLast5Years && !input.reinvestment.landOrGarage;
    line("R3", "Requisitos do art. 39 atendidos", benefit ? 1 : 0, FLAG,
      "Imóvel residencial; benefício não usado nos últimos 5 anos (art. 39, § 5º); não é terreno nem vaga de garagem avulsa (IN SRF 599/2005, art. 2º, § 11, II e III).", "fill");
    line("R4", "Parte tributada", f(`IF(AND(${V("R3")}=1,${V("R1")}>0),MIN(1,MAX(0,1-${V("R2")}/${V("R1")})),1)`), PCT,
      "1 − R2 ÷ R1, entre 0 e 1, aplicada depois de FR1 e FR2 (IN SRF 599/2005, art. 2º). Sem os requisitos: 100%.");
    taxedShare = V("R4");
  }

  // ---------------------------------------------------------------- 8. base e imposto
  section("8. BASE TRIBUTÁVEL E IMPOSTO");
  line("B1", "Ganho após reduções", f(reducedGain), MONEY, "= GR.");
  line("B2", "Base tributável", f(`IF(OR(${V("E1")}=1,${V("E2")}=1),0,${V("B1")}${taxedShare ? `*${taxedShare}` : ""})`), MONEY,
    taxedShare ? "Zero com isenção (E1 ou E2); senão B1 × R4." : "Zero com isenção (E1 ou E2); senão B1.", "total");

  let tableBase = V("B2");
  let partsPaid: string | null = null;
  if (partes) {
    sub("Alienação em partes: partes anteriores");
    header([
      [1, "Ref."], [2, "Parte anterior"], [3, "Data"], [4, "Ganho tributável"], [5, "Imposto pago"],
      [6, "Soma nesta apuração? (1 = Sim, 0 = Não)"], [7, "Ganho somado"], [8, "Imposto deduzido"], [9, "Observação"],
    ], { 9: LAST_COL });
    const inWindow = summedPriorParts(input).length > 0 ? 1 : 0;
    const partRows: number[] = [];
    input.priorParts.forEach((part, index) => {
      const r = row;
      partRows.push(r);
      put(r, 1, `PA${index + 1}`, { bold: true, color: DARK, align: "center" });
      put(r, 2, `Parte ${index + 1}`);
      put(r, 3, formatDate(part.date), { align: "center" });
      inputCell(r, 4, part.gain, MONEY);
      inputCell(r, 5, part.taxPaid, MONEY);
      inputCell(r, 6, inWindow, FLAG, true);
      formulaCell(r, 7, `${addr(r, 4)}*${addr(r, 6)}`, MONEY);
      formulaCell(r, 8, `${addr(r, 5)}*${addr(r, 6)}`, MONEY);
      note(r, "Soma se esta operação ocorre até o fim do ano-calendário seguinte ao da primeira; fora desse prazo, apuração própria.", 9);
      finish(30);
    });
    const sumCol = (c: number) => (partRows.length > 0 ? `SUM(${addr(partRows[0], c)}:${addr(partRows[partRows.length - 1], c)})` : "0");
    line("B3", "Ganho somado para a tabela", f(`${V("B2")}+${sumCol(7)}`), MONEY,
      "B2 + coluna G. A tabela incide sobre o total, e deduz-se o imposto já pago (Lei 8.981/1995, art. 21, § 3º).");
    tableBase = V("B3");
    partsPaid = sumCol(8);
  }

  sub("Tabela progressiva (Lei 8.981/1995, art. 21, com a redação da Lei 13.259/2016)");
  header([
    [1, "Ref."], [2, "Faixa"], [3, "De"], [4, "Até"], [5, "Alíquota"], [6, "Ganho na faixa"], [7, "Imposto da faixa"], [8, "Observação"],
  ], { 8: LAST_COL });
  const bracketRows: number[] = [];
  TAX_BRACKETS.forEach((bracket, index) => {
    const r = row;
    bracketRows.push(r);
    const last = !Number.isFinite(bracket.upTo);
    put(r, 1, `T${index + 1}`, { bold: true, color: DARK, align: "center" });
    put(r, 2, `${index + 1}ª faixa`);
    if (index === 0) inputCell(r, 3, 0, MONEY);
    else formulaCell(r, 3, addr(bracketRows[index - 1], 4), MONEY);
    if (last) put(r, 4, "em diante", { align: "center" });
    else inputCell(r, 4, bracket.upTo, MONEY, true);
    inputCell(r, 5, bracket.rate, PCT, true);
    formulaCell(r, 6, last ? `MAX(0,${tableBase}-${addr(r, 3)})` : `MAX(0,MIN(${tableBase},${addr(r, 4)})-${addr(r, 3)})`, MONEY);
    formulaCell(r, 7, `${addr(r, 6)}*${addr(r, 5)}`, MONEY);
    note(r, index === 0 ? `Base da tabela: ${partes ? "B3" : "B2"}. Ganho na faixa = máx(0; mín(base; Até) − De).` : "", 8);
    finish();
  });
  line("B4", "Imposto pela tabela", f(`SUM(${addr(bracketRows[0], 7)}:${addr(bracketRows[bracketRows.length - 1], 7)})`), MONEY,
    "Soma do imposto das faixas.", "total");
  let owed = V("B4");
  if (partsPaid) {
    line("B5", "Imposto pago nas partes anteriores", f(partsPaid), MONEY, "Coluna H das partes anteriores.");
    line("B6", "Imposto após as partes anteriores", f(`MAX(0,${V("B4")}-${V("B5")})`), MONEY, "máx(0; B4 − B5).");
    owed = V("B6");
  }
  let deduction = "0";
  if (update?.law === "rearp") {
    line("B7", "Dedução do Rearp desfeito", f(`${V("U3")}*${V("U4")}`), MONEY, "U3 × U4 (Lei 15.265/2025, art. 7º).");
    deduction = V("B7");
  }

  // ---------------------------------------------------------------- 9. cronograma (built before B8, which sums it in "prazo")
  const payableRow = row;
  R.B8 = payableRow; // referenced by the schedule; the row itself is written after it
  row++;
  section("9. CRONOGRAMA DE PAGAMENTO");
  let scheduleTotal: string;
  if (prazo) {
    header([
      [1, "Ref."], [2, "Parcela"], [3, "Data"], [4, "Valor recebido"], [5, "Corretagem paga"], [6, "Observação"],
    ], { 6: LAST_COL });
    const instRows: number[] = [];
    input.installments.forEach((inst, index) => {
      const r = row;
      instRows.push(r);
      put(r, 1, `I${index + 1}`, { bold: true, color: DARK, align: "center" });
      put(r, 2, `Parcela ${index + 1}`);
      put(r, 3, formatDate(inst.date), { align: "center" });
      inputCell(r, 4, inst.value, MONEY);
      inputCell(r, 5, inst.brokerage, MONEY);
      note(r, "Valor do titular, como informado. Corretagem no mês em que foi paga (IN SRF 84/2001, art. 19, § 4º).", 6);
      finish();
    });
    const brokerageSum = instRows.length > 0 ? `SUM(${abs(instRows[0], 5)}:${abs(instRows[instRows.length - 1], 5)})` : "0";
    // R1 of section 7 (reinvestment) is net of the brokerage of the installments.
    if (R.R1) {
      ws.getCell(R.R1, 3).value = f(`${V("V5")}-${brokerageSum}`);
    }

    line("S1", "Ganho tributável ÷ valor de alienação do titular", f(`IF(${V("V3")}>0,${V("B2")}/${V("V3")},0)`), RATIO,
      "B2 ÷ V3: ganho da parcela = ganho total ÷ valor total × parcela (IN SRF 84/2001, art. 31; Perguntão, pergunta 668).");
    line("S2", "Imposto ÷ ganho tributável", f(`IF(${V("B2")}>0,${V("B4")}/${V("B2")},0)`), RATIO,
      "B4 ÷ B2: o imposto sai da tabela sobre o ganho total, e cada parcela paga a sua proporção.");
    line("S3", "Dedução a ratear entre os meses", f(deduction), MONEY,
      deduction === "0" ? "Sem dedução." : "= B7, rateada pelo valor recebido; a sobra de um mês passa aos seguintes e depois volta aos anteriores.");

    header([
      [1, "Ref."], [2, "Mês"], [3, "Recebido"], [4, "Corretagem"], [5, "Ganho do mês"], [6, "Imposto proporcional"],
      [7, "Dedução rateada"], [8, "Dedução pedida"], [9, "Dedução abatida"], [10, "Sobra seguinte"],
      [11, "Abatido no retorno"], [12, "Sobra no retorno"], [13, "Imposto do mês"], [14, "Vencimento"],
    ]);
    const months = [...new Set(input.installments.map((inst) => inst.date.slice(0, 7)))].sort();
    const monthRows: number[] = months.map((_, index) => row + index);
    months.forEach((month, index) => {
      const r = row;
      const of = instRows.filter((_, i) => input.installments[i].date.slice(0, 7) === month);
      put(r, 1, `M${index + 1}`, { bold: true, color: DARK, align: "center" });
      put(r, 2, isoMonth(month), { align: "center" });
      formulaCell(r, 3, of.map((ir) => addr(ir, 4)).join("+"), MONEY);
      formulaCell(r, 4, of.map((ir) => addr(ir, 5)).join("+"), MONEY);
      formulaCell(r, 5, `${V("S1")}*(${addr(r, 3)}-${addr(r, 4)})`, MONEY);
      formulaCell(r, 6, `${addr(r, 5)}*${V("S2")}`, MONEY);
      formulaCell(r, 7, `IF(${V("V3")}>0,${V("S3")}*${addr(r, 3)}/${V("V3")},0)`, MONEY);
      formulaCell(r, 8, index === 0 ? addr(r, 7) : `${addr(r, 7)}+${addr(r - 1, 10)}`, MONEY);
      formulaCell(r, 9, `MIN(${addr(r, 6)},${addr(r, 8)})`, MONEY);
      formulaCell(r, 10, `${addr(r, 8)}-${addr(r, 9)}`, MONEY);
      const isLast = index === months.length - 1;
      const carried = isLast ? addr(r, 10) : addr(r + 1, 12);
      formulaCell(r, 11, `MIN(${addr(r, 6)}-${addr(r, 9)},${carried})`, MONEY);
      formulaCell(r, 12, `${carried}-${addr(r, 11)}`, MONEY);
      formulaCell(r, 13, `${addr(r, 6)}-${addr(r, 9)}-${addr(r, 11)}`, MONEY, true);
      put(r, 14, formatDate(lastBusinessDayOfNextMonth(`${month}-01`)), { align: "center" });
      finish();
    });
    R.ST = row;
    put(row, 1, "ST", { bold: true, color: DARK, align: "center", fill: TOTAL_FILL });
    put(row, 2, "Total", { bold: true, fill: TOTAL_FILL });
    for (let c = 3; c <= LAST_COL; c++) ws.getCell(row, c).fill = TOTAL_FILL;
    const colSum = (c: number) =>
      monthRows.length > 0 ? `SUM(${addr(monthRows[0], c)}:${addr(monthRows[monthRows.length - 1], c)})` : "0";
    formulaCell(row, 3, colSum(3), MONEY, true, TOTAL_FILL);
    formulaCell(row, 5, colSum(5), MONEY, true, TOTAL_FILL);
    formulaCell(row, 13, colSum(13), MONEY, true, TOTAL_FILL);
    finish();
    merge(row, 1, LAST_COL);
    put(row, 1,
      "Ganho do mês = S1 × (recebido − corretagem). Imposto = ganho × S2, menos a dedução rateada pelo valor recebido, sem ficar negativo. " +
        "Vencimento: último dia útil do mês seguinte ao do recebimento, considerados os feriados nacionais. Juros e correção das parcelas " +
        "ficam fora do ganho, com carnê-leão ou retenção na fonte (IN SRF 84/2001, art. 19, § 3º).",
      { size: 9, italic: true, color: MUTED, wrap: true });
    ws.getRow(row).height = 30;
    row++;
    scheduleTotal = abs(R.ST, 13);
  } else {
    header([
      [1, "Ref."], [2, "Mês"], [3, "Recebido"], [4, "Ganho"], [5, "Imposto"], [6, "Vencimento"], [7, "Observação"],
    ], { 7: LAST_COL });
    const r = row;
    const month = input.contractDate.slice(0, 7);
    put(r, 1, "M1", { bold: true, color: DARK, align: "center" });
    put(r, 2, isoMonth(month), { align: "center" });
    formulaCell(r, 3, V("V3"), MONEY);
    formulaCell(r, 4, V("B2"), MONEY);
    formulaCell(r, 5, V("B8"), MONEY, true);
    put(r, 6, formatDate(lastBusinessDayOfNextMonth(`${month}-01`)), { align: "center" });
    note(r, "Uma linha no mês do contrato: o imposto a pagar (B8), até o último dia útil do mês seguinte.", 7);
    finish();
    R.ST = row;
    put(row, 1, "ST", { bold: true, color: DARK, align: "center", fill: TOTAL_FILL });
    put(row, 2, "Total do cronograma", { bold: true, fill: TOTAL_FILL });
    for (let c = 3; c <= LAST_COL; c++) ws.getCell(row, c).fill = TOTAL_FILL;
    formulaCell(row, 5, `SUM(${addr(r, 5)}:${addr(r, 5)})`, MONEY, true, TOTAL_FILL);
    finish();
    scheduleTotal = abs(R.ST, 5);
  }

  // B8, in the row kept at the end of section 8.
  {
    const end = row;
    row = payableRow;
    if (prazo) {
      line("B8", "Imposto a pagar", f(scheduleTotal), MONEY,
        "Venda a prazo: soma das linhas do cronograma (seção 9). Cada parcela informada paga a sua proporção do imposto (IN SRF 84/2001, art. 31).", "result");
    } else {
      line("B8", "Imposto a pagar", f(`MAX(0,${owed}-${deduction})`), MONEY,
        partsPaid || deduction !== "0" ? "máx(0; imposto após as partes − dedução do Rearp)." : "= B4.", "result");
    }
    row = end;
  }

  // ---------------------------------------------------------------- 10. conferência
  section("10. CONFERÊNCIA COM A FERRAMENTA");
  header([
    [1, "Ref."], [2, "Valor conferido"], [3, "Ferramenta"], [4, "Planilha"], [5, "Diferença"], [6, "Observação"],
  ], { 6: LAST_COL });
  const scheduleSum = result.schedule.reduce((sum, s) => sum + s.tax, 0);
  const checks: [string, string, number, string][] = [
    ["X1", "Ganho bruto", result.grossGain, V("G1")],
    ["X2", "Base tributável", result.taxableBase, V("B2")],
    ["X3", "Imposto pela tabela", result.taxDue, V("B4")],
    ["X4", "Imposto a pagar", result.taxPayable, V("B8")],
    ["X5", "Soma do cronograma", scheduleSum, scheduleTotal],
  ];
  const conference: ConferenceCells[] = [];
  for (const [ref, label, tool, sheet] of checks) {
    const r = row;
    put(r, 1, ref, { bold: true, color: DARK, align: "center" });
    put(r, 2, label, { bold: true });
    put(r, 3, tool, { color: BLUE, fill: TOOL_FILL, fmt: MONEY, align: "right" });
    formulaCell(r, 4, sheet, MONEY);
    formulaCell(r, 5, `ROUND(${addr(r, 4)},2)-ROUND(${addr(r, 3)},2)`, MONEY, true);
    ws.addConditionalFormatting({
      ref: addr(r, 5),
      rules: [{ type: "expression", formulae: [`${addr(r, 5)}<>0`], priority: 1, style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FFFFC7CE" } } } }],
    });
    note(r, "Ferramenta: valor fixo da exportação. Diferença = ROUND(planilha; 2) − ROUND(ferramenta; 2). Zero enquanto nada for alterado aqui.", 6);
    finish();
    conference.push({ label, tool: addr(r, 3), sheet: addr(r, 4), diff: addr(r, 5) });
  }

  // ---------------------------------------------------------------- 11. alertas
  if (result.alerts.length > 0) {
    section("11. ALERTAS E PONTOS EM ABERTO");
    header([[1, "Nível"], [3, "Alerta"], [13, "Fundamento"]], { 1: 2, 3: 12, 13: LAST_COL });
    for (const alert of result.alerts) {
      merge(row, 1, 2);
      put(row, 1, LEVEL_LABEL[alert.level] ?? alert.level, { bold: true, color: alert.level === "aberto" || alert.level === "risco" ? RED : DARK });
      merge(row, 3, 12);
      put(row, 3, alert.text, { wrap: true });
      merge(row, 13, LAST_COL);
      put(row, 13, alert.legal, { size: 9, color: MUTED, wrap: true });
      finish(alert.text.length > 140 ? 42 : 28);
    }
  }

  row++;
  merge(row, 1, LAST_COL);
  put(row, 1,
    "Apuração elaborada com base nas informações e nos documentos fornecidos. A ausência de documento representa limitação da análise e não prova de fato contrário. " +
      "Resultado de caráter consultivo, que não substitui o demonstrativo oficial da Receita Federal, a declaração nem a análise individual de cada caso.",
    { size: 8, italic: true, color: "FF7F7F7F", wrap: true });
  ws.getRow(row).height = 26;

  return conference;
}
