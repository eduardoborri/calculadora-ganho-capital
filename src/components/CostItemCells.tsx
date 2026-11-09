// Cells of a cost item up to 31/12/1995: the value with its automatic default (Anexo Único
// correction, IN SRF 84/2001, art. 7º) and the line with currency and original amount.

import { RotateCcw } from "lucide-react";
import { COST_INDEX_END } from "../constants";
import { costIndex, currenciesFor, type Moeda } from "../data/custoAte1995";
import type { CostItem } from "../types";
import { correctedCost } from "../utils/capitalGain";
import { isValidDate } from "../utils/dates";
import { formatDate, round2 } from "../utils/format";
import CurrencyInput from "./shared/CurrencyInput";

// Index as printed in the Anexo Único (up to 4 decimals).
const indexFormat = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 4 });

export const cellInput = "w-full min-w-0 bg-transparent border-none focus:ring-0 p-0 text-primary font-semibold text-sm";

export const isUpTo1995 = (item: CostItem) => isValidDate(item.date) && item.date <= COST_INDEX_END;

// Currencies with an index for the item's month, plus the stored one if the date moved away from it.
function moedaOptions(item: CostItem): Moeda[] {
  const [year, month] = item.date.split("-").map(Number);
  const options = currenciesFor(year, month);
  return item.original && !options.includes(item.original.moeda) ? [...options, item.original.moeda] : options;
}

function itemIndex(item: CostItem): number | null {
  if (!item.original) return null;
  const [year, month] = item.date.split("-").map(Number);
  return costIndex(item.original.moeda, year, month);
}

// Removes the 1995 correction from an item, so it holds only a plain value again.
function withoutOriginal(item: CostItem): CostItem {
  const { original: _original, manual: _manual, ...rest } = item;
  return rest;
}

export function ValueCell({ item, onReplace }: { item: CostItem; onReplace: (item: CostItem) => void }) {
  const corrected = isUpTo1995(item) && Boolean(item.original);
  if (!corrected) {
    return (
      <CurrencyInput
        value={item.value}
        onChange={(value) => onReplace({ ...item, value })}
        ariaLabel={`Valor de ${item.description || "item de custo"}`}
        className={`${cellInput} text-right`}
      />
    );
  }
  const automatic = round2(correctedCost({ ...item, manual: false }));
  return (
    <div className="flex items-center gap-2">
      <CurrencyInput
        value={item.manual ? item.value : automatic}
        onChange={(value) => {
          // The automatic value typed back (or left untouched) keeps the item automatic.
          if (value !== automatic) onReplace({ ...item, value, manual: true });
          else if (item.manual) onReplace({ ...item, manual: false });
        }}
        ariaLabel={`Valor corrigido até 31/12/1995 de ${item.description || "item de custo"}`}
        className={`${cellInput} text-right`}
      />
      {item.manual ? (
        <button
          type="button"
          onClick={() => onReplace({ ...item, manual: false })}
          title="Valor informado manualmente. Clique para voltar à correção pelo Anexo Único."
          aria-label="Voltar ao valor corrigido pelo Anexo Único"
          className="p-0.5 rounded text-secondary hover:bg-paper cursor-pointer shrink-0"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      ) : (
        <span className="text-[10px] font-semibold text-gray-500 shrink-0" title="Valor original ÷ índice do Anexo Único">
          auto
        </span>
      )}
    </div>
  );
}

// Second line of an item up to 31/12/1995: currency, original amount and the index used.
export function OriginalRow({ item, onReplace, colSpan }: { item: CostItem; onReplace: (item: CostItem) => void; colSpan: number }) {
  const options = moedaOptions(item);
  const index = itemIndex(item);
  const setMoeda = (moeda: string) =>
    onReplace(moeda ? { ...item, original: { amount: item.original?.amount ?? 0, moeda: moeda as Moeda } } : withoutOriginal(item));
  const setAmount = (amount: number) => {
    if (amount === 0) {
      if (item.original) onReplace(withoutOriginal(item));
      return;
    }
    onReplace({ ...item, original: { amount, moeda: item.original?.moeda ?? options[0] } });
  };

  return (
    <tr className="bg-paper/40">
      <td></td>
      <td className="px-4 pb-3 pt-1 text-xs text-text-gray" colSpan={colSpan}>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="font-semibold text-primary">Custo até {formatDate(COST_INDEX_END)}:</span>
          {options.length === 0 ? (
            <span>O Anexo Único não traz índice para este mês: informe o valor já em reais de 31/12/1995.</span>
          ) : (
            <>
              <label className="flex items-center gap-2">
                Moeda
                <select
                  value={item.original?.moeda ?? ""}
                  onChange={(e) => setMoeda(e.target.value)}
                  className="text-xs px-2 py-1 border border-yellow-200 rounded bg-yellow-50 text-primary font-semibold"
                >
                  <option value="">Sem valor original</option>
                  {options.map((moeda) => (
                    <option key={moeda} value={moeda}>
                      {moeda}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2">
                Valor original
                <span className="w-36 px-2 py-1 bg-yellow-50 border border-yellow-200 rounded">
                  <CurrencyInput
                    value={item.original?.amount ?? 0}
                    onChange={setAmount}
                    ariaLabel="Valor original na moeda da época"
                    className={`${cellInput} text-right`}
                  />
                </span>
              </label>
              {item.original && (
                <span>
                  {index === null
                    ? `Sem índice em ${item.original.moeda} para este mês.`
                    : `÷ índice ${indexFormat.format(index)} (IN SRF 84/2001, art. 7º)`}
                </span>
              )}
              {!item.original && <span>Sem valor original, o valor da linha é tomado como já em reais de 31/12/1995.</span>}
            </>
          )}
        </div>
      </td>
    </tr>
  );
}
