import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Download, FileSpreadsheet, Save, X } from "lucide-react";
import type { CaseInput, CaseStatus } from "../types";
import { calculateCase, defaultCaseInput } from "../utils/capitalGain";
import { clearHistory, loadHistory, removeEntry, saveEntry, type HistoryEntry } from "../utils/history";
import { buildPdfReport, preloadReportFiles, type ReportFiles } from "../utils/pdfReport";
import { generateXlsxReport, preloadExcel } from "../utils/xlsxReport";
import AlertList from "./AlertList";
import CalculationMemo from "./CalculationMemo";
import CostTable from "./CostTable";
import ScheduleTable from "./ScheduleTable";
import WelcomeScreen from "./WelcomeScreen";
import ExemptionsBlock from "./blocks/ExemptionsBlock";
import IdentificationBlock from "./blocks/IdentificationBlock";
import PropertyBlock from "./blocks/PropertyBlock";
import ReinvestmentBlock from "./blocks/ReinvestmentBlock";
import SaleBlock from "./blocks/SaleBlock";
import ValueUpdateBlock from "./blocks/ValueUpdateBlock";

type Notice = { kind: "ok" | "error"; text: string };

type ReportKind = "pdf" | "xlsx";

// One status for both exports: only one report is generated at a time.
type PdfStatus =
  | { state: "idle" }
  | { state: "generating"; kind: ReportKind }
  | { state: "done"; kind: ReportKind; url: string; fileName: string; usedFallbackFont: boolean }
  | { state: "error"; kind: ReportKind; message: string };

const REPORT_NAME: Record<ReportKind, string> = { pdf: "o relatório em PDF", xlsx: "a planilha" };

// Why the export buttons are off: only a complete, valid case in scope has a report.
const PDF_BLOCKED_REASON: Record<Exclude<CaseStatus, "ok">, string> = {
  incompleto: "Preencha os dados pendentes para gerar o PDF e a planilha.",
  invalido: "Corrija os dados indicados na memória para gerar o PDF e a planilha.",
  fora_de_escopo: "Caso fora do escopo da ferramenta: sem PDF e sem planilha.",
};

