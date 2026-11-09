import type { AcquisitionForm, Ownership } from "../../types";
import type { BlockProps } from "./blockProps";
import { BlockCard, CheckField, DateField, Field, MoneyField, Segmented, SelectField, TextField } from "./fields";

const FORMS: { value: AcquisitionForm; label: string }[] = [
  { value: "compra", label: "Compra (ou construção)" },
  { value: "heranca", label: "Herança" },
  { value: "legado", label: "Legado" },
  { value: "doacao_adiantamento", label: "Doação em adiantamento da legítima" },
  { value: "dissolucao", label: "Dissolução da sociedade conjugal (partilha)" },
];

const OWNERSHIPS: { value: Ownership; label: string }[] = [
  { value: "exclusivo", label: "Exclusivo" },
  { value: "condominio", label: "Condomínio" },
  { value: "comunhao", label: "Comunhão (casamento)" },
];

const OWNERSHIP_HINTS: Record<Ownership, string> = {
  exclusivo: "O imóvel inteiro pertence ao alienante.",
  condominio:
    "Valor de alienação e itens de custo são informados pelo imóvel inteiro; a calculadora aplica a quota do titular (IN SRF 84/2001, art. 19, IV).",
  comunhao:
    "Bem comum do casamento: apura-se pelo imóvel inteiro (IN SRF 84/2001, art. 22). O imposto pode ser recolhido metade em nome de cada cônjuge ou pela totalidade em nome de um deles.",
};

export default function PropertyBlock({ input, onChange }: BlockProps) {
  const transferred = input.acquisitionForm !== "compra";

  return (
    <BlockCard title="Imóvel">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <TextField
          label="Descrição do imóvel"
          value={input.propertyDescription}
          onChange={(propertyDescription) => onChange({ propertyDescription })}
          placeholder="Ex.: apartamento, matrícula fictícia 0000"
          className="md:col-span-2"
        />
        <SelectField
          label="Forma de aquisição"
          value={input.acquisitionForm}
          options={FORMS}
          onChange={(acquisitionForm) => onChange({ acquisitionForm })}
        />
        <DateField
          label={
            transferred
              ? "Data de aquisição (IN SRF 84/2001, art. 21)"
              : "Data de aquisição (a mais antiga, ou a do terreno)"
          }
          value={input.acquisitionDate}
          onChange={(acquisitionDate) => onChange({ acquisitionDate })}
          tooltip={
            transferred
              ? "Na herança, legado, doação em adiantamento ou partilha, a data de aquisição é a definida pelo art. 21 da IN SRF 84/2001 para cada forma de transferência."
              : "Imóvel adquirido em etapas: informe a data mais antiga. Com a opção de terreno com obra, a data do terreno."
          }
        />
      </div>

      {transferred && (
        <div className="space-y-2">
          <CheckField
            label="Transferido a valor de mercado (Lei 9.532/1997, art. 23)"
            checked={input.transferAtMarket}
            onChange={(transferAtMarket) => onChange({ transferAtMarket })}
            tooltip="O custo é o valor da transferência. O imposto de 15% sobre a transferência cabe a quem transferiu e não é calculado aqui."
          />
        </div>
      )}

      <CheckField
        label="Imóvel residencial"
        checked={input.residential}
        onChange={(residential) => onChange({ residential })}
        tooltip="A isenção do art. 39 (reinvestimento) só alcança a venda de imóvel residencial."
      />

      <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_12rem] gap-4 items-start">
        <Field label="Titularidade" hint={OWNERSHIP_HINTS[input.ownership]}>
          <Segmented
            value={input.ownership}
            options={OWNERSHIPS}
            onChange={(ownership) => onChange({ ownership })}
            ariaLabel="Titularidade"
          />
        </Field>
        {input.ownership === "condominio" && (
          <MoneyField
            label="Quota do titular"
            unit="%"
            value={input.quotaPct}
            onChange={(quotaPct) => onChange({ quotaPct })}
          />
        )}
      </div>
    </BlockCard>
  );
}
