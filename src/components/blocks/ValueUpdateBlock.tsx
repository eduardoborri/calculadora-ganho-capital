import type { CaseInput, ValueUpdate } from "../../types";
import type { BlockProps } from "./blockProps";
import { BlockCard, CheckField, DateField, Field, MoneyField, Segmented } from "./fields";

const LAWS: { value: ValueUpdate["law"]; label: string }[] = [
  { value: "14973", label: "Lei 14.973/2024" },
  { value: "rearp", label: "Rearp (Lei 15.265/2025)" },
];

function newUpdate(input: CaseInput): ValueUpdate {
  return {
    law: "14973",
    date: "",
    caa: 0,
    dta: 0,
    originalAcquisitionDate: input.acquisitionDate,
    migratedFrom14973: false,
    taxPaidSelic: 0,
    exceptionCausaMortisOuPartilha: false,
  };
}

const LAW_HINTS: Record<ValueUpdate["law"], string> = {
  "14973":
    "GK = valor de alienação − [CAA + DTA × percentual]. O percentual cresce com os meses completos desde a atualização (IN RFB 2.222/2024, art. 12).",
  rearp:
    "Só para quem já aderiu: a opção terminou em 19/02/2026. Venda em até 5 anos da adesão, salvo causa mortis ou partilha, volta ao custo e à data originais e deduz o imposto pago corrigido pela Selic (Lei 15.265/2025, art. 7º).",
};

export default function ValueUpdateBlock({ input, onChange }: BlockProps) {
  const update = input.update;
  const set = (patch: Partial<ValueUpdate>) => update && onChange({ update: { ...update, ...patch } });

  const control = (
    <label className="flex items-center gap-2 text-sm font-semibold text-secondary cursor-pointer">
      <input
        type="checkbox"
        checked={update !== null}
        onChange={(e) => onChange({ update: e.target.checked ? newUpdate(input) : null })}
        className="w-4 h-4 accent-primary"
      />
      Imóvel com valor atualizado
    </label>
  );

  return (
    <BlockCard
      title="Atualização de valor"
      control={control}
      collapsed={update === null}
      summary="Imóvel atualizado pela Lei 14.973/2024 ou pelo Rearp. Com a atualização, o custo vem de CAA e DTA, e os itens de custo não entram no cálculo."
    >
      {update && (
        <>
          <Field label="Regime" hint={LAW_HINTS[update.law]}>
            <Segmented value={update.law} options={LAWS} onChange={(law) => set({ law })} ariaLabel="Regime da atualização" />
          </Field>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <DateField
              label="Data da opção (Deap ou pagamento, o que ocorrer por último)"
              value={update.date}
              onChange={(date) => set({ date })}
            />
            <DateField
              label="Data de aquisição original"
              value={update.originalAcquisitionDate}
              onChange={(originalAcquisitionDate) => set({ originalAcquisitionDate })}
              hint="Data do custo antes da atualização; normalmente igual à data de aquisição do imóvel."
            />
            <MoneyField
              label="CAA: custo de aquisição antes da atualização"
              value={update.caa}
              onChange={(caa) => set({ caa })}
              hint="Valor do próprio titular, como declarado; não é ajustado pela quota."
            />
            <MoneyField
              label="DTA: diferença entre o valor atualizado e o CAA"
              value={update.dta}
              onChange={(dta) => set({ dta })}
              hint="Valor do próprio titular, como declarado; não é ajustado pela quota."
            />
          </div>

          {update.law === "rearp" && (
            <div className="space-y-3 pt-4 border-t border-rule">
              <CheckField
                label="Migrado da Lei 14.973/2024 (IN RFB 2.302/2025, art. 17)"
                checked={update.migratedFrom14973}
                onChange={(migratedFrom14973) => set({ migratedFrom14973 })}
              />
              <CheckField
                label="Alienação por causa mortis ou partilha (exceção ao prazo de 5 anos)"
                checked={update.exceptionCausaMortisOuPartilha}
                onChange={(exceptionCausaMortisOuPartilha) => set({ exceptionCausaMortisOuPartilha })}
              />
              <MoneyField
                label="Imposto pago na adesão, corrigido pela Selic"
                value={update.taxPaidSelic}
                onChange={(taxPaidSelic) => set({ taxPaidSelic })}
                hint="Valor do próprio titular, calculado fora da ferramenta. Só é deduzido quando o Rearp é desfeito pela venda em até 5 anos."
                className="max-w-md"
              />
            </div>
          )}
        </>
      )}
    </BlockCard>
  );
}
