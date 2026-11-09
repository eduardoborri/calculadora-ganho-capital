import { useCallback, useMemo, useState } from "react";
import { ArrowLeft, Save, X } from "lucide-react";
import type { CaseInput } from "../types";
import { calculateCase, defaultCaseInput } from "../utils/capitalGain";
import { clearHistory, loadHistory, removeEntry, saveEntry, type HistoryEntry } from "../utils/history";
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

  const onChange = useCallback((patch: Partial<CaseInput>) => setInput((prev) => ({ ...prev, ...patch })), []);

  const openCase = (next: CaseInput) => {
    setInput(next);
    setSession((s) => s + 1);
    setStarted(true);
    setCaseOpen(true);
    setNotice(null);
  };

  const goHome = () => {
    setEntries(loadHistory());
    setStarted(false);
    setNotice(null);
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

  return (
    <div className="max-w-[1240px] mx-auto px-4 md:px-8 py-8 space-y-8">
      <header className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
        <div>
          <img
            src={`${import.meta.env.BASE_URL}brand/gsga-logo.png`}
            alt="Gaia Silva Gaede Advogados"
            width={640}
            height={130}
            className="h-9 w-auto mb-5"
          />
          <h1 className="text-[32px] leading-tight font-semibold text-primary">Calculadora de Ganho de Capital</h1>
          <p className="text-text-gray mt-1">GSGA-PR, alienação de imóvel por pessoa física residente</p>
        </div>
        {started && (
          <div className="flex flex-wrap items-center gap-3">
            {/* Slot for the PDF and Excel exports (Tasks 9 and 10). */}
            <button type="button" onClick={goHome} className="btn-outline">
              <ArrowLeft className="w-4 h-4" />
              Início
            </button>
            <button type="button" onClick={save} className="btn-filled">
              <Save className="w-4 h-4" />
              Salvar no histórico
            </button>
          </div>
        )}
      </header>

      {notice && (
        <div
          role="status"
          className={`bg-white border border-rule border-l-[3px] rounded px-4 py-2.5 text-sm flex items-start gap-3 ${
            notice.kind === "error" ? "border-l-accent" : "border-l-secondary"
          }`}
        >
          <p className={`flex-1 ${notice.kind === "error" ? "text-accent" : "text-ink"}`}>{notice.text}</p>
          <button type="button" onClick={() => setNotice(null)} aria-label="Fechar aviso" className="text-text-gray hover:text-ink cursor-pointer">
            <X className="w-4 h-4" />
          </button>
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
            <div className="xl:sticky xl:top-6 xl:max-h-[calc(100vh-3rem)] xl:overflow-y-auto rounded-lg">
              <CalculationMemo key={session} input={input} result={result} />
            </div>
          </div>

          {ok && <ScheduleTable schedule={result.schedule} saleMode={input.saleMode} />}
          {ok && <AlertList alerts={result.alerts} />}
        </div>
      )}
    </div>
  );
}
