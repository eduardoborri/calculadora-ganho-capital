// Cost block: one row per cost item (IN SRF 84/2001, art. 17, I). An item paid up to 31/12/1995
// takes the original amount and currency, and its value defaults to the Anexo Único correction
// (art. 7º): the value is editable, ↺ restores the automatic one, and leaving the field without
// a change keeps it automatic.

import { Fragment } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { CostItem } from "../types";
import { correctedCost } from "../utils/capitalGain";
import { filledItems } from "../utils/costItems";
import { formatCurrency, formatPercent, round2 } from "../utils/format";
import { holderPart } from "../utils/holder";
import type { BlockProps } from "./blocks/blockProps";
import { BlockCard, CheckField } from "./blocks/fields";
import { cellInput, isUpTo1995, OriginalRow, ValueCell } from "./CostItemCells";
import LabelField from "./shared/LabelField";
import { newId } from "./shared/newId";
import Tooltip from "./shared/Tooltip";

interface CostRowProps {
  item: CostItem;
  landRule: boolean;
  onReplace: (item: CostItem) => void;
  onRemove: () => void;
}

function CostRow({ item, landRule, onReplace, onRemove }: CostRowProps) {
  const columns = landRule ? 5 : 4;
  return (
    <Fragment>
      <tr className="hover:bg-paper/40 align-top">
        <td className="table-cell">
          <div className="flex items-start">
            <LabelField
              value={item.description}
              ariaLabel="Descrição do item de custo"
              onChange={(description) => onReplace({ ...item, description })}
            />
          </div>
        </td>
        <td className="table-cell bg-yellow-50">
          <input
            type="date"
            value={item.date}
            aria-label="Data do item de custo"
            onChange={(e) => onReplace({ ...item, date: e.target.value })}
            className={cellInput}
          />
        </td>
        <td className="table-cell bg-yellow-50">
          <ValueCell item={item} onReplace={onReplace} />
        </td>
        {landRule && (
          <td className="table-cell text-center">
            <input
              type="checkbox"
              checked={Boolean(item.isLand)}
              onChange={(e) => onReplace({ ...item, isLand: e.target.checked })}
              aria-label="Item é o terreno"
              className="w-4 h-4 accent-primary"
            />
          </td>
        )}
        <td className="table-cell text-center">
          <input
            type="checkbox"
            checked={item.hasDocument}
            onChange={(e) => onReplace({ ...item, hasDocument: e.target.checked })}
            aria-label="Há documento comprobatório"
            className="w-4 h-4 accent-primary"
          />
        </td>
        <td className="table-cell text-center">
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Excluir item ${item.description || "de custo"}`}
            className="p-1 text-gray-500 hover:text-accent rounded-md transition-colors cursor-pointer"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </td>
      </tr>
      {isUpTo1995(item) && <OriginalRow item={item} onReplace={onReplace} colSpan={columns} />}
    </Fragment>
  );
}

export default function CostTable({ input, onChange }: BlockProps) {
  const replace = (next: CostItem) => onChange({ costItems: input.costItems.map((item) => (item.id === next.id ? next : item)) });
  const remove = (id: string) => onChange({ costItems: input.costItems.filter((item) => item.id !== id) });
  const add = () =>
    onChange({ costItems: [...input.costItems, { id: newId(), description: "", date: "", value: 0, hasDocument: false }] });

  const total = filledItems(input).reduce((sum, item) => sum + correctedCost(item), 0);
  const condo = input.ownership === "condominio";

  return (
    <BlockCard title="Custo de aquisição">
      {input.update && (
        <p className="text-sm text-ink border-l-[3px] border-secondary pl-3">
          Com atualização de valor, o custo vem de CAA e DTA (bloco Atualização de valor): os itens abaixo não entram no cálculo.
        </p>
      )}
      <p className="text-sm text-text-gray leading-relaxed">
        Valores do imóvel inteiro{condo ? "; a calculadora aplica a quota do titular" : ""}. Cada item tem a data do pagamento (na obra, a
        data de início) e recebe as reduções pela sua data. Custo pago a partir de 1996 não é corrigido (IN SRF 84/2001, art. 8º).
      </p>

      <CheckField
        label="Terreno com obra iniciada até o marco: a data do terreno vale para todo o ganho"
        checked={input.landRule}
        onChange={(landRule) => onChange({ landRule })}
        tooltip="Marcos: 31/12/1988 para o art. 18 (IN SRF 84/2001, art. 26, § 1º) e 31/12/1995 para os fatores FR1 e FR2 (IN SRF 599/2005, art. 3º, § 6º). Marque na tabela qual item é o terreno."
      />

      <div className="border border-rule rounded overflow-x-auto">
        <table className="w-full border-collapse min-w-[680px]">
          <thead>
            <tr>
              <th className="table-header">Item</th>
              <th className="table-header w-40">
                Data
                <Tooltip text="Data do pagamento do item. Para obra, a data de início." />
              </th>
              <th className="table-header text-right w-48">Valor (R$)</th>
              {input.landRule && <th className="table-header text-center w-20">Terreno</th>}
              <th className="table-header text-center w-24">
                Documento
                <Tooltip text="Marque se há documento comprobatório. A falta dele é limitação da análise, não prova em contrário." />
              </th>
              <th className="table-header w-10">
                <span className="sr-only">Excluir</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {input.costItems.length === 0 && (
              <tr>
                <td className="table-cell text-center text-text-gray py-5" colSpan={input.landRule ? 6 : 5}>
                  Nenhum item de custo. Sem custo, todo o ganho usa a data de aquisição do imóvel.
                </td>
              </tr>
            )}
            {input.costItems.map((item) => (
              <CostRow
                key={item.id}
                item={item}
                landRule={input.landRule}
                onReplace={replace}
                onRemove={() => remove(item.id)}
              />
            ))}
          </tbody>
          <tfoot>
            <tr className="table-total">
              <td colSpan={2}>Total do imóvel inteiro</td>
              <td className="text-right tabular-nums">{formatCurrency(round2(total))}</td>
              <td colSpan={input.landRule ? 3 : 2}></td>
            </tr>
            {condo && (
              <tr className="table-total">
                <td colSpan={2}>Parte do titular ({formatPercent(input.quotaPct / 100)})</td>
                <td className="text-right tabular-nums">{formatCurrency(round2(holderPart(input, total)))}</td>
                <td colSpan={input.landRule ? 3 : 2}></td>
              </tr>
            )}
          </tfoot>
        </table>
      </div>

      <button type="button" onClick={add} className="text-action">
        <Plus className="w-4 h-4" />
        Adicionar item de custo
      </button>
    </BlockCard>
  );
}
