import type { OutOfScope } from "../../types";
import type { BlockProps } from "./blockProps";
import { cellInput } from "../shared/styles";
import { BlockCard, CheckField, Field, TextField, fieldBox } from "./fields";

const OUT_OF_SCOPE_OPTIONS: { value: OutOfScope; label: string }[] = [
  { value: "nao_residente", label: "Alienante não residente no Brasil" },
  { value: "pessoa_juridica", label: "Alienante pessoa jurídica" },
  { value: "rural_terra_nua", label: "Imóvel rural com regra de terra nua" },
  { value: "exterior", label: "Imóvel no exterior" },
  { value: "moeda_estrangeira", label: "Operação em moeda estrangeira" },
];

export default function IdentificationBlock({ input, onChange }: BlockProps) {
  const toggleScope = (key: OutOfScope, checked: boolean) =>
    onChange({
      outOfScope: checked ? [...input.outOfScope.filter((k) => k !== key), key] : input.outOfScope.filter((k) => k !== key),
    });

  return (
    <BlockCard title="Identificação">
      <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_12rem] gap-4">
        <TextField
          label="Contribuinte"
          value={input.taxpayerName}
          onChange={(taxpayerName) => onChange({ taxpayerName })}
          placeholder="Nome do alienante"
          hint="Usado só nos relatórios. Não é gravado no histórico."
        />
        <Field label="Ano-calendário">
          <div className={fieldBox}>
            <input
              type="number"
              inputMode="numeric"
              min={2005}
              max={2100}
              value={input.calendarYear === 0 ? "" : input.calendarYear}
              placeholder="AAAA"
              aria-label="Ano-calendário"
              onChange={(e) => {
                const year = parseInt(e.target.value, 10);
                onChange({ calendarYear: Number.isFinite(year) ? year : 0 });
              }}
              className={`${cellInput} no-arrows`}
            />
          </div>
        </Field>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-xs font-semibold text-primary mb-2">Situações fora do escopo da ferramenta</legend>
        <p className="text-xs text-text-gray leading-snug">
          Marcada qualquer uma, a calculadora não apura o imposto e explica o motivo.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
          {OUT_OF_SCOPE_OPTIONS.map((option) => (
            <CheckField
              key={option.value}
              label={option.label}
              checked={input.outOfScope.includes(option.value)}
              onChange={(checked) => toggleScope(option.value, checked)}
            />
          ))}
        </div>
      </fieldset>
    </BlockCard>
  );
}
