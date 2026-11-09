import { FilePlus, FolderOpen, Trash2 } from "lucide-react";
import type { HistoryEntry } from "../utils/history";
import { formatDate, money } from "../utils/format";
import { stackBody, stackCell, stackHead, stackRow, stackTable } from "./shared/styles";

interface WelcomeScreenProps {
  entries: HistoryEntry[];
  onStart: () => void;
  onOpen: (entry: HistoryEntry) => void;
  onRemove: (id: string) => void;
  onClearAll: () => void;
  // Present while a case is open: goes back to it without losing what was typed.
  onResume?: () => void;
}

const savedAtFormat = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });

function formatSavedAt(iso: string): string {
  const date = new Date(iso);
  return iso && !Number.isNaN(date.getTime()) ? savedAtFormat.format(date) : "—";
}

function HistoryList({ entries, onOpen, onRemove, onClearAll }: Omit<WelcomeScreenProps, "onStart" | "onResume">) {
  if (entries.length === 0) {
    return <p className="text-sm text-text-gray">Nenhuma simulação salva neste computador.</p>;
  }
  return (
    <div className="space-y-3">
      <div className="border border-rule rounded overflow-x-auto">
        <table className={`w-full border-collapse min-w-[520px] ${stackTable}`}>
          <thead className={stackHead}>
            <tr>
              <th className="table-header">Salvo em</th>
              <th className="table-header text-right">Valor de alienação</th>
              <th className="table-header text-right">Data da alienação</th>
              <th className="table-header w-40">
                <span className="sr-only">Ações</span>
              </th>
            </tr>
          </thead>
          <tbody className={stackBody}>
            {entries.map((entry) => (
              <tr key={entry.id} className={`hover:bg-paper/40 ${stackRow}`}>
                <td data-label="Salvo em" className={`table-cell ${stackCell} max-sm:col-span-2`}>{formatSavedAt(entry.savedAt)}</td>
                <td data-label="Valor de alienação" className={`table-cell text-right ${stackCell}`}>{entry.input.saleValue > 0 ? money(entry.input.saleValue) : "—"}</td>
                <td data-label="Data da alienação" className={`table-cell text-right ${stackCell}`}>{entry.input.contractDate ? formatDate(entry.input.contractDate) : "—"}</td>
                <td className="table-cell max-sm:col-span-2 max-sm:p-0 max-sm:border-0">
                  <div className="flex items-center justify-end gap-3 max-sm:justify-start">
                    <button type="button" onClick={() => onOpen(entry)} className="text-action">
                      <FolderOpen className="w-4 h-4" />
                      Abrir
                    </button>
                    <button
                      type="button"
                      onClick={() => onRemove(entry.id)}
                      className="inline-flex items-center gap-1 text-sm text-text-gray hover:text-accent cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                      Excluir
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button
        type="button"
        onClick={() => {
          if (window.confirm("Excluir todas as simulações salvas neste computador? Não é possível desfazer.")) onClearAll();
        }}
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-text-gray hover:text-accent cursor-pointer"
      >
        <Trash2 className="w-4 h-4" />
        Limpar tudo
      </button>
    </div>
  );
}

// First screen: start a new case or reopen one saved on this computer.
export default function WelcomeScreen({ entries, onStart, onOpen, onRemove, onClearAll, onResume }: WelcomeScreenProps) {
  return (
    <section className="bg-white border border-rule rounded-lg px-6 py-8 md:px-12 md:py-12">
      <h2 className="text-2xl md:text-[32px] leading-tight font-semibold text-primary">Apuração do ganho de capital na venda de imóvel</h2>
      <p className="mt-3 text-base text-text-gray leading-relaxed max-w-[62ch]">
        Pessoa física residente no Brasil, imóvel no Brasil. A calculadora aplica as reduções do art. 18, FR1 e FR2, as isenções e a
        tabela progressiva, e mostra a memória de cálculo linha a linha. Os dados ficam só neste navegador.
      </p>

      <div className="mt-8 flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={onStart}
          className="inline-flex items-center gap-2 bg-primary text-white text-base font-semibold px-6 py-3 rounded hover:bg-primary/90 transition-colors cursor-pointer"
        >
          <FilePlus className="w-5 h-5" />
          Começar do zero
        </button>
        {onResume && (
          <button type="button" onClick={onResume} className="text-action">
            Voltar ao cálculo em andamento
          </button>
        )}
      </div>

      <div className="mt-10 pt-6 border-t border-rule space-y-4">
        <h3 className="text-lg font-semibold text-primary">Histórico salvo</h3>
        <p className="text-sm text-text-gray leading-relaxed max-w-[72ch]">
          As simulações salvas ficam só neste computador, no armazenamento do navegador. O nome do contribuinte não é gravado. Exclua o que
          não for mais necessário.
        </p>
        <HistoryList entries={entries} onOpen={onOpen} onRemove={onRemove} onClearAll={onClearAll} />
      </div>
    </section>
  );
}
