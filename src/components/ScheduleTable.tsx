import type { SaleMode, ScheduleLine } from "../types";
import { formatDate, money } from "../utils/format";

interface ScheduleTableProps {
  schedule: ScheduleLine[];
  saleMode: SaleMode;
}

// "2026-03" → "03/2026".
const formatMonth = (month: string) => month.split("-").reverse().join("/");

// Payment schedule: one line per month with tax, due on the last business day of the next month.
export default function ScheduleTable({ schedule, saleMode }: ScheduleTableProps) {
  if (schedule.length === 0) return null;
  const total = (pick: (line: ScheduleLine) => number) => schedule.reduce((sum, line) => sum + pick(line), 0);

  return (
    <section className="space-y-3">
      <h2 className="section-title">Cronograma de pagamento</h2>
      <p className="text-sm text-text-gray leading-relaxed max-w-[72ch]">
        {saleMode === "prazo"
          ? "Uma linha por mês de recebimento. Ganho do mês = ganho total ÷ valor de alienação × valor recebido, menos a corretagem paga no mês (IN SRF 84/2001, art. 31)."
          : "Imposto do mês do contrato."}{" "}
        Vencimento no último dia útil do mês seguinte, considerados os feriados nacionais.
      </p>
      <div className="card">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse min-w-[560px]">
            <thead>
              <tr>
                <th className="table-header">Mês</th>
                <th className="table-header text-right">Valor recebido</th>
                <th className="table-header text-right">Ganho do mês</th>
                <th className="table-header text-right">Imposto</th>
                <th className="table-header text-right">Vencimento</th>
              </tr>
            </thead>
            <tbody>
              {schedule.map((line) => (
                <tr key={line.month}>
                  <td className="table-cell">{formatMonth(line.month)}</td>
                  <td className="table-cell text-right">{money(line.received)}</td>
                  <td className="table-cell text-right">{money(line.gain)}</td>
                  <td className={`table-cell text-right font-semibold ${line.tax > 0 ? "text-accent" : "text-primary"}`}>{money(line.tax)}</td>
                  <td className="table-cell text-right">{formatDate(line.dueDate)}</td>
                </tr>
              ))}
            </tbody>
            {schedule.length > 1 && (
              <tfoot>
                <tr className="table-total">
                  <td>Total</td>
                  <td className="text-right">{money(total((l) => l.received))}</td>
                  <td className="text-right">{money(total((l) => l.gain))}</td>
                  <td className="text-right">{money(total((l) => l.tax))}</td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </section>
  );
}
