// Alerts of a case (spec 5 and 5.1). Levels: `risco` for arbitramento, the 180 days and the Rearp
// reversal; `aberto` for the open points of spec 5.1; `aviso` for what needs checking; `info` for
// information. Texts never state as fact what the input does not prove.

import {
  COST_INDEX_END,
  DARF_CODE,
  FR2_START,
  REARP_LOCK_YEARS,
  REARP_OPTION_DEADLINE,
  REINVESTMENT_DAYS,
  REINVESTMENT_LOCK_YEARS,
  SINGLE_PROPERTY_LIMIT,
  TRANSFER_AT_MARKET_RATE,
} from "../constants";
import type {Alert, CaseInput, CaseResult, CostItem, ValueUpdate} from "../types";
import {filledItems} from "./costItems";
import {isValidDate, monthsInclusive, todayInBrazil} from "./dates";
import {formatDate, formatPercent, money, round2} from "./format";
import {isPermuta, saleShare} from "./holder";
import {installmentsBrokerage, saleModeAlerts, summedPriorParts} from "./saleModes";
import {progressiveTax} from "./taxTable";

// ---- Value update ----

export function law14973Alerts(months: number, percent: number): Alert[] {
  const alerts: Alert[] = [
    {
      id: "lei14973-percentual",
      level: "info",
      text: `Lei 14.973: ${months} meses completos desde a atualização, com ${formatPercent(percent)} da DTA no custo. GK = valor de alienação − [CAA + (DTA × percentual)], com a tabela progressiva.`,
      legal: "Lei 14.973/2024; IN RFB 2.222/2024, art. 12, § 2º",
    },
  ];
  if (percent > 0) {
    alerts.push({
      id: "lei14973-rateio",
      level: "aberto",
      text: "Lei 14.973 com percentual acima de zero: as reduções foram rateadas entre CAA e DTA, cada uma pela sua data, mas não há exemplo oficial desse rateio.",
      legal: "IN RFB 2.222/2024, art. 12, § 1º",
    });
  }
  return alerts;
}

function rearpReversalAlert(input: CaseInput, update: ValueUpdate): Alert {
  const migrated = update.migratedFrom14973
    ? " Caso migrado da Lei 14.973: a lei não diz expressamente como o prazo se aplica à migração, e isso deve ser confirmado."
    : "";
  const prazo =
    input.saleMode === "prazo" ? " Na venda a prazo, a dedução foi distribuída na proporção do valor recebido em cada mês." : "";
  return {
    id: "rearp-reversao",
    level: "risco",
    text: `Alienação em até ${REARP_LOCK_YEARS} anos da adesão ao Rearp: voltam o custo e a data originais, e o imposto pago corrigido pela Selic (${money(update.taxPaidSelic)}) é deduzido do imposto, sem ficar abaixo de zero. Eventual excedente não é tratado nesta apuração.${prazo}${migrated}`,
    legal: update.migratedFrom14973
      ? "Lei 15.265/2025, arts. 7º e 8º; IN RFB 2.302/2025, art. 17"
      : "Lei 15.265/2025, art. 7º",
  };
}

function rearpDateAlert(update: ValueUpdate): Alert {
  if (update.migratedFrom14973) {
    return {
      id: "rearp-migracao",
      level: "info",
      text: "Migração da Lei 14.973 para o Rearp: mantidos os valores atualizados, a data e o custo passam à data da Deap.",
      legal: "IN RFB 2.302/2025, art. 17",
    };
  }
  return {
    id: "rearp-data",
    level: "info",
    text: "Rearp: a data de aquisição é a da Deap ou do pagamento, a que ocorrer por último, conforme a data informada.",
    legal: "IN RFB 2.302/2025, art. 7º, § 2º",
  };
}

