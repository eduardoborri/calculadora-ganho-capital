import { REINVESTMENT_DAYS } from "../../constants";
import type { Application, CaseInput } from "../../types";
import { reinvestmentDeadline } from "../../utils/exemptions";
import { formatCurrency, formatDate, formatPercent, round2 } from "../../utils/format";
import RowTable, { CellDate, CellMoney } from "../shared/RowTable";
import { newId } from "../shared/newId";
import type { BlockWithResultProps } from "./blockProps";
import { BlockCard, CheckField, DateField, Field } from "./fields";

export default function ReinvestmentBlock({ input, onChange, result }: BlockWithResultProps) {
  const reinvestment = input.reinvestment;
  const set = (patch: Partial<CaseInput["reinvestment"]>) => onChange({ reinvestment: { ...reinvestment, ...patch } });
  const rows = reinvestment.applications;
  const setRow = (id: string, patch: Partial<Application>) =>
    set({ applications: rows.map((row) => (row.id === id ? { ...row, ...patch } : row)) });
  // The engine's rule: with several sales the term counts from the first contract.
  const deadline = reinvestmentDeadline(input);
  const outcome = result.status === "ok" ? result.reinvestment : null;

  const control = (
    <label className="flex items-center gap-2 text-sm font-semibold text-secondary-ink cursor-pointer">
      <input
        type="checkbox"
        checked={reinvestment.enabled}
        onChange={(e) => set({ enabled: e.target.checked })}
        className="w-4 h-4 accent-primary"
      />
      Aplicar o art. 39
    </label>
  );

  return (
    <BlockCard
      title="Reinvestimento"
      control={control}
      collapsed={!reinvestment.enabled}
      summary="Isenção do ganho aplicado na compra de imóvel residencial em até 180 dias (Lei 11.196/2005, art. 39). Marque para informar as aplicações."
    >
      <p className="notice notice-ok leading-relaxed block">
        {deadline ? (
          <>
            Data-limite para aplicar: <strong className="font-semibold">{formatDate(deadline)}</strong>, o dia {REINVESTMENT_DAYS} contado
            do contrato. O dia {REINVESTMENT_DAYS} vale; o seguinte, não.
          </>
        ) : (
          "Informe a data da alienação para ver a data-limite de 180 dias."
        )}
      </p>

      <div className="space-y-2">
        <CheckField
          label="Houve mais de uma venda: o prazo conta do primeiro contrato"
          checked={reinvestment.moreThanOneSale}
          onChange={(moreThanOneSale) => set({ moreThanOneSale })}
        />
        {reinvestment.moreThanOneSale && (
          <DateField
            label="Data do primeiro contrato"
            value={reinvestment.firstContractDate}
            onChange={(firstContractDate) => set({ firstContractDate })}
            hint="Em branco, o prazo conta desta alienação."
            className="max-w-xs"
          />
        )}
        <CheckField
          label="O alienante usou esta isenção nos últimos 5 anos"
          checked={reinvestment.usedInLast5Years}
          onChange={(usedInLast5Years) => set({ usedInLast5Years })}
        />
        <CheckField
          label="Envolve terreno ou vaga de garagem avulsa (IN SRF 599/2005, art. 2º, § 11, II e III)"
          checked={reinvestment.landOrGarage}
          onChange={(landOrGarage) => set({ landOrGarage })}
        />
      </div>

      <Field
        label="Aplicações na compra de imóvel residencial (parte do titular)"
        hint="Só entra o aplicado entre o contrato e a data-limite. A quitação precisa ser de dívida da aquisição a prazo de imóvel já possuído."
      >
        <RowTable<Application>
          rows={rows}
          addLabel="Adicionar aplicação"
          emptyText="Nenhuma aplicação informada."
          onAdd={() => set({ applications: [...rows, { id: newId(), date: "", value: 0, kind: "aquisicao" }] })}
          onRemove={(id) => set({ applications: rows.filter((row) => row.id !== id) })}
          rowLabel={(_row, index) => `aplicação ${index + 1}`}
          columns={[
            {
              header: "Data",
              yellow: true,
              width: "w-44",
              render: (row, index) => (
                <CellDate value={row.date} onChange={(date) => setRow(row.id, { date })} label={`Data da aplicação ${index + 1}`} />
              ),
            },
            {
              header: "Valor aplicado (R$)",
              yellow: true,
              align: "right",
              render: (row, index) => (
                <CellMoney value={row.value} onChange={(value) => setRow(row.id, { value })} label={`Valor da aplicação ${index + 1}`} />
              ),
            },
            {
              header: "Tipo",
              yellow: true,
              width: "w-48",
              render: (row, index) => (
                <select
                  value={row.kind}
                  aria-label={`Tipo da aplicação ${index + 1}`}
                  onChange={(e) => setRow(row.id, { kind: e.target.value as Application["kind"] })}
                  className="w-full bg-transparent text-sm text-primary font-semibold"
                >
                  <option value="aquisicao">Aquisição</option>
                  <option value="quitacao">Quitação de financiamento</option>
                </select>
              ),
            },
          ]}
        />
      </Field>

      {outcome && (
        <dl className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
          <div className="bg-paper rounded-md px-4 py-3 space-y-0.5">
            <dt className="text-xs text-text-gray">Produto da venda, líquido de corretagem</dt>
            <dd className="font-semibold text-primary tabular-nums">{formatCurrency(round2(outcome.proceeds))}</dd>
          </div>
          <div className="bg-paper rounded-md px-4 py-3 space-y-0.5">
            <dt className="text-xs text-text-gray">Aplicado no prazo</dt>
            <dd className="font-semibold text-primary tabular-nums">{formatCurrency(round2(outcome.applied))}</dd>
          </div>
          <div className="bg-paper rounded-md px-4 py-3 space-y-0.5">
            <dt className="text-xs text-text-gray">Parte tributada do ganho</dt>
            <dd className="font-semibold text-primary tabular-nums">{formatPercent(outcome.taxedShare)}</dd>
          </div>
        </dl>
      )}
    </BlockCard>
  );
}
