import { jsPDF } from "jspdf";
import { buildMemoLines, payableNote, receivedCostLine, type MemoLine } from "../components/memoLines";
import { ACQUISITION_FORM_LABEL, OPERATION_LABEL, OWNERSHIP_LABEL, SALE_MODE_LABEL } from "../data/labels";
import { ASPECTOS_GERAIS, NOTA_PERMUTA, NOTAS_METODOLOGICAS, scheduleNotePrazo } from "../data/textos";
import type { Alert, CaseInput, CaseResult, ExemptionCheck } from "../types";
import { correctedCost, usesCostIndex } from "./capitalGain";
import { filledItems } from "./costItems";
import { isValidDate, reportYear, todayInBrazil } from "./dates";
import { formatDate, formatFactor, formatPercent, money, slug } from "./format";
import { holderPart, isPermuta } from "./holder";
import { applyValueUpdate } from "./valueUpdate";

/*
 * PDF report in the GSGA-PR house style (A4 landscape), adapted from the IRPF-M calculator:
 * petróleo top band with a verde accent block, coral bar beside the title block, logo top
 * right, tinted callouts, tables with a petróleo header, verde-tint highlight rows and a
 * petróleo total row, and the "minuta" pill in the footer. Measurements are in points.
 *
 * Order: "Ganho de capital: aspectos gerais", "Notas metodológicas" (premises, alerts and open
 * points), then the calculation pages. Every amount comes from the engine result through the
 * same formatters and memo lines as the screen.
 */

type RGB = [number, number, number];
const C = {
  primary: [20, 62, 60] as RGB,
  secondary: [35, 135, 131] as RGB,
  coral: [233, 75, 65] as RGB,
  bandLine: [94, 116, 114] as RGB,
  muted: [94, 116, 114] as RGB,
  body: [74, 85, 83] as RGB,
  coralTint: [252, 228, 228] as RGB,
  tealTint: [228, 241, 240] as RGB,
  rule: [227, 232, 231] as RGB,
  headerDivider: [52, 90, 88] as RGB,
  white: [255, 255, 255] as RGB,
};

const PAGE_W = 841.92;
const PAGE_H = 595.28;
const LEFT = 59.2;
const RIGHT = 777.8;
const WIDTH = RIGHT - LEFT;
const CONTENT_TOP = 133.5;
const CONTENT_BOTTOM = 530;
const FOOTER_PILL = "MINUTA PARA DISCUSSÃO · SUJEITA A ALTERAÇÕES";
const FOOTER_TEXT =
  "Ferramenta interna do Gaia Silva Gaede Advogados - PR para apuração do ganho de capital na alienação de imóveis. Simulação de caráter consultivo, não substitui a declaração nem a análise individual de cada caso.";

// ------------------------------------------------------------------ file name
// apuracao_ganho_capital_<slug of the name>.<ext>; without a name, the date of the day
// (Brasília). Shared with the spreadsheet export.
export function reportFileName(name: string, ext: "pdf" | "xlsx"): string {
  return `apuracao_ganho_capital_${slug(name ?? "") || todayInBrazil()}.${ext}`;
}

// ------------------------------------------------------------------ assets
// A missing asset on Cloudflare Pages comes back as index.html with status 200: an HTML answer is
// a failure too, so the Helvetica fallback takes over.
export function isAssetResponse(res: { ok: boolean; headers: { get(name: string): string | null } }): boolean {
  return res.ok && !(res.headers.get("content-type") ?? "").toLowerCase().includes("text/html");
}

