import { labelOptions, OPERATION_LABEL, SALE_MODE_LABEL } from "../../data/labels";
import { NOTA_CORRETAGEM } from "../../data/textos";
import type { Installment, PriorPart, SaleMode } from "../../types";
import { formatCurrency, formatPercent, round2 } from "../../utils/format";
import { holderPart, isPermuta, saleShare } from "../../utils/holder";
import RowTable, { CellDate, CellMoney } from "../shared/RowTable";
import { newId } from "../shared/newId";
import { stackTotalCell, stackTotalRow } from "../shared/styles";
import type { BlockProps } from "./blockProps";
import { BlockCard, CheckField, DateField, Field, MoneyField, Segmented } from "./fields";

const MODES = labelOptions(SALE_MODE_LABEL);
const OPERATIONS = labelOptions(OPERATION_LABEL);

const MODE_HINTS: Record<SaleMode, string> = {
  vista: "Ganho e imposto apurados no mês da alienação.",
  prazo:
    "Ganho apurado como à vista; cada parcela recebida paga a sua proporção do imposto (IN SRF 84/2001, art. 31). A corretagem vai na parcela do mês em que foi paga.",
  partes:
    "A partir da segunda operação feita até o fim do ano-calendário seguinte ao da primeira, os ganhos se somam, a tabela vale para o total e o imposto já pago é deduzido (Lei 8.981/1995, art. 21, § 3º).",
};

// In a permuta "a prazo" means the torna received in installments.
const PERMUTA_PRAZO_HINT =
  "Torna recebida em parcelas: ganho apurado como à vista sobre a torna; cada parcela recebida paga a sua proporção do imposto (IN SRF 84/2001, art. 31). A corretagem vai na parcela do mês em que foi paga.";

const PERMUTA_RULE = "Na permuta com torna, o ganho é apurado só sobre a torna: proporção = torna ÷ (custo + torna).";

function InstallmentsTable({ input, onChange }: BlockProps) {
  const rows = input.installments;
  const set = (id: string, patch: Partial<Installment>) =>
    onChange({ installments: rows.map((row) => (row.id === id ? { ...row, ...patch } : row)) });
  const total = rows.reduce((sum, row) => sum + row.value, 0);
  const brokerage = rows.reduce((sum, row) => sum + row.brokerage, 0);

  return (
    <Field
      label={isPermuta(input) ? "Parcelas da torna recebidas (parte do titular)" : "Parcelas recebidas (parte do titular)"}
      hint={`Informe só a parte do titular. ${isPermuta(input) ? "Torna" : "Valor de alienação"} do titular: ${formatCurrency(round2(saleShare(input)))}.`}
    >
      <RowTable<Installment>
        rows={rows}
        addLabel="Adicionar parcela"
        emptyText="Nenhuma parcela informada."
        onAdd={() => onChange({ installments: [...rows, { id: newId(), date: "", value: 0, brokerage: 0 }] })}
        onRemove={(id) => onChange({ installments: rows.filter((row) => row.id !== id) })}
        rowLabel={(_row, index) => `parcela ${index + 1}`}
        columns={[
          {
            header: "Data do recebimento",
            yellow: true,
            width: "w-44",
            render: (row, index) => <CellDate value={row.date} onChange={(date) => set(row.id, { date })} label={`Data da parcela ${index + 1}`} />,
          },
          {
            header: "Valor recebido (R$)",
            yellow: true,
            align: "right",
            render: (row, index) => (
              <CellMoney value={row.value} onChange={(value) => set(row.id, { value })} label={`Valor da parcela ${index + 1}`} />
            ),
          },
          {
            header: "Corretagem paga no mês (R$)",
            yellow: true,
            align: "right",
            render: (row, index) => (
              <CellMoney
                value={row.brokerage}
                onChange={(value) => set(row.id, { brokerage: value })}
                label={`Corretagem da parcela ${index + 1}`}
              />
            ),
          },
        ]}
        footer={
          rows.length > 0 && (
            <tr className={`table-total ${stackTotalRow}`}>
              <td className="max-sm:col-span-2 max-sm:p-0 max-sm:border-0">Total</td>
              <td data-label="Valor recebido (R$)" className={`text-right tabular-nums ${stackTotalCell}`}>{formatCurrency(round2(total))}</td>
              <td data-label="Corretagem paga no mês (R$)" className={`text-right tabular-nums ${stackTotalCell}`}>{formatCurrency(round2(brokerage))}</td>
              <td className="max-sm:hidden"></td>
            </tr>
          )
        }
      />
    </Field>
  );
}