export function rearpAlerts(input: CaseInput, withinLock: boolean, reversal: boolean): Alert[] {
  const {update} = input;
  const alerts: Alert[] = [reversal ? rearpReversalAlert(input, update) : rearpDateAlert(update)];
  if (reversal && update.migratedFrom14973) {
    alerts.push({
      id: "rearp-migracao-prazo",
      level: "aberto",
      text: "Migração da Lei 14.973 para o Rearp com venda em até 5 anos: tratada como desfazimento do Rearp. O art. 17 da IN RFB 2.302/2025 não foi lido por inteiro.",
      legal: "IN RFB 2.302/2025, art. 17",
    });
  }
  if (withinLock && !reversal) {
    alerts.push({
      id: "rearp-excecao",
      level: "info",
      text: `Alienação em até ${REARP_LOCK_YEARS} anos da adesão, com a exceção de causa mortis ou partilha marcada: a atualização não foi desfeita.`,
      legal: "Lei 15.265/2025, art. 7º",
    });
  }
  if (update.date > REARP_OPTION_DEADLINE) {
    alerts.push({
      id: "rearp-apos-prazo",
      level: "aviso",
      text: `A data informada é posterior ao fim da opção (${formatDate(REARP_OPTION_DEADLINE)}). A ferramenta só trata quem já aderiu e não simula adesão nova: confirme a data.`,
      legal: "IN RFB 2.302/2025, art. 9º",
    });
  }
  return alerts;
}

// The CAA line exists under Lei 14.973 and in a reversal. Otherwise the cost sits at the option date.
function updateCost1995Alerts(update: ValueUpdate, reversal: boolean): Alert[] {
  const caaInCost = update.law === "14973" || reversal;
  if (!caaInCost || update.caa === 0 || update.originalAcquisitionDate > COST_INDEX_END) return [];
  return [
    {
      id: "custo-1995-confirmar",
      level: "aviso",
      text: `CAA com data até ${formatDate(COST_INDEX_END)}: confirme que o valor já está em reais de ${formatDate(COST_INDEX_END)}.`,
      legal: "IN SRF 84/2001, art. 7º",
    },
  ];
}

// What the update overrides on the input, so nothing typed is dropped in silence.
export function updateInputAlerts(input: CaseInput, reversal: boolean): Alert[] {
  const {update} = input;
  const legal = update.law === "14973" ? "IN RFB 2.222/2024, art. 12" : "IN RFB 2.302/2025, art. 7º, § 2º";
  const alerts: Alert[] = [];
  if (filledItems(input).length > 0) {
    alerts.push({
      id: "atualizacao-itens-ignorados",
      level: "info",
      text: "Com atualização de valor, o custo vem de CAA e DTA: os itens de custo informados não entram no cálculo.",
      legal,
    });
  }
  if (input.landRule) {
    alerts.push({
      id: "atualizacao-regra-terreno",
      level: "aviso",
      text: "Com atualização de valor, a opção de terreno com obra não foi aplicada: as reduções seguem as datas da atualização.",
      legal,
    });
  }
  if (update.originalAcquisitionDate !== input.acquisitionDate) {
    alerts.push({
      id: "atualizacao-data-divergente",
      level: "aviso",
      text: `A data de aquisição original da atualização (${formatDate(update.originalAcquisitionDate)}) difere da data de aquisição do imóvel (${formatDate(input.acquisitionDate)}). O custo usa a primeira: confirme as datas.`,
      legal,
    });
  }
  if (input.saleMode === "partes") {
    alerts.push({
      id: "atualizacao-partes",
      level: "aviso",
      text: "Alienação em partes com atualização de valor: CAA e DTA devem ser os valores da parte vendida, e o imposto pago corrigido pela Selic não pode repetir dedução feita em parte anterior.",
      legal,
    });
  }
  if (update.taxPaidSelic > 0 && !reversal) {
    alerts.push({
      id: "atualizacao-selic-nao-usado",
      level: "info",
      text: `O imposto pago corrigido pela Selic (${money(update.taxPaidSelic)}) não foi usado: ele só entra quando o Rearp é desfeito.`,
      legal: "Lei 15.265/2025, art. 7º",
    });
  }
  return [...alerts, ...updateCost1995Alerts(update, reversal)];
}

// ---- Sale ----

function marketAlerts(input: CaseInput): Alert[] {
  if (!input.belowMarket) return [];
  return [
    {
      id: "arbitramento",
      level: "risco",
      text: "Venda informada como abaixo do valor de mercado: há risco de arbitramento do valor de alienação.",
      legal: "Lei 7.713/1988, art. 20",
    },
  ];
}