function triggerDownload(url: string, fileName: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// Single CaseInput state for the whole screen; the result is recomputed on every change.
export default function Calculator() {
  const [input, setInput] = useState<CaseInput>(defaultCaseInput);
  const result = useMemo(() => calculateCase(input), [input]);
  const [started, setStarted] = useState(false);
  const [caseOpen, setCaseOpen] = useState(false);
  // Bumped on every new or reopened case, so the blocks remount with their own initial state.
  const [session, setSession] = useState(0);
  const [entries, setEntries] = useState<HistoryEntry[]>(() => loadHistory());
  const [notice, setNotice] = useState<Notice | null>(null);
  const [pdfStatus, setPdfStatus] = useState<PdfStatus>({ state: "idle" });

  // Fonts and logo are fetched ahead of time, so the click builds the PDF and starts the
  // download in the same event. A download started after an await may be dropped by the
  // browser as not user-initiated.
  const reportFiles = useRef<ReportFiles | null>(null);
  // Object URL of the last report, revoked when replaced, cleared or on unmount.
  const pdfUrl = useRef<string | null>(null);
  // Bumped on every export and whenever the case is left: a late async result is ignored.
  const pdfRequest = useRef(0);
  useEffect(() => {
    preloadReportFiles().then((files) => (reportFiles.current = files));
    preloadExcel().catch(() => {}); // retried on click
    return () => {
      pdfRequest.current += 1;
      if (pdfUrl.current) URL.revokeObjectURL(pdfUrl.current);
      pdfUrl.current = null;
    };
  }, []);

  const releasePdfUrl = () => {
    if (pdfUrl.current) URL.revokeObjectURL(pdfUrl.current);
    pdfUrl.current = null;
  };

  const clearPdfStatus = () => {
    pdfRequest.current += 1;
    releasePdfUrl();
    setPdfStatus({ state: "idle" });
  };

  const onChange = useCallback((patch: Partial<CaseInput>) => setInput((prev) => ({ ...prev, ...patch })), []);

  const openCase = (next: CaseInput) => {
    setInput(next);
    setSession((s) => s + 1);
    setStarted(true);
    setCaseOpen(true);
    setNotice(null);
    clearPdfStatus();
  };

  const goHome = () => {
    setEntries(loadHistory());
    setStarted(false);
    setNotice(null);
    clearPdfStatus();
  };

  const exportPdf = () => {
    if (result.status !== "ok" || pdfStatus.state === "generating") return;
    releasePdfUrl();
    const request = ++pdfRequest.current;
    // The case at the moment of the click, even if the screen changes while files load.
    const params = { input, result };
    const finish = (files: ReportFiles) => {
      if (request !== pdfRequest.current) return; // the case was left or reopened meanwhile
      reportFiles.current = files;
      const { blob, fileName, usedFallbackFont } = buildPdfReport(params, files);
      const url = URL.createObjectURL(blob);
      pdfUrl.current = url;
      setPdfStatus({ state: "done", kind: "pdf", url, fileName, usedFallbackFont });
      triggerDownload(url, fileName);
    };
    const fail = (err: unknown) => {
      if (request !== pdfRequest.current) return;
      console.error(err);
      setPdfStatus({ state: "error", kind: "pdf", message: err instanceof Error ? err.message : String(err) });
    };

    // With the fonts cached, build now even without the logo: the report goes out without it
    // instead of waiting on a retry at every click.
    const files = reportFiles.current;
    if (files?.fonts) {
      try {
        finish(files);
      } catch (err) {
        fail(err);
      }
      return;
    }
    setPdfStatus({ state: "generating", kind: "pdf" });
    preloadReportFiles()
      .then(finish)
      .catch(fail);
  };

  // Workbook with the whole calculation in Excel formulas. exceljs is preloaded on mount.
  const exportXlsx = () => {
    if (result.status !== "ok" || pdfStatus.state === "generating") return;
    releasePdfUrl();
    const request = ++pdfRequest.current;
    setPdfStatus({ state: "generating", kind: "xlsx" });
    generateXlsxReport({ input, result })
      .then(({ blob, fileName }) => {
        if (request !== pdfRequest.current) return; // the case was left or reopened meanwhile
        const url = URL.createObjectURL(blob);
        pdfUrl.current = url;
        setPdfStatus({ state: "done", kind: "xlsx", url, fileName, usedFallbackFont: false });
        triggerDownload(url, fileName);
      })
      .catch((err: unknown) => {
        if (request !== pdfRequest.current) return;
        console.error(err);
        setPdfStatus({ state: "error", kind: "xlsx", message: err instanceof Error ? err.message : String(err) });
      });
  };

  const save = () => {
    if (saveEntry(input)) {
      setEntries(loadHistory());
      setNotice({ kind: "ok", text: "Simulação salva no histórico deste computador, sem o nome do contribuinte." });
    } else {
      setNotice({
        kind: "error",
        text: "Não foi possível salvar no histórico: o armazenamento do navegador está bloqueado ou cheio. A simulação continua aberta na tela.",
      });
    }
  };

  const remove = (id: string) => {
    removeEntry(id);
    setEntries(loadHistory());
  };

  const clearAll = () => {
    clearHistory();
    setEntries(loadHistory());
  };

  const ok = result.status === "ok";
  const pdfBlockedReason = result.status === "ok" ? null : PDF_BLOCKED_REASON[result.status];

  return (
    <div className="max-w-[1240px] mx-auto px-4 md:px-8 py-8 max-sm:py-5 space-y-8 min-w-0">
      <header className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 min-w-0 pb-6 border-b border-rule">
        <div className="min-w-0">
          <img
            src={`${import.meta.env.BASE_URL}brand/gsga-logo.png`}
            alt="Gaia Silva Gaede Advogados"
            width={640}
            height={130}
            className="h-8 w-auto mb-6 max-sm:mb-4"
          />
          <h1 className="text-[28px] max-sm:text-[24px] leading-tight font-semibold tracking-[-0.01em] text-primary">
            Calculadora de Ganho de Capital
          </h1>
          <p className="text-text-gray mt-1.5 text-[15px]">Alienação de imóvel por pessoa física residente no Brasil · GSGA-PR</p>
        </div>
        {started && (
          <div className="flex flex-wrap items-center gap-3 max-sm:grid max-sm:grid-cols-2 min-w-0">
            {pdfBlockedReason && (
              <span id="pdf-blocked-reason" className="text-xs text-text-gray basis-full lg:basis-auto max-sm:col-span-2">
                {pdfBlockedReason}
              </span>
            )}
            <button
              type="button"
              onClick={exportPdf}
              disabled={!ok || pdfStatus.state === "generating"}
              title={pdfBlockedReason ?? "Relatório em PDF com aspectos gerais, notas metodológicas e a memória de cálculo"}
              aria-describedby={pdfBlockedReason ? "pdf-blocked-reason" : undefined}
              className="btn-outline max-sm:justify-center max-sm:text-center"
            >
              <Download className="w-4 h-4" />
              Exportar PDF
            </button>
            <button
              type="button"
              onClick={exportXlsx}
              disabled={!ok || pdfStatus.state === "generating"}
              title={pdfBlockedReason ?? "Planilha Excel com a memória de cálculo completa, em fórmulas, e a conferência com a ferramenta"}
              aria-describedby={pdfBlockedReason ? "pdf-blocked-reason" : undefined}
              className="btn-outline max-sm:justify-center max-sm:text-center"
            >
              <FileSpreadsheet className="w-4 h-4" />
              Exportar planilha
            </button>
            <button type="button" onClick={goHome} className="btn-outline max-sm:justify-center max-sm:text-center">
              <ArrowLeft className="w-4 h-4" />
              Início
            </button>
            <button type="button" onClick={save} className="btn-filled max-sm:justify-center max-sm:text-center">
              <Save className="w-4 h-4" />
              Salvar no histórico
            </button>
          </div>
        )}
      </header>

      {notice && (
        <div
          role="status"
          className={`notice ${notice.kind === "error" ? "notice-error" : "notice-ok"}`}
        >
          <p className="flex-1 min-w-0 [overflow-wrap:anywhere]">{notice.text}</p>
          <button type="button" onClick={() => setNotice(null)} aria-label="Fechar aviso" className="text-text-gray hover:text-ink cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {started && pdfStatus.state !== "idle" && (
        <div
          role="status"
          className={`notice ${pdfStatus.state === "error" ? "notice-error" : "notice-ok"}`}
        >
          <p className="flex-1 min-w-0 [overflow-wrap:anywhere]">
            {pdfStatus.state === "generating" && `Gerando ${REPORT_NAME[pdfStatus.kind]}…`}
            {pdfStatus.state === "done" && (
              <>
                {pdfStatus.kind === "pdf" ? "Relatório gerado" : "Planilha gerada"}: {pdfStatus.fileName}.{" "}
                {pdfStatus.usedFallbackFont && "A fonte Inter não carregou; o PDF saiu em Helvetica. "}
                Se o download não começou,{" "}
                <a href={pdfStatus.url} download={pdfStatus.fileName} className="text-action underline">
                  baixe novamente
                </a>
                {pdfStatus.kind === "pdf" && (
                  <>
                    {" "}
                    ou{" "}
                    <a href={pdfStatus.url} target="_blank" rel="noreferrer" className="text-action underline">
                      abra em nova aba
                    </a>
                  </>
                )}
                .
              </>
            )}
            {pdfStatus.state === "error" && `Não foi possível gerar ${REPORT_NAME[pdfStatus.kind]}: ${pdfStatus.message}`}
          </p>
          {pdfStatus.state !== "generating" && (
            <button type="button" onClick={clearPdfStatus} aria-label="Fechar aviso" className="text-text-gray hover:text-ink cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      {!started && (
        <WelcomeScreen
          entries={entries}
          onStart={() => openCase(defaultCaseInput())}
          onOpen={(entry) => openCase(entry.input)}
          onRemove={remove}
          onClearAll={clearAll}
          onResume={caseOpen ? () => setStarted(true) : undefined}
        />
      )}

      {started && (
        <div className="space-y-12 pb-16">
          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_380px] gap-10 items-start">
            <div key={session} className="space-y-12 min-w-0">
              <IdentificationBlock input={input} onChange={onChange} />
              <PropertyBlock input={input} onChange={onChange} />
              <CostTable input={input} onChange={onChange} />
              <SaleBlock input={input} onChange={onChange} />
              <ExemptionsBlock input={input} onChange={onChange} result={result} />
              <ReinvestmentBlock input={input} onChange={onChange} result={result} />
              <ValueUpdateBlock input={input} onChange={onChange} />
            </div>
            <div className="min-w-0 xl:sticky xl:top-6 xl:max-h-[calc(100vh-3rem)] xl:overflow-y-auto rounded-lg">
              <CalculationMemo key={session} input={input} result={result} />
            </div>
          </div>

          {ok && <ScheduleTable schedule={result.schedule} saleMode={input.saleMode} permuta={input.operation === "permuta"} />}
          {ok && <AlertList alerts={result.alerts} />}
        </div>
      )}
    </div>
  );
}
