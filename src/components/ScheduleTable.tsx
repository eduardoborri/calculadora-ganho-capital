import { SCHEDULE_NOTE_COMUNHAO, scheduleNotePrazo } from "../data/textos";
import type { SaleMode, ScheduleLine } from "../types";
import { formatDate, money } from "../utils/format";
import { stackBody, stackCell, stackFoot, stackHead, stackRow, stackTable, stackTotalCell, stackTotalRow } from "./shared/styles";

interface ScheduleTableProps {
  schedule: ScheduleLine[];
  saleMode: SaleMode;
  permuta?: boolean;
  // Marital community: an extra column with each spouse's Darf, half the tax.
  comunhao?: boolean;
}

// "2026-03" → "03/2026".
const formatMonth = (month: string) => month.split("-").reverse().join("/");

// Payment schedule: one line per month with tax, due on the last business day of the next month.
export default function ScheduleTable({ schedule, saleMode, permuta = false, comunhao = false }: ScheduleTableProps) {
  if (schedule.length === 0) return null;
  const total = (pick: (line: ScheduleLine) => number) => schedule.reduce((sum, line) => sum + pick(line), 0);

  return (
    <section className="space-y-3">
      <h2 className="section-title">Cronograma de pagamento</h2>
      <p className="text-sm text-text-gray leading-relaxed max-w-[72ch]">
        {saleMode === "prazo"
          ? scheduleNotePrazo(permuta)
          : "Imposto do mês da alienação."}{" "}
        Vencimento no último dia útil do mês seguinte, considerados os feriados nacionais e o dia 31/12, sem expediente bancário.{comunhao ? ` ${SCHEDULE_NOTE_COMUNHAO}` : ""}
      </p>
      <div className="card">
        <div className="overflow-x-auto">
          <table className={`w-full border-collapse min-w-[560px] ${stackTable}`}>
            <thead className={stackHead}>
              <tr>
                <th className="table-header">Mês</th>
                <th className="table-header text-right">Valor recebido</th>
                <th className="table-header text-right">Ganho do mês</th>
                <th className="table-header text-right">Imposto</th>
                {comunhao && <th className="table-header text-right">Por cônjuge (50%)</th>}
                <th className="table-header text-right">Vencimento</th>
              </tr>
            </thead>
            <tbody className={stackBody}>
              {schedule.map((line) => (
                <tr key={line.month} className={stackRow}>
                  <td data-label="Mês" className={`table-cell ${stackCell} max-sm:order-1`}>
                    {formatMonth(line.month)}
                  </td>
                  <td data-label="Valor recebido" className={`table-cell text-right ${stackCell} max-sm:order-3`}>
                    {money(line.received)}
                  </td>
                  <td data-label="Ganho do mês" className={`table-cell text-right ${stackCell} max-sm:order-4`}>
                    {money(line.gain)}
                  </td>
                  <td
                    data-label="Imposto"
                    className={`table-cell text-right font-semibold ${stackCell} max-sm:order-5 max-sm:col-span-2 ${line.tax > 0 ? "text-accent-ink" : "text-primary"}`}
                  >
                    {money(line.tax)}
                  </td>
                  {comunhao && (
                    <td data-label="Por cônjuge (50%)" className={`table-cell text-right ${stackCell} max-sm:order-6 max-sm:col-span-2`}>
                      {money(line.tax / 2)}
                    </td>
                  )}
                  <td data-label="Vencimento" className={`table-cell text-right ${stackCell} max-sm:order-2`}>
                    {formatDate(line.dueDate)}
                  </td>
                </tr>
              ))}
            </tbody>
            {schedule.length > 1 && (
              <tfoot className={stackFoot}>
                <tr className={`table-total ${stackTotalRow}`}>
                  <td className="max-sm:col-span-2 max-sm:p-0 max-sm:border-0">Total</td>
                  <td data-label="Valor recebido" className={`text-right ${stackTotalCell}`}>{money(total((l) => l.received))}</td>
                  <td data-label="Ganho do mês" className={`text-right ${stackTotalCell}`}>{money(total((l) => l.gain))}</td>
                  <td data-label="Imposto" className={`text-right ${stackTotalCell}`}>{money(total((l) => l.tax))}</td>
                  {comunhao && (
                    <td data-label="Por cônjuge (50%)" className={`text-right ${stackTotalCell}`}>{money(total((l) => l.tax) / 2)}</td>
                  )}
                  <td className="max-sm:hidden"></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </section>
  );
}