// The typed calendar year should be the year of the sale; 0 means none typed (the reports then use
// the contract year).
function calendarYearAlerts(input: CaseInput): Alert[] {
  if (input.calendarYear <= 0 || !isValidDate(input.contractDate)) return [];
  const contractYear = Number(input.contractDate.slice(0, 4));
  if (input.calendarYear === contractYear) return [];
  return [
    {
      id: "ano-calendario-divergente",
      level: "info",
      text: `O ano-calendário informado (${input.calendarYear}) difere do ano do contrato de alienação (${contractYear}). O ganho é apurado na data da alienação; os relatórios mostram o ano informado: confirme-o.`,
      legal: "Lei 7.713/1988, art. 3º, § 2º",
    },
  ];
}

function projectiveAlerts(input: CaseInput, today: string): Alert[] {
  if (input.contractDate <= today) return [];
  return [
    {
      id: "operacao-futura",
      level: "info",
      text: "Operação com data futura: esta apuração tem caráter projetivo e usa a tabela e as regras vigentes hoje.",
      legal: "Lei 7.713/1988, art. 3º, § 2º",
    },
  ];
}

// A sale in cash with part of the price received in a later month is a sale a prazo.
function vistaAlerts(input: CaseInput): Alert[] {
  if (input.saleMode !== "vista") return [];
  return [
    {
      id: "vista-recebimento-posterior",
      level: "info",
      text: "Se parte do preço for recebida em mês posterior ao da alienação (ex.: sinal e saldo na escritura), use o modo a prazo: o ganho é tributado na proporção de cada recebimento (IN SRF 84/2001, art. 31).",
      legal: "IN SRF 84/2001, art. 31",
    },
  ];
}

function installmentAlerts(input: CaseInput): Alert[] {
  if (input.saleMode !== "prazo") return vistaAlerts(input);
  const alerts: Alert[] = [
    {
      id: "prazo-juros-correcao",
      level: "info",
      text: "Juros e correção recebidos nas parcelas ficam fora do ganho de capital e vão ao carnê-leão ou à retenção na fonte.",
      legal: "IN SRF 84/2001, art. 19, § 3º",
    },
  ];
  if (input.installments.some((installment) => installment.brokerage > 0)) {
    alerts.push({
      id: "prazo-corretagem-proporcao",
      level: "aberto",
      text: "Na venda a prazo, o ganho é apurado sobre o valor total e a corretagem é deduzida da parcela do mês em que foi paga (IN SRF 84/2001, art. 19, § 4º). O efeito sobre a proporção do ganho por parcela é ponto em aberto.",
      legal: "IN SRF 84/2001, art. 19, § 4º",
    });
  }
  if (input.brokerage > 0) {
    alerts.push({
      id: "prazo-corretagem-ignorada",
      level: "aviso",
      text: `A corretagem de ${money(input.brokerage)} do campo geral foi ignorada na venda a prazo: informe-a na parcela do mês em que foi paga.`,
      legal: "IN SRF 84/2001, art. 19, § 4º",
    });
  }
  return alerts;
}

// Compares only what the prior parts paid: the Rearp deduction in priorTaxPaid is not theirs.
function priorShortfallAlerts(input: CaseInput): Alert[] {
  if (input.saleMode !== "partes") return [];
  const parts = summedPriorParts(input);
  const paid = parts.reduce((sum, part) => sum + part.taxPaid, 0);
  const owed = progressiveTax(parts.reduce((sum, part) => sum + part.gain, 0)).total;
  if (round2(owed - paid) <= 0) return [];
  return [
    {
      id: "partes-diferenca-anterior",
      level: "aviso",
      text: `As partes anteriores pagaram ${money(paid)}, abaixo dos ${money(owed)} da tabela sobre os ganhos delas. A diferença de ${money(owed - paid)} pertence à parte anterior, com vencimento próprio e possíveis juros e multa, embora entre na conta do imposto a pagar desta operação.`,
      legal: "Lei 8.981/1995, art. 21, § 3º",
    },
  ];
}

// ---- Reinvestment ----