function PriorPartsTable({ input, onChange }: BlockProps) {
  const rows = input.priorParts;
  const set = (id: string, patch: Partial<PriorPart>) =>
    onChange({ priorParts: rows.map((row) => (row.id === id ? { ...row, ...patch } : row)) });

  return (
    <Field
      label="Partes anteriores desta alienação"
      hint="Ganho tributável de cada parte, já depois das reduções, e o imposto pago nela. Sem partes anteriores, esta é a primeira operação."
    >
      <RowTable<PriorPart>
        rows={rows}
        addLabel="Adicionar parte anterior"
        emptyText="Nenhuma parte anterior informada."
        onAdd={() => onChange({ priorParts: [...rows, { id: newId(), date: "", gain: 0, taxPaid: 0 }] })}
        onRemove={(id) => onChange({ priorParts: rows.filter((row) => row.id !== id) })}
        rowLabel={(_row, index) => `parte anterior ${index + 1}`}
        columns={[
          {
            header: "Data da operação",
            yellow: true,
            width: "w-44",
            render: (row, index) => (
              <CellDate value={row.date} onChange={(date) => set(row.id, { date })} label={`Data da parte anterior ${index + 1}`} />
            ),
          },
          {
            header: "Ganho tributável (R$)",
            yellow: true,
            align: "right",
            render: (row, index) => (
              <CellMoney value={row.gain} onChange={(gain) => set(row.id, { gain })} label={`Ganho da parte anterior ${index + 1}`} />
            ),
          },
          {
            header: "Imposto pago (R$)",
            yellow: true,
            align: "right",
            render: (row, index) => (
              <CellMoney
                value={row.taxPaid}
                onChange={(taxPaid) => set(row.id, { taxPaid })}
                label={`Imposto pago na parte anterior ${index + 1}`}
              />
            ),
          },
        ]}
      />
    </Field>
  );
}

// Hint of a whole-property amount in a condominium: the holder's part after the quota.
function quotaHint(input: BlockProps["input"], amount: number, extra?: string) {
  const parts: string[] = [];
  if (extra) parts.push(extra);
  if (input.ownership === "condominio") {
    parts.push(
      `Em condomínio a calculadora aplica a quota de ${formatPercent(input.quotaPct / 100)}: ${formatCurrency(
        round2(holderPart(input, amount)),
      )} para o titular.`,
    );
  }
  return parts.length > 0 ? parts.join(" ") : undefined;
}

// Venda: the sale value. Permuta com torna: the torna received and the value of the property
// received. Switching the operation keeps every other field, and both sets of values.
function ValueFields({ input, onChange }: BlockProps) {
  if (!isPermuta(input)) {
    return (
      <MoneyField
        label="Preço da operação (imóvel inteiro)"
        value={input.saleValue}
        onChange={(saleValue) => onChange({ saleValue })}
        tooltip="Preço efetivo da operação, bruto de corretagem (Lei 7.713/1988, art. 19). A calculadora deduz a corretagem para chegar ao valor de alienação líquido."
        hint={quotaHint(input, input.saleValue)}
      />
    );
  }
  const { permuta } = input;
  return (
    <>
      <MoneyField
        label="Torna recebida (R$)"
        value={permuta.torna}
        onChange={(torna) => onChange({ permuta: { ...permuta, torna } })}
        tooltip="Só a torna é recebida em dinheiro e só ela gera ganho (RIR/2018, art. 132, II; Perguntão IRPF 2026, pergunta 632)."
        hint={quotaHint(input, permuta.torna, "Diferença recebida em dinheiro. Quem paga a torna não apura ganho sobre ela.")}
      />
      <MoneyField
        label="Valor do imóvel recebido (R$)"
        value={permuta.receivedValue}
        onChange={(receivedValue) => onChange({ permuta: { ...permuta, receivedValue } })}
        hint={quotaHint(input, permuta.receivedValue, "Usado só no limite de pequeno valor e do único imóvel (Perguntão 681).")}
      />
    </>
  );
}

export default function SaleBlock({ input, onChange }: BlockProps) {
  const permuta = isPermuta(input);
  const modeHint = permuta && input.saleMode === "prazo" ? PERMUTA_PRAZO_HINT : MODE_HINTS[input.saleMode];

  return (
    <BlockCard title="Alienação">
      <Field label="Operação">
        <Segmented value={input.operation} options={OPERATIONS} onChange={(operation) => onChange({ operation })} ariaLabel="Operação" />
      </Field>
      {permuta && <p className="notice notice-ok leading-relaxed block">{PERMUTA_RULE}</p>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <DateField
          label="Data da alienação"
          value={input.contractDate}
          onChange={(contractDate) => onChange({ contractDate })}
        />
        <ValueFields input={input} onChange={onChange} />
        {input.saleMode !== "prazo" && (
          <MoneyField
            label="Corretagem paga pelo titular"
            value={input.brokerage}
            onChange={(brokerage) => onChange({ brokerage })}
            tooltip={
              permuta
                ? "Na permuta, a corretagem paga pelo titular sai da torna (IN SRF 84/2001, art. 19, § 4º)."
                : "Corretagem paga pelo vendedor sai do valor de alienação (IN SRF 84/2001, art. 19, § 4º)."
            }
            hint={`O que o titular pagou; não é ajustada pela quota. ${NOTA_CORRETAGEM}`}
          />
        )}
      </div>

      <CheckField
        label={permuta ? "Operação abaixo do valor de mercado" : "Venda abaixo do valor de mercado"}
        checked={input.belowMarket}
        onChange={(belowMarket) => onChange({ belowMarket })}
        tooltip="Gera alerta de risco de arbitramento do valor de alienação (Lei 7.713/1988, art. 20)."
      />

      <Field label="Forma de recebimento" hint={modeHint}>
        <Segmented value={input.saleMode} options={MODES} onChange={(saleMode) => onChange(saleMode === "prazo" ? { saleMode, brokerage: 0 } : { saleMode })} ariaLabel="Forma de recebimento" />
      </Field>

      {input.saleMode === "prazo" && <InstallmentsTable input={input} onChange={onChange} />}
      {input.saleMode === "partes" && <PriorPartsTable input={input} onChange={onChange} />}
    </BlockCard>
  );
}
