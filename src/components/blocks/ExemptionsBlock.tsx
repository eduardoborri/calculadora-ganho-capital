import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { SINGLE_PROPERTY_LIMIT, SMALL_VALUE_LIMIT } from "../../constants";
import type { ExemptionCheck } from "../../types";
import { formatCurrency } from "../../utils/format";
import type { BlockWithResultProps } from "./blockProps";
import { BlockCard, CheckField, MoneyField } from "./fields";

// What the engine found for one exemption: applies, or each missing requirement with its reason.
function ExemptionStatus({ check, ready }: { check: ExemptionCheck; ready: boolean }) {
  if (!ready) return <p className="text-xs text-text-gray">Complete o caso para verificar os requisitos.</p>;
  if (check.applies) return <p className="text-sm font-semibold text-secondary">Isenção aplicável: o ganho fica isento.</p>;
  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold text-text-gray">Não aplicada. Requisitos faltantes:</p>
      <ul className="list-disc pl-5 space-y-0.5 text-xs text-ink leading-snug">
        {check.reasons.map((reason) => (
          <li key={reason}>{reason}</li>
        ))}
      </ul>
    </div>
  );
}

export default function ExemptionsBlock({ input, onChange, result }: BlockWithResultProps) {
  const { smallValue, singleProperty } = input;
  const touched =
    smallValue.confirmed || smallValue.sameNatureMonthTotal > 0 || singleProperty.onlyProperty || singleProperty.noSaleIn5Years;
  const [open, setOpen] = useState(touched);
  const ready = result.status === "ok";
  const anyApplies = ready && (result.exemption.small.applies || result.exemption.single.applies);

  const control = (
    <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="text-action">
      {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
      {open ? "Recolher" : "Verificar isenções"}
    </button>
  );

  return (
    <BlockCard
      title="Isenções"
      control={control}
      collapsed={!open}
      summary={
        anyApplies
          ? "Isenção aplicável a este caso. Abra o bloco para ver os requisitos."
          : `Pequeno valor (até ${formatCurrency(SMALL_VALUE_LIMIT)} no mês) e único imóvel (até ${formatCurrency(SINGLE_PROPERTY_LIMIT)}). Só valem com todos os requisitos marcados.`
      }
    >
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-primary">Bem de pequeno valor (IN SRF 599/2005, art. 1º)</h3>
        <MoneyField
          label="Total de bens da mesma natureza alienados no mês (parte do titular)"
          value={smallValue.sameNatureMonthTotal}
          onChange={(sameNatureMonthTotal) => onChange({ smallValue: { ...smallValue, sameNatureMonthTotal } })}
          hint="Inclui esta venda. Informe só a parte do titular; o valor não é ajustado pela quota."
          className="max-w-md"
        />
        <CheckField
          label={`Confirmo que o total do mês, na parte do titular, não passa de ${formatCurrency(SMALL_VALUE_LIMIT)}`}
          checked={smallValue.confirmed}
          onChange={(confirmed) => onChange({ smallValue: { ...smallValue, confirmed } })}
        />
        <ExemptionStatus check={result.exemption.small} ready={ready} />
      </div>

      <div className="space-y-3 pt-4 border-t border-rule">
        <h3 className="text-sm font-semibold text-primary">Único imóvel (Lei 9.250/1995, art. 23; IN SRF 84/2001, art. 29, I)</h3>
        <CheckField
          label="É o único imóvel do alienante"
          checked={singleProperty.onlyProperty}
          onChange={(onlyProperty) => onChange({ singleProperty: { ...singleProperty, onlyProperty } })}
        />
        <CheckField
          label="O alienante não vendeu outro imóvel, tributado ou não, nos últimos 5 anos"
          checked={singleProperty.noSaleIn5Years}
          onChange={(noSaleIn5Years) => onChange({ singleProperty: { ...singleProperty, noSaleIn5Years } })}
        />
        <p className="text-xs text-text-gray leading-snug">
          O limite de {formatCurrency(SINGLE_PROPERTY_LIMIT)} compara o valor de alienação do titular, antes da corretagem.
        </p>
        <ExemptionStatus check={result.exemption.single} ready={ready} />
      </div>
    </BlockCard>
  );
}