function deadlineAlerts(deadline: string | null): Alert[] {
  if (!deadline) return [];
  return [
    {
      id: "reinvestimento-180-dias",
      level: "risco",
      text: `Art. 39: a data-limite para aplicar o produto da venda é ${formatDate(deadline)}, o dia ${REINVESTMENT_DAYS}. O que não for aplicado até lá fica sujeito ao imposto, com juros e multa.`,
      legal: "Lei 11.196/2005, art. 39, § 4º",
    },
  ];
}

function reinvestmentBarAlerts(input: CaseInput): Alert[] {
  const {usedInLast5Years, landOrGarage} = input.reinvestment;
  const alerts: Alert[] = [];
  if (!input.residential) {
    alerts.push({
      id: "reinvestimento-nao-residencial",
      level: "aviso",
      text: "Art. 39 marcado para imóvel informado como não residencial: a isenção não se aplica e não foi considerada no cálculo.",
      legal: "Lei 11.196/2005, art. 39",
    });
  }
  if (usedInLast5Years) {
    alerts.push({
      id: "reinvestimento-uso-5-anos",
      level: "aviso",
      text: `Art. 39: informado uso da isenção nos últimos ${REINVESTMENT_LOCK_YEARS} anos. A isenção não foi considerada no cálculo.`,
      legal: "Lei 11.196/2005, art. 39, § 5º",
    });
  }
  if (landOrGarage) {
    alerts.push({
      id: "reinvestimento-terreno-garagem",
      level: "aviso",
      text: "Art. 39: terreno e vaga de garagem avulsa ficam fora da isenção, que não foi considerada no cálculo.",
      legal: "IN SRF 599/2005, art. 2º, § 11, II e III",
    });
  }
  return alerts;
}

// Residential sale with tax and no reinvestment typed: the art. 39 exemption may still apply.
function reinvestmentMissingAlerts(input: CaseInput, partial: CaseResult): Alert[] {
  if (!input.residential || input.reinvestment.enabled || partial.taxDue <= 0) return [];
  return [
    {
      id: "reinvestimento-nao-informado",
      level: "info",
      text: `Reinvestimento (Lei 11.196/2005, art. 39) não informado. Fica isento o ganho aplicado, em até ${REINVESTMENT_DAYS} dias do contrato, na aquisição de imóvel residencial no país, inclusive na quitação de financiamento de imóvel residencial já possuído; a isenção vale uma vez a cada ${REINVESTMENT_LOCK_YEARS} anos. Com aplicação parcial, a isenção é proporcional: ganho isento = ganho × valor reinvestido ÷ valor de venda.`,
      legal: "Lei 11.196/2005, art. 39; IN SRF 599/2005, art. 2º, com a redação da IN RFB 2.070/2022",
    },
  ];
}

function reinvestmentAlerts(input: CaseInput, partial: CaseResult): Alert[] {
  const {enabled, moreThanOneSale, applications} = input.reinvestment;
  if (!enabled) return reinvestmentMissingAlerts(input, partial);
  const alerts: Alert[] = [
    ...deadlineAlerts(partial.reinvestment.deadline),
    {
      id: "reinvestimento-irretratavel",
      level: "aviso",
      text: "Art. 39: a opção pela isenção é irretratável.",
      legal: "IN SRF 599/2005, art. 2º, § 4º",
    },
    ...reinvestmentBarAlerts(input),
  ];
  if (applications.some((app) => app.kind === "quitacao")) {
    alerts.push({
      id: "reinvestimento-quitacao",
      level: "aviso",
      text: "Art. 39: a dívida quitada precisa ser da aquisição a prazo do imóvel já possuído. Confirme a origem da dívida.",
      legal: "IN SRF 599/2005, art. 2º, § 10, III; Perguntão IRPF 2026; Solução de Consulta Cosit 14/2025",
    });
  }
  if (moreThanOneSale) {
    alerts.push({
      id: "reinvestimento-mais-de-uma-venda",
      level: "aviso",
      text: "Art. 39: com mais de uma venda, a isenção alcança só as vendas anteriores à primeira aquisição.",
      legal: "IN SRF 599/2005, art. 2º, § 6º",
    });
  }
  return alerts;
}

// ---- Cost ----

function quotedNames(names: string[]): string {
  return names.map((name) => `"${name}"`).join(", ");
}

