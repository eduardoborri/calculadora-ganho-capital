// Editable list of rows (installments, prior parts, art. 39 applications). Rows are added only by
// the "Adicionar" button and removed one by one: no blank row is kept in the input by default.

import type { ReactNode } from "react";
import { Plus, Trash2 } from "lucide-react";
import CurrencyInput from "./CurrencyInput";

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

const cellInput = "w-full min-w-0 bg-transparent border-none focus:ring-0 p-0 text-primary font-semibold text-sm";

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
        <table className="w-full border-collapse min-w-[520px]">
          <thead>
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
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td className="table-cell text-center text-text-gray py-5" colSpan={columns.length + 1}>
                  {emptyText}
                </td>
              </tr>
            )}
            {rows.map((row, index) => (
              <tr key={row.id} className="hover:bg-paper/40">
                {columns.map((column) => (
                  <td
                    key={column.header}
                    className={`table-cell ${column.align === "right" ? "text-right" : ""} ${column.yellow ? "bg-yellow-50" : ""}`}
                  >
                    {column.render(row, index)}
                  </td>
                ))}
                <td className="table-cell text-center">
                  <button
                    type="button"
                    onClick={() => onRemove(row.id)}
                    aria-label={`Excluir ${rowLabel(row, index)}`}
                    className="p-1 text-gray-500 hover:text-accent rounded-md transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          {footer && <tfoot>{footer}</tfoot>}
        </table>
      </div>
      <button type="button" onClick={onAdd} className="text-action">
        <Plus className="w-4 h-4" />
        {addLabel}
      </button>
    </div>
  );
}
