// Editable list of rows (installments, prior parts, art. 39 applications). Rows are added only by
// the "Adicionar" button and removed one by one: no blank row is kept in the input by default.

import type { ReactNode } from "react";
import { Plus, Trash2 } from "lucide-react";
import CurrencyInput from "./CurrencyInput";
import { cellInput, stackBody, stackCell, stackCellYellow, stackFoot, stackHead, stackRow, stackTable } from "./styles";

export interface RowColumn<T> {
  header: string;
  render: (row: T, index: number) => ReactNode;
  align?: "right";
  // A column the user fills: pale yellow, as in the reference calculator.
  yellow?: boolean;
  width?: string;
}

interface RowTableProps<T extends { id: string }> {
  rows: T[];
  columns: RowColumn<T>[];
  addLabel: string;
  emptyText: string;
  onAdd: () => void;
  onRemove: (id: string) => void;
  rowLabel: (row: T, index: number) => string;
  // Total row, rendered as the table footer.
  footer?: ReactNode;
}

export function CellMoney({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  return <CurrencyInput value={value} onChange={onChange} ariaLabel={label} className={`${cellInput} text-right`} />;
}

export function CellDate({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return <input type="date" value={value} aria-label={label} onChange={(e) => onChange(e.target.value)} className={cellInput} />;
}

export default function RowTable<T extends { id: string }>({
  rows,
  columns,
  addLabel,
  emptyText,
  onAdd,
  onRemove,
  rowLabel,
  footer,
}: RowTableProps<T>) {
  return (
    <div className="space-y-2">
      <div className="border border-rule rounded overflow-x-auto">
        <table className={`w-full border-collapse min-w-[520px] ${stackTable}`}>
          <thead className={stackHead}>
            <tr>
              {columns.map((column) => (
                <th
                  key={column.header}
                  className={`table-header ${column.align === "right" ? "text-right" : ""} ${column.width ?? ""}`}
                >
                  {column.header}
                </th>
              ))}
              <th className="table-header w-10">
                <span className="sr-only">Excluir</span>
              </th>
            </tr>
          </thead>
          <tbody className={stackBody}>
            {rows.length === 0 && (
              <tr className="max-sm:block">
                <td className="table-cell text-center text-text-gray py-5 max-sm:block" colSpan={columns.length + 1}>
                  {emptyText}
                </td>
              </tr>
            )}
            {rows.map((row, index) => (
              <tr key={row.id} className={`hover:bg-paper/40 ${stackRow}`}>
                {columns.map((column, columnIndex) => (
                  <td
                    key={column.header}
                    data-label={column.header}
                    className={`table-cell ${column.align === "right" ? "text-right" : ""} ${column.yellow ? `bg-field ${stackCellYellow}` : stackCell} ${columnIndex === 0 ? "max-sm:col-span-2" : ""}`}
                  >
                    {column.render(row, index)}
                  </td>
                ))}
                <td className="table-cell text-center max-sm:col-span-2 max-sm:p-0 max-sm:border-0 max-sm:text-right">
                  <button
                    type="button"
                    onClick={() => onRemove(row.id)}
                    aria-label={`Excluir ${rowLabel(row, index)}`}
                    className="p-1 text-text-gray hover:text-accent-ink rounded-md transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          {footer && <tfoot className={stackFoot}>{footer}</tfoot>}
        </table>
      </div>
      <button type="button" onClick={onAdd} className="text-action">
        <Plus className="w-4 h-4" />
        {addLabel}
      </button>
    </div>
  );
}