// With an update the cost items are out of the calculation, so they raise nothing here.
function costAlerts(input: CaseInput): Alert[] {
  if (input.update) return [];
  const items = filledItems(input);
  const name = (item: CostItem) => item.description.trim() || item.id;
  const undocumented = items.filter((item) => !item.hasDocument);
  const uncorrected = items.filter(
    (item) => isValidDate(item.date) && item.date <= COST_INDEX_END && !item.original && !item.manual,
  );

  const alerts: Alert[] = [];
  if (undocumented.length > 0) {
    alerts.push({
      id: "documento-faltante",
      level: "aviso",
      text: `Item de custo sem documento comprobatório informado: ${quotedNames(undocumented.map(name))}. Isso representa limitação da análise e não prova de fato contrário.`,
      legal: "IN SRF 84/2001, art. 17, I",
    });
  }
  if (uncorrected.length > 0) {
    alerts.push({
      id: "custo-1995-confirmar",
      level: "aviso",
      text: `Item de custo até ${formatDate(COST_INDEX_END)} sem valor original: ${quotedNames(uncorrected.map(name))}. Confirme que o valor já está em reais de ${formatDate(COST_INDEX_END)}.`,
      legal: "IN SRF 84/2001, art. 7º",
    });
  }
  return alerts;
}

// Inheritance, legacy, donation or partition: the reductions run from the transfer.
function transferDateAlerts(input: CaseInput): Alert[] {
  if (input.acquisitionForm === "compra") return [];
  return [
    {
      id: "transferencia-data",
      level: "info",
      text: "Imóvel recebido por herança, legado, doação ou partilha: quando o custo é o valor da transferência, a data de aquisição para as reduções (art. 18, FR1 e FR2) é a da transferência (abertura da sucessão, doação ou partilha). Confirme a data de aquisição informada.",
      legal: "IN SRF 84/2001, arts. 16, I, e 20; IN SRF 599/2005, art. 3º",
    },
  ];
}

function transferAlerts(input: CaseInput): Alert[] {
  if (input.acquisitionForm === "compra") return [];
  if (!input.transferAtMarket) return transferDateAlerts(input);
  return [
    ...transferDateAlerts(input),
    {
      id: "transferencia-mercado",
      level: "aviso",
      text: `Transferência a valor de mercado: a ferramenta não calcula o imposto da transferência (${formatPercent(TRANSFER_AT_MARKET_RATE)} fixos), que cabe a quem transferiu o bem (espólio, doador ou cônjuge). O Darf desse imposto comprova o custo.`,
      legal: "Lei 9.532/1997, art. 23, §§ 1º e 5º; IN SRF 84/2001, art. 20, § 6º, III",
    },
  ];
}

function ownershipAlerts(input: CaseInput): Alert[] {
  if (input.ownership !== "comunhao") return [];
  return [
    {
      id: "comunhao-recolhimento",
      level: "info",
      text: "Bem comum do casamento: o ganho é apurado sobre o imóvel inteiro, sem divisão prévia entre os cônjuges, e a tabela progressiva incide sobre o ganho total. Cada cônjuge recolhe Darf de 50% do imposto (ver cronograma).",
      legal: "Solução de Consulta Cosit nº 161/2026; IN SRF 84/2001, art. 22, c/c art. 30, § 2º",
    },
  ];
}

// ---- Permuta com torna ----

function permutaBrokerage(input: CaseInput): number {
  return input.saleMode === "prazo" ? installmentsBrokerage(input) : input.brokerage;
}