async function fetchBase64(path: string): Promise<string> {
  const res = await fetch(`${import.meta.env.BASE_URL}${path}`);
  if (!isAssetResponse(res)) throw new Error(`${path}: ${res.status} ${res.headers.get("content-type") ?? ""}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

interface Assets {
  font: string; // "Inter" or "helvetica" fallback
  logo: string | null;
}

// Files fetched once per session (base64). Building the PDF itself is synchronous, so once
// these are loaded the download starts inside the click handler, where the browser still
// counts it as a user action.
export interface ReportFiles {
  fonts: { regular: string; semibold: string; bold: string } | null;
  logo: string | null;
}

let filesPromise: Promise<ReportFiles> | null = null;

// Inter (SIL OFL) embedded in the PDF. Falls back to Helvetica if the files can't be loaded.
export function preloadReportFiles(): Promise<ReportFiles> {
  filesPromise ??= (async () => {
    let fonts: ReportFiles["fonts"] = null;
    try {
      const [regular, semibold, bold] = await Promise.all(
        ["fonts/Inter-400.ttf", "fonts/Inter-600.ttf", "fonts/Inter-700.ttf"].map(fetchBase64)
      );
      fonts = { regular, semibold, bold };
    } catch (err) {
      console.warn("Fonte Inter indisponível, usando Helvetica.", err);
    }
    let logo: string | null = null;
    try {
      logo = `data:image/png;base64,${await fetchBase64("brand/gsga-logo.png")}`;
    } catch (err) {
      console.warn("Logotipo indisponível.", err);
    }
    // A failed load is retried on the next export instead of being cached.
    if (!fonts || !logo) filesPromise = null;
    return { fonts, logo };
  })();
  return filesPromise;
}

function applyFiles(doc: jsPDF, files: ReportFiles): Assets {
  if (!files.fonts) return { font: "helvetica", logo: files.logo };
  doc.addFileToVFS("Inter-400.ttf", files.fonts.regular);
  doc.addFont("Inter-400.ttf", "Inter", "normal");
  doc.addFileToVFS("Inter-600.ttf", files.fonts.semibold);
  doc.addFont("Inter-600.ttf", "Inter", "semibold");
  doc.addFileToVFS("Inter-700.ttf", files.fonts.bold);
  doc.addFont("Inter-700.ttf", "Inter", "bold");
  return { font: "Inter", logo: files.logo };
}

// ------------------------------------------------------------------ layout engine
interface PageHeading {
  eyebrow: string;
  title: string;
  subtitle: string;
}

interface Column {
  label: string;
  width: number;
  align?: "left" | "right" | "center";
}

type RowKind = "normal" | "highlight" | "total";
interface Row {
  cells: string[];
  kind?: RowKind;
}

interface TableOptions {
  // Smaller type and padding, for tables with many narrow columns.
  compact?: boolean;
}

type Weight = "normal" | "semibold" | "bold";

class Report {
  doc: jsPDF;
  y = CONTENT_TOP;
  private heading: PageHeading | null = null;
  private assets: Assets;

  constructor(doc: jsPDF, assets: Assets) {
    this.doc = doc;
    this.assets = assets;
  }

  private font(weight: Weight, size: number, color: RGB) {
    const style = this.assets.font === "Inter" ? weight : weight === "normal" ? "normal" : "bold";
    this.doc.setFont(this.assets.font, style);
    this.doc.setFontSize(size);
    this.doc.setTextColor(...color);
  }

  private fill(color: RGB) {
    this.doc.setFillColor(...color);
  }

  // Helvetica fallback: glyphs outside its encoding become ASCII stand-ins.
  private clean(text: string): string {
    if (this.assets.font === "Inter") return text;
    return text.replace(/−/g, "-").replace(/÷/g, "/");
  }

  // Starts a page with the template chrome and the given heading.
  page(rawHeading: PageHeading, isFirst = false) {
    if (!isFirst) this.doc.addPage();
    const heading = {
      eyebrow: this.clean(rawHeading.eyebrow),
      title: this.clean(rawHeading.title),
      subtitle: this.clean(rawHeading.subtitle),
    };
    this.heading = heading;
    const d = this.doc;

    this.fill(C.primary);
    d.rect(0, 0, PAGE_W, 22.5, "F");
    this.fill(C.secondary);
    d.rect(705, 0, 73.5, 22.5, "F");
    this.fill(C.bandLine);
    d.rect(0, 22.5, PAGE_W, 6, "F");

    this.fill(C.coral);
    d.rect(LEFT, 59.2, 2.3, 54.8, "F");
    this.font("bold", 8, C.secondary);
    d.text(heading.eyebrow.toUpperCase(), 75.9, 67, { charSpace: 1.2 });
    this.font("bold", 19, C.primary);
    d.text(heading.title.toUpperCase(), 75.9, 94);
    this.font("normal", 9.5, C.muted);
    d.text(heading.subtitle, 75.9, 111.5);

    if (this.assets.logo) d.addImage(this.assets.logo, "PNG", 610.5, 62.25, 167.25, 33.75);

    this.y = CONTENT_TOP;
  }

  // Continuation page with the same heading (used when content overflows).
  private continuation() {
    if (!this.heading) return;
    const subtitle = this.heading.subtitle.endsWith("(continuação)") ? this.heading.subtitle : `${this.heading.subtitle} (continuação)`;
    this.page({ ...this.heading, subtitle });
  }

  private ensure(height: number) {
    if (this.y + height > CONTENT_BOTTOM) this.continuation();
  }

  callout(text: string, tone: "alert" | "neutral", title?: string) {
    const d = this.doc;
    const textWidth = WIDTH - 35;
    this.font("normal", 9.5, C.body);
    const lines = d.splitTextToSize(this.clean(text), textWidth);
    const titleHeight = title ? 15 : 0;
    const height = 12.5 + titleHeight + lines.length * 14 + 6;
    this.ensure(height + 12);

    this.fill(tone === "alert" ? C.coralTint : C.tealTint);
    d.rect(LEFT, this.y, WIDTH, height, "F");
    this.fill(tone === "alert" ? C.coral : C.secondary);
    d.rect(LEFT, this.y, 3, height, "F");

    let ty = this.y + 22.5;
    if (title) {
      this.font("bold", 9.5, tone === "alert" ? C.coral : C.primary);
      d.text(this.clean(title), 76.7, ty);
      ty += titleHeight;
    }
    this.font("normal", 9.5, C.body);
    d.text(lines, 76.7, ty, { lineHeightFactor: 14 / 9.5, align: "justify", maxWidth: textWidth });
    this.y += height + 12;
  }

  // Table whose cells wrap: each row is as tall as its longest cell.
  table(columns: Column[], rows: Row[], options: TableOptions = {}) {
    const d = this.doc;
    const size = options.compact ? 8.5 : 10;
    const pad = options.compact ? 6 : 14;
    const lineH = size * 1.3;
    const minRow = options.compact ? 24 : 30;

    const style = (kind: RowKind | "header"): { weight: Weight; size: number; color: RGB } => {
      if (kind === "header") return { weight: "semibold", size: size - 0.5, color: C.white };
      if (kind === "total") return { weight: "bold", size: size + 0.5, color: C.white };
      if (kind === "highlight") return { weight: "semibold", size, color: C.primary };
      return { weight: "normal", size, color: C.primary };
    };

    const layout = (values: string[], kind: RowKind | "header", min: number) => {
      const s = style(kind);
      this.font(s.weight, s.size, s.color);
      const wrapped = columns.map((col, i) => d.splitTextToSize(this.clean(values[i] ?? ""), col.width - 2 * pad) as string[]);
      const lines = Math.max(1, ...wrapped.map((w) => w.length));
      return { wrapped, height: Math.max(min, lines * lineH + 2 * (options.compact ? 5 : 8)) };
    };

    const draw = (wrapped: string[][], kind: RowKind | "header", top: number, height: number) => {
      let x = LEFT;
      const s = style(kind);
      columns.forEach((col, i) => {
        if ((kind === "header" || kind === "total") && i > 0) {
          this.fill(C.headerDivider);
          d.rect(x, top, 0.75, height, "F");
        }
        this.font(s.weight, s.size, s.color);
        const lines = wrapped[i];
        const first = top + (height - lines.length * lineH) / 2 + lineH * 0.72;
        const align = col.align ?? (i === 0 ? "left" : "right");
        lines.forEach((line, j) => {
          const ly = first + j * lineH;
          if (align === "left") d.text(line, x + pad, ly);
          else if (align === "center") d.text(line, x + col.width / 2, ly, { align: "center" });
          else d.text(line, x + col.width - pad, ly, { align: "right" });
        });
        x += col.width;
      });
    };

    const header = () => {
      const { wrapped, height } = layout(
        columns.map((c) => c.label),
        "header",
        options.compact ? 28 : 31.5
      );
      this.fill(C.primary);
      d.rect(LEFT, this.y, WIDTH, height, "F");
      draw(wrapped, "header", this.y, height);
      this.y += height;
    };

    this.ensure(31.5 + minRow + 1);
    header();

    for (const row of rows) {
      const kind = row.kind ?? "normal";
      const { wrapped, height } = layout(row.cells, kind, kind === "total" ? minRow + 0.7 : minRow);
      if (this.y + height > CONTENT_BOTTOM) {
        this.continuation();
        header();
      }
      if (kind === "highlight") {
        this.fill(C.tealTint);
        d.rect(LEFT, this.y, WIDTH, height, "F");
      } else if (kind === "total") {
        this.fill(C.primary);
        d.rect(LEFT, this.y, WIDTH, height, "F");
      }
      if (kind !== "total") {
        this.fill(C.rule);
        d.rect(LEFT, this.y + height - 0.75, WIDTH, 0.75, "F");
      }
      draw(wrapped, kind, this.y, height);
      this.y += height;
    }
    this.y += 10;
  }

  // Every text block below wraps with its font, then re-applies it after ensure(): a
  // continuation page draws its heading and leaves another font and colour set.
  footnote(text: string) {
    this.font("normal", 7.5, C.muted);
    const lines = this.doc.splitTextToSize(this.clean(text), WIDTH);
    this.ensure(lines.length * 10 + 4);
    this.font("normal", 7.5, C.muted);
    this.doc.text(lines, LEFT + 0.3, this.y + 6, { lineHeightFactor: 10 / 7.5, align: "justify", maxWidth: WIDTH });
    this.y += lines.length * 10 + 14;
  }

  // Justified running text (last line left-aligned).
  paragraph(text: string, width = WIDTH) {
    this.font("normal", 9.5, C.body);
    const lines = this.doc.splitTextToSize(this.clean(text), width);
    this.ensure(lines.length * 14.5 + 6);
    this.font("normal", 9.5, C.body);
    this.doc.text(lines, LEFT, this.y + 10, { lineHeightFactor: 14.5 / 9.5, align: "justify", maxWidth: width });
    this.y += lines.length * 14.5 + 8;
  }

  // A bulleted item with a hanging indent, justified.
  bullet(text: string) {
    const indent = 12;
    const width = WIDTH - indent;
    this.font("normal", 9.5, C.body);
    const lines = this.doc.splitTextToSize(this.clean(text), width);
    this.ensure(lines.length * 14.5 + 6);
    this.font("normal", 9.5, C.body);
    this.doc.text("•", LEFT, this.y + 10);
    this.doc.text(lines, LEFT + indent, this.y + 10, { lineHeightFactor: 14.5 / 9.5, align: "justify", maxWidth: width });
    this.y += lines.length * 14.5 + 6;
  }

  subheading(text: string) {
    this.ensure(60);
    this.font("bold", 10.5, C.primary);
    this.doc.text(this.clean(text), LEFT, this.y + 12);
    this.y += 22;
  }

  // Footer on every page, drawn at the end so the page count is known.
  footers() {
    const d = this.doc;
    const total = d.getNumberOfPages();
    const textLeft = 297;
    const numberWidth = 36;
    for (let i = 1; i <= total; i++) {
      d.setPage(i);
      d.setDrawColor(...C.coral);
      d.setLineWidth(0.75);
      d.roundedRect(59.6, 544.1, 225.8, 16.5, 8.25, 8.25, "S");
      this.font("bold", 7, C.coral);
      d.text(FOOTER_PILL, 172.5, 554.6, { align: "center", charSpace: 0.7 });

      this.font("normal", 6.5, C.muted);
      const lines = d.splitTextToSize(FOOTER_TEXT, RIGHT - numberWidth - textLeft) as string[];
      const lineH = 8;
      const firstBaseline = 554.6 - ((lines.length - 1) * lineH) / 2;
      d.text(lines, textLeft, firstBaseline, { lineHeightFactor: lineH / 6.5 });
      this.font("normal", 7, C.muted);
      d.text(`${i}/${total}`, RIGHT, 554.6, { align: "right" });

      this.fill(C.coral);
      d.rect(834.8, 552.8, PAGE_W - 834.8, PAGE_H - 552.8, "F");
    }
  }
}

// ------------------------------------------------------------------ labels
const LEVEL_LABEL: Record<Alert["level"], string> = {
  aberto: "Ponto em aberto",
  risco: "Risco",
  aviso: "Aviso",
  info: "Informação",
};

const yesNo = (value: boolean) => (value ? "Sim" : "Não");
const dateOrDash = (iso: string) => (isValidDate(iso) ? formatDate(iso) : "—");
// "2026-03" → "03/2026".
const formatMonth = (month: string) => month.split("-").reverse().join("/");
const withoutFinalPeriod = (text: string) => text.trim().replace(/\.$/, "");

// ------------------------------------------------------------------ cost rows
interface CostRow {
  id: string;
  description: string;
  date: string;
  origin: string;
  document: string;
  cost: number;
}

// The same lines the engine used: the holder's part of each item, or the lines of the update.
// An item up to 31/12/1995 with an original amount is either corrected by the Anexo Único or
// carries a value typed over the default, which is marked.
function costRows(input: CaseInput): CostRow[] {
  if (input.update) {
    return applyValueUpdate(input).costItems.map((line) => ({
      id: line.id,
      description: line.description,
      date: dateOrDash(line.date),
      origin: input.update?.law === "14973" ? "Lei 14.973/2024" : "Rearp (Lei 15.265/2025)",
      document: "—",
      cost: line.value,
    }));
  }
  return filledItems(input).map((item) => {
    const indexed = usesCostIndex({ ...item, manual: false });
    const description = item.description.trim() || "Item sem descrição";
    return {
      id: item.id,
      description: indexed && item.manual ? `${description} (valor informado manualmente)` : description,
      date: dateOrDash(item.date),
      origin: !indexed ? "Valor informado" : item.manual ? "Valor informado manualmente" : "Corrigido pelo Anexo Único da IN SRF 84/2001",
      document: yesNo(item.hasDocument),
      cost: holderPart(input, correctedCost(item)),
    };
  });
}

// ------------------------------------------------------------------ content
export interface PdfReportParams {
  input: CaseInput;
  result: CaseResult;
}

export interface GeneratedReport {
  blob: Blob;
  fileName: string;
  usedFallbackFont: boolean;
}

// Builds the report synchronously from the preloaded files; the caller delivers it.
// Only a case with status "ok" has a complete calculation to report.
export function buildPdfReport(params: PdfReportParams, files: ReportFiles): GeneratedReport {
  const { input, result } = params;
  if (result.status !== "ok") throw new Error("a apuração precisa estar completa e válida para gerar o PDF.");

  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const assets = applyFiles(doc, files);
  const r = new Report(doc, assets);
  const today = todayInBrazil();
  const issued = formatDate(today);
  const name = input.taxpayerName.trim();
  // Without a typed year the contract year is used (validated: status "ok").
  const year = reportYear(input.calendarYear, input.contractDate);
  const eyebrow = [name || "Ganho de capital · Imóveis", `Ano-calendário ${year}`].join(" · ");

  // 1. General aspects
  r.page(
    { eyebrow, title: "Ganho de capital: aspectos gerais", subtitle: "Regras gerais da apuração na alienação de imóveis por pessoa física residente" },
    true
  );
  ASPECTOS_GERAIS.forEach((p) => r.paragraph(p));

  // 2. Methodological notes, before the calculations
  notesPages(r, input, result, eyebrow, today);

  // 3. Calculations
  calculationPages(r, input, result, eyebrow, issued);

  r.footers();
  return {
    blob: doc.output("blob"),
    fileName: reportFileName(input.taxpayerName, "pdf"),
    usedFallbackFont: assets.font !== "Inter",
  };
}

function notesPages(r: Report, input: CaseInput, result: CaseResult, eyebrow: string, today: string) {
  r.page({ eyebrow, title: "Notas metodológicas", subtitle: "Premissas adotadas, alertas e pontos em aberto da apuração" });
  const projective = isValidDate(input.contractDate) && input.contractDate > today;
  if (projective) {
    r.callout(
      `A data do contrato (${formatDate(input.contractDate)}) é posterior à data de emissão deste relatório (${formatDate(today)}). Por isso, a apuração tem caráter projetivo: aplica aos dados informados a tabela e as regras vigentes na data de emissão, e o resultado pode variar se a legislação ou os dados se alterarem até a operação.`,
      "neutral",
      "Caráter projetivo da apuração"
    );
  }
  r.subheading("Premissas");
  NOTAS_METODOLOGICAS.forEach((n) => r.bullet(n));
  if (isPermuta(input)) r.bullet(NOTA_PERMUTA);

  r.y += 6;
  r.subheading("Alertas e pontos em aberto");
  // The projective callout above already says what the "operacao-futura" alert says.
  const alerts = projective ? result.alerts.filter((a) => a.id !== "operacao-futura") : result.alerts;
  if (alerts.length === 0) {
    r.paragraph(projective ? "Não há outros alertas para os dados informados." : "Não há alertas para os dados informados.");
    return;
  }
  alerts.forEach((alert) => {
    r.callout(
      `${withoutFinalPeriod(alert.text)}. Referência: ${withoutFinalPeriod(alert.legal)}.`,
      alert.level === "risco" ? "alert" : "neutral",
      LEVEL_LABEL[alert.level]
    );
  });
  if (alerts.some((a) => a.level === "aberto")) {
    r.footnote(
      "Ponto em aberto: tema em que a apuração adota uma interpretação sem exemplo oficial ou sem ato normativo localizado. O resultado correspondente deve ser lido com essa limitação."
    );
  }
}

const twoCols = (label: string) => [
  { label, width: WIDTH - 200 },
  { label: "Valor", width: 200 },
];

// Detail rows of a memo line, as the screen shows them when the line is opened.
function detailTable(r: Report, line: MemoLine) {
  if (line.detail.length > 0) {
    const rows: Row[] = line.detail.map((d): Row => ({ cells: [d.label, d.value ?? ""], kind: d.heading ? "highlight" : "normal" }));
    rows.push({ cells: [line.label, line.value], kind: "total" });
    r.table(twoCols("Composição"), rows);
  }
  if (line.note) r.footnote(line.note);
}

function exemptionRows(title: string, check: ExemptionCheck): Row[] {
  const status = check.applies ? "Aplicada" : "Não aplicada";
  const reasons = check.reasons.length > 0 ? check.reasons : ["—"];
  return reasons.map((reason, i): Row => ({ cells: [i === 0 ? title : "", i === 0 ? status : "", reason] }));
}

function calculationPages(r: Report, input: CaseInput, result: CaseResult, eyebrow: string, issued: string) {
  const lines = buildMemoLines(input, result);
  const byKey = new Map(lines.map((l) => [l.key, l]));
  const rows = costRows(input);
  const labelById = new Map(rows.map((c) => [c.id, c.description]));
  const permuta = isPermuta(input);

  // 3.1 Identification and the memo
  r.page({ eyebrow, title: "Apuração do ganho de capital", subtitle: `Memória de cálculo – emitido em ${issued}` });
  if (result.taxPayable > 0) {
    r.callout(
      `Com base nos dados informados, a apuração indica imposto a pagar de ${money(result.taxPayable)}, conforme a memória de cálculo abaixo.`,
      "alert"
    );
  } else {
    r.callout("Com base nos dados informados, a apuração não indica imposto a pagar, conforme a memória de cálculo abaixo.", "neutral");
  }

  const ident: Row[] = [
    { cells: ["Contribuinte", input.taxpayerName.trim() || "Não informado"] },
    { cells: ["Ano-calendário", String(reportYear(input.calendarYear, input.contractDate))] },
    { cells: ["Imóvel", input.propertyDescription.trim() || "Não informado"] },
    { cells: ["Imóvel residencial", yesNo(input.residential)] },
    { cells: ["Forma de aquisição", ACQUISITION_FORM_LABEL[input.acquisitionForm]] },
    { cells: ["Data de aquisição", dateOrDash(input.acquisitionDate)] },
    {
      cells: [
        "Titularidade",
        input.ownership === "condominio"
          ? `${OWNERSHIP_LABEL.condominio}, quota de ${formatPercent(input.quotaPct / 100)}`
          : OWNERSHIP_LABEL[input.ownership],
      ],
    },
    { cells: ["Data do contrato de alienação", dateOrDash(input.contractDate)] },
  ];
  // A sale keeps its identification as before; a permuta names the operation and its values.
  if (permuta) {
    ident.push({ cells: ["Operação", OPERATION_LABEL[input.operation]] });
    ident.push({ cells: ["Torna recebida (operação inteira)", money(input.permuta.torna)] });
    ident.push({ cells: ["Valor do imóvel recebido (operação inteira)", money(input.permuta.receivedValue)] });
  }
  ident.push({ cells: [permuta ? "Forma de recebimento da torna" : "Modalidade da venda", SALE_MODE_LABEL[input.saleMode]] });
  if (input.update) {
    ident.push({
      cells: [
        "Atualização de valor",
        `${input.update.law === "14973" ? "Lei 14.973/2024" : "Rearp (Lei 15.265/2025)"}, em ${dateOrDash(input.update.date)}`,
      ],
    });
  }
  r.subheading("Identificação");
  r.table(
    [
      { label: "Dado", width: 260 },
      { label: "Informação", width: WIDTH - 260, align: "left" },
    ],
    ident
  );

  r.subheading("Memória de cálculo");
  const memoRows: Row[] = lines.map((l): Row => ({ cells: [l.operator, l.label, l.value], kind: l.subtotal ? "highlight" : "normal" }));
  memoRows.push({ cells: ["=", "Imposto a pagar", money(result.taxPayable)], kind: "total" });
  r.table(
    [
      { label: "", width: 44, align: "center" },
      { label: "Etapa", width: WIDTH - 44 - 200, align: "left" },
      { label: "Valor", width: 200 },
    ],
    memoRows
  );
  const payable = payableNote(input, result);
  r.footnote(`Valores em R$, com duas casas decimais no valor final de cada etapa.${payable ? ` ${payable}` : ""}`);

  // 3.2 Sale value and cost
  r.page(
    permuta
      ? { eyebrow, title: "Torna e custo", subtitle: "Torna recebida, custo do imóvel dado e custo atribuído à torna" }
      : { eyebrow, title: "Valor de alienação e custo", subtitle: "Composição do valor de alienação e dos itens de custo de aquisição" }
  );
  const sale = byKey.get("venda");
  if (sale) {
    r.subheading(permuta ? "Torna recebida" : "Valor de alienação");
    detailTable(r, sale);
  }
  r.subheading(permuta ? "Custo do imóvel dado e custo atribuído à torna" : "Custo de aquisição");
  const costTable: Row[] = rows.map((c) => ({ cells: [c.description, c.date, c.origin, c.document, money(c.cost)] }));
  if (permuta) {
    // Same figures as the memo: the holder's total cost of the property given, the proportion
    // torna / (cost + torna) and the cost that goes against the torna.
    const given = rows.reduce((sum, c) => sum + c.cost, 0);
    costTable.push({ cells: ["Custo total do imóvel dado", "", "", "", money(given)], kind: "highlight" });
    costTable.push({ cells: ["Proporção = torna ÷ (custo + torna)", "", "", "", formatPercent(result.permuta?.proportion ?? 0, 4)] });
    costTable.push({ cells: ["Custo atribuído à torna", "", "", "", money(result.totalCost)], kind: "total" });
  } else {
    costTable.push({ cells: ["Custo de aquisição", "", "", "", money(result.totalCost)], kind: "total" });
  }
  r.table(
    [
      { label: "Item", width: 250 },
      { label: "Data", width: 90, align: "center" },
      { label: "Origem do valor", width: 156.6, align: "left" },
      { label: "Documento", width: 92, align: "center" },
      { label: input.ownership === "condominio" ? "Valor (parte do titular)" : "Valor", width: 130 },
    ],
    costTable
  );
  const cost = byKey.get("custo");
  const costNotes = [cost?.note ?? ""];
  if (!input.update && rows.some((c) => c.document === "Não")) {
    costNotes.push(
      "Item sem documento comprobatório informado: a falta do documento representa limitação da análise, e não prova de que o valor seja outro (IN SRF 84/2001, art. 17)."
    );
  }
  r.footnote(costNotes.filter(Boolean).join(" "));

  const received = receivedCostLine(input, result);
  if (received) {
    r.subheading(received.label);
    detailTable(r, received);
  }

  // 3.3 Reductions per cost item
  if (result.items.length > 0) {
    r.page({ eyebrow, title: "Reduções por item de custo", subtitle: "Art. 18 da Lei 7.713/1988 e fatores FR1 e FR2 do art. 40 da Lei 11.196/2005" });
    const reductionRows: Row[] = result.items.map((item) => ({
      cells: [
        labelById.get(item.itemId) ?? "Imóvel (custo zero)",
        formatPercent(item.share),
        money(item.gain),
        formatPercent(item.art18Pct),
        String(item.m1),
        formatFactor(item.fr1),
        String(item.m2),
        formatFactor(item.fr2),
        money(item.reducedGain),
      ],
    }));
    reductionRows.push({
      cells: ["Total", "", money(result.grossGain), "", "", "", "", "", money(result.gainAfterReductions)],
      kind: "total",
    });
    r.table(
      [
        { label: "Item", width: 150.6 },
        { label: "Peso no custo", width: 70 },
        { label: "Ganho rateado", width: 108 },
        { label: "Art. 18", width: 62 },
        { label: "m1", width: 40, align: "center" },
        { label: "FR1", width: 70 },
        { label: "m2", width: 40, align: "center" },
        { label: "FR2", width: 70 },
        { label: "Ganho reduzido", width: 108 },
      ],
      reductionRows,
      { compact: true }
    );
    const reductions = byKey.get("reducoes");
    r.footnote(
      `Ganho reduzido = ganho rateado × (1 − art. 18) × FR1 × FR2, com FR1 = 1 ÷ 1,0060^m1 e FR2 = 1 ÷ 1,0035^m2, fatores com seis casas. Total das reduções: ${
        reductions?.value ?? money(result.grossGain - result.gainAfterReductions)
      }. ${reductions?.note ?? ""}`.trim()
    );
  }

  // 3.4 Exemptions, reinvestment, brackets and payable tax
  r.page({ eyebrow, title: "Isenções e imposto", subtitle: "Isenções, reinvestimento, tabela progressiva e imposto a pagar" });
  if (result.items.length > 0) {
    r.subheading("Isenções");
    r.table(
      [
        { label: "Isenção", width: 230 },
        { label: "Situação", width: 110, align: "center" },
        { label: "Requisitos e motivos", width: WIDTH - 340, align: "left" },
      ],
      [
        ...exemptionRows("Pequeno valor (IN SRF 599/2005, art. 1º)", result.exemption.small),
        ...exemptionRows("Único imóvel (Lei 9.250/1995, art. 23)", result.exemption.single),
      ]
    );
    const exemptions = byKey.get("isencoes");
    if (exemptions?.note) r.footnote(exemptions.note);
  }

  const reinvestment = byKey.get("reinvestimento");
  if (reinvestment) {
    r.subheading("Reinvestimento (Lei 11.196/2005, art. 39)");
    detailTable(r, reinvestment);
  }

  r.subheading("Tabela progressiva");
  const bracketRows: Row[] = result.brackets.map((b) => ({
    cells: [
      Number.isFinite(b.to) ? `De ${money(b.from)} a ${money(b.to)}` : `Acima de ${money(b.from)}`,
      formatPercent(b.rate),
      money(b.base),
      money(b.tax),
    ],
  }));
  bracketRows.push({ cells: ["Imposto pela tabela", "", "", money(result.taxDue)], kind: "total" });
  r.table(
    [
      { label: "Faixa do ganho", width: WIDTH - 420 },
      { label: "Alíquota", width: 100 },
      { label: "Base na faixa", width: 160 },
      { label: "Imposto", width: 160 },
    ],
    bracketRows
  );
  const tax = byKey.get("imposto");
  if (tax?.note) r.footnote(tax.note);

  const prior = byKey.get("pago");
  if (prior) {
    r.subheading("Imposto já pago");
    detailTable(r, prior);
  }

  r.table(twoCols("Resultado"), [
    { cells: ["Base tributável", money(result.taxableBase)] },
    { cells: ["Imposto pela tabela", money(result.taxDue)] },
    ...(result.priorTaxPaid > 0 ? [{ cells: ["(−) Imposto já pago", money(result.priorTaxPaid)] }] : []),
    { cells: ["Imposto a pagar", money(result.taxPayable)], kind: "total" },
  ] as Row[]);
  if (payable) r.footnote(payable);
  if (received) {
    r.table(twoCols("Permuta com torna"), [{ cells: [received.label, received.value], kind: "total" }]);
  }

  // 3.5 Schedule
  if (result.schedule.length > 0) {
    r.page({ eyebrow, title: "Cronograma de pagamento", subtitle: "Imposto por mês e vencimento do Darf" });
    const total = (pick: (l: CaseResult["schedule"][number]) => number) => result.schedule.reduce((sum, l) => sum + pick(l), 0);
    const scheduleRows: Row[] = result.schedule.map((l) => ({
      cells: [formatMonth(l.month), money(l.received), money(l.gain), money(l.tax), formatDate(l.dueDate)],
    }));
    if (result.schedule.length > 1) {
      scheduleRows.push({
        cells: ["Total", money(total((l) => l.received)), money(total((l) => l.gain)), money(total((l) => l.tax)), ""],
        kind: "total",
      });
    }
    r.table(
      [
        { label: "Mês", width: WIDTH - 600 },
        { label: "Valor recebido", width: 150 },
        { label: "Ganho do mês", width: 150 },
        { label: "Imposto", width: 150 },
        { label: "Vencimento", width: 150, align: "center" },
      ],
      scheduleRows
    );
    r.footnote(
      `${
        input.saleMode === "prazo"
          ? scheduleNotePrazo(permuta)
          : "Imposto do mês do contrato."
      } Vencimento no último dia útil do mês seguinte, considerados os feriados nacionais.`
    );
  }
}
