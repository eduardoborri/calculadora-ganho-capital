import { useState } from "react";
import type { CaseInput, CaseResult } from "../types";
import { money } from "../utils/format";
import { buildMemoLines, payableNote, type MemoLine } from "./memoLines";
import OutOfScopeNotice from "./OutOfScopeNotice";

interface CalculationMemoProps {
  input: CaseInput;
  result: CaseResult;
}

function Line({ line, open, onToggle }: { line: MemoLine; open: boolean; onToggle: () => void }) {
  const expandable = line.detail.length > 0 || Boolean(line.note);
  return (
    <li className={line.subtotal ? "border-t border-white/20 pt-1" : ""}>
      <button
        type="button"
        onClick={onToggle}
        disabled={!expandable}
        aria-expanded={expandable ? open : undefined}
        className="w-full grid grid-cols-[1.5rem_1fr_auto] items-baseline gap-2 py-1.5 text-left rounded enabled:hover:bg-white/5 enabled:cursor-pointer"
      >
        <span className="text-xl font-light text-white/60 text-center" aria-hidden="true">
          {line.operator}
        </span>
        <span className={`text-sm text-white/85 ${expandable ? "underline decoration-white/25 underline-offset-4" : ""}`}>{line.label}</span>
        <span className="text-base font-semibold tabular-nums whitespace-nowrap">{line.value}</span>
      </button>
      {open && (
        <div className="ml-8 mb-2 mt-1 space-y-1 text-xs text-white/75 font-normal">
          {line.detail.map((d, index) => (
            <div
              key={`${d.label}-${index}`}
              className={`flex justify-between gap-3 ${d.heading ? "pt-1.5 font-semibold text-white/90" : ""}`}
            >
              <span className="leading-snug">{d.label}</span>
              {d.value && <span className="tabular-nums whitespace-nowrap">{d.value}</span>}
            </div>
          ))}
          {line.note && <p className="text-white/60 leading-relaxed pt-0.5">{line.note}</p>}
        </div>
      )}
    </li>
  );
}

// Incomplete or invalid case: what to fill or fix, in place of the values.
function Pending({ result }: { result: CaseResult }) {
  const invalid = result.status === "invalido";
  return (
    <div className="space-y-3">
      <p className="text-sm text-white/85">{invalid ? "Corrija os dados abaixo para calcular:" : "Para calcular, preencha:"}</p>
      <ul className="space-y-1.5 text-sm list-disc pl-5 leading-snug">
        {result.missing.map((message, index) => (
          <li key={index}>{message}</li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The calculation memo: the whole apuração as one running calculation, with the operators in
 * their own column, from the sale value to the tax payable. Each line opens to show what it is
 * made of and the rule behind it.
 */
export default function CalculationMemo({ input, result }: CalculationMemoProps) {
  const [open, setOpen] = useState<string | null>(null);

  if (result.status === "fora_de_escopo") return <OutOfScopeNotice reasons={result.missing} />;

  const ok = result.status === "ok";
  const lines = ok ? buildMemoLines(input, result) : [];
  const note = ok ? payableNote(input, result) : null;

  return (
    <aside className="bg-primary text-white rounded-lg p-6 space-y-5" aria-label="Memória de cálculo">
      <h2 className="text-[21px] font-semibold leading-tight">Memória de cálculo</h2>

      {!ok && <Pending result={result} />}

      {ok && (
        <>
          <ol className="space-y-1">
            {lines.map((line) => (
              <Line
                key={line.key}
                line={line}
                open={open === line.key}
                onToggle={() => setOpen(open === line.key ? null : line.key)}
              />
            ))}
          </ol>

          <div className="border-t-[3px] border-double border-white/30 pt-4 grid grid-cols-[1.5rem_1fr] gap-2 items-baseline">
            <span className="text-2xl font-light text-white/60 text-center" aria-hidden="true">
              =
            </span>
            <div>
              <p className="text-sm text-white/85">Imposto a pagar</p>
              <p className="mt-1 text-[32px] leading-none font-semibold tabular-nums">{money(result.taxPayable)}</p>
              {note && <p className="text-xs text-white/70 mt-2 leading-relaxed">{note}</p>}
            </div>
          </div>
        </>
      )}

      <details className="text-xs text-white/70">
        <summary className="cursor-pointer text-white/85 font-semibold list-none">Premissas aplicadas</summary>
        <ul className="mt-2 space-y-1.5 leading-relaxed list-disc pl-4 font-normal">
          <li>Precisão total nas contas; duas casas só nos valores exibidos e seis nos fatores.</li>
          <li>Reduções por item de custo, conforme a data de cada item (IN SRF 599/2005, art. 3º, § 4º).</li>
          <li>Isenções de tudo ou nada antes da tabela; reinvestimento depois de FR1 e FR2.</li>
          <li>Tabela progressiva de 15% a 22,5% (Lei 8.981/1995, art. 21).</li>
          <li>Resultado consultivo: não substitui o demonstrativo oficial da Receita.</li>
        </ul>
      </details>
    </aside>
  );
}