// Info on the result of a permuta, and the open points it carries. partial.permuta is set for
// every permuta that reaches the calculation.
function permutaAlerts(input: CaseInput, partial: CaseResult): Alert[] {
  if (!isPermuta(input) || !partial.permuta) return [];
  const alerts: Alert[] = [];
  const brokerage = permutaBrokerage(input);
  const withoutTorna = saleShare(input) === 0;
  if (withoutTorna) {
    const note =
      brokerage > 0
        ? ` A corretagem informada (${money(brokerage)}) não foi deduzida: sem torna, não há valor do qual deduzi-la.`
        : "";
    alerts.push({
      id: "permuta-sem-torna",
      level: "info",
      text: `Permuta sem torna: não há ganho de capital a apurar nem imposto devido, em qualquer modalidade.${note}`,
      legal: "RIR/2018, art. 132, II",
    });
  }
  alerts.push({
    id: "permuta-custo-recebido",
    level: "info",
    text: `Custo do imóvel recebido para a declaração${input.ownership === "condominio" ? ", na parte do titular" : ""}: ${money(partial.permuta.receivedCost)} (custo do imóvel dado menos a torna, mais o ganho da torna pela fórmula do Perguntão, antes da corretagem e das reduções).`,
    legal: "RIR/2018, art. 128, § 4º, II; Perguntão IRPF 2026, pergunta 632",
  });
  if (!withoutTorna && brokerage > 0) {
    const floored =
      partial.grossGain <= 0
        ? " A corretagem supera o ganho apurado sobre a torna: o ganho fica em zero e não há imposto."
        : "";
    alerts.push({
      id: "permuta-corretagem",
      level: "aberto",
      text: `Permuta com corretagem: a corretagem foi deduzida da torna e reduz o ganho tributável sobre ela; a proporção usa a torna bruta. O custo do imóvel recebido segue a fórmula do Perguntão, sem a corretagem. O Perguntão não traz exemplo com corretagem: ponto em aberto.${floored}`,
      legal: "IN SRF 84/2001, art. 19, § 4º; Perguntão IRPF 2026, pergunta 632",
    });
  }
  if (input.singleProperty.onlyProperty) {
    alerts.push({
      id: "permuta-limite-unico-imovel",
      level: "aberto",
      text: `Isenção do único imóvel na permuta: o Perguntão não diz se o limite de ${money(SINGLE_PROPERTY_LIMIT)} se aplica à torna ou ao valor total da operação. A ferramenta compara o valor total (torna mais imóvel recebido), a leitura conservadora.`,
      legal: "Lei 9.250/1995, art. 23; IN SRF 84/2001, art. 29, § 5º; Perguntão IRPF 2026",
    });
  }
  return alerts;
}

// ---- Open points (spec 5.1). Installments: the tax rate is in saleModeAlerts, the brokerage in
// installmentAlerts ----

// A count below the full one means the line starts after Dec/2005, whatever date it took.
function m2Alerts(input: CaseInput, partial: CaseResult): Alert[] {
  const fullCount = monthsInclusive(`${FR2_START}-01`, input.contractDate);
  if (!partial.items.some((item) => item.m2 < fullCount)) return [];
  return [
    {
      id: "m2-apos-2005",
      level: "aberto",
      text: "m2 de aquisição depois de dez/2005: a contagem inclui o mês de aquisição por inferência, sem exemplo oficial. Pode ser conferida com caso fictício no GCAP.",
      legal: "Lei 11.196/2005, art. 40; IN SRF 599/2005, art. 3º; exemplo oficial do Perguntão (numeração da edição citada; confira na edição vigente)",
    },
  ];
}

function darfAlerts(partial: CaseResult): Alert[] {
  if (partial.taxPayable <= 0) return [];
  return [
    {
      id: "darf-codigo",
      level: "info",
      text: `Código de receita ${DARF_CODE}: código geral do ganho de capital de pessoa física residente na alienação de bens e direitos, inclusive imóveis. Confirme na Agenda Tributária da Receita Federal antes de emitir o Darf.`,
      legal: "Agenda Tributária da Receita Federal; IN SRF 84/2001, art. 30",
    },
  ];
}

// partial.alerts holds the alerts of the value update. `today` is a parameter only for tests.
export function buildAlerts(input: CaseInput, partial: CaseResult, today: string = todayInBrazil()): Alert[] {
  return [
    ...partial.alerts,
    ...marketAlerts(input),
    ...reinvestmentAlerts(input, partial),
    ...saleModeAlerts(input, partial.taxableBase),
    ...installmentAlerts(input),
    ...priorShortfallAlerts(input),
    ...costAlerts(input),
    ...transferAlerts(input),
    ...ownershipAlerts(input),
    ...permutaAlerts(input, partial),
    ...calendarYearAlerts(input),
    ...projectiveAlerts(input, today),
    ...m2Alerts(input, partial),
    ...darfAlerts(partial),
  ];
}
