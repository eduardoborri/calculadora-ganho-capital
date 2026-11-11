// Fixed texts of the reports. ASPECTOS_GERAIS is the approved text of spec section 8, verbatim:
// change it only with a new approval.

export const ASPECTOS_GERAIS: string[] = [
  "O ganho de capital na alienação de imóveis por pessoa física residente no Brasil corresponde à diferença positiva entre o valor de alienação e o custo de aquisição (Lei nº 7.713/1988, art. 3º, § 2º). O conceito de alienação é amplo e alcança, entre outras operações, a compra e venda, a permuta, a dação em pagamento, a cessão e a promessa de compra e venda.",
  "O imposto é apurado em separado dos demais rendimentos, não integra a base do ajuste anual e não é compensável na declaração. Incidem alíquotas progressivas de 15% a 22,5%, por parcela do ganho (Lei nº 8.981/1995, art. 21, com a redação da Lei nº 13.259/2016). O pagamento deve ocorrer até o último dia útil do mês seguinte ao da percepção do ganho. Nas vendas a prazo, o ganho é apurado como se a venda fosse à vista, e o imposto é pago na proporção das parcelas recebidas.",
  "A legislação prevê reduções do ganho em função da data de aquisição: o percentual do art. 18 da Lei nº 7.713/1988, para imóveis adquiridos até 1988, e os fatores FR1 e FR2 do art. 40 da Lei nº 11.196/2005. Prevê também isenções, entre elas a do bem de pequeno valor, a do único imóvel alienado por até R$ 440.000,00 e a do reinvestimento em imóvel residencial no prazo de 180 dias, cada qual sujeita a requisitos próprios.",
  "Imóveis recebidos por herança, legado, doação em adiantamento da legítima ou partilha têm como custo o valor pelo qual foram transferidos. Imóveis atualizados pela Lei nº 14.973/2024 ou pelo Rearp (Lei nº 15.265/2025) seguem regras específicas de custo e de data de aquisição, e a alienação dentro dos prazos legais pode alterar ou desfazer os efeitos da atualização.",
  "Esta apuração foi elaborada com base nas informações e nos documentos fornecidos. A ausência de documento representa limitação da análise e não prova de fato contrário. Os resultados têm caráter consultivo e não substituem o demonstrativo oficial da Receita Federal, a declaração nem a análise individual de cada caso.",
];

// Premises shown in the "Notas metodológicas" page of the PDF.
export const NOTAS_METODOLOGICAS: string[] = [
  "Precisão total nas contas internas; duas casas decimais apenas no valor final de cada etapa exibida e seis casas nos fatores de redução.",
  "Custo até 31/12/1995 corrigido pelo Anexo Único da IN SRF 84/2001 (art. 7º); custo a partir de 1996 sem correção (art. 8º). O valor digitado sobre o valor padrão aparece marcado como informado manualmente.",
  "Reduções aplicadas por item de custo, conforme a data de cada item, cada uma sobre o saldo anterior: art. 18 da Lei 7.713/1988, FR1 e FR2 do art. 40 da Lei 11.196/2005 (IN SRF 599/2005, art. 3º, §§ 2º a 5º).",
  "m1 e m2 contam o mês inicial e o final, conforme o exemplo oficial da pergunta 649 do Perguntão IRPF 2026. FR1 = 1 ÷ 1,0060^m1; FR2 = 1 ÷ 1,0035^m2.",
  "Isenções de pequeno valor e de único imóvel são de tudo ou nada: só se aplicam com todos os requisitos informados como atendidos. O reinvestimento (Lei 11.196/2005, art. 39) incide depois de FR1 e FR2.",
  "Imposto pela tabela progressiva, por faixa, de 15% a 22,5% sobre a base final (Lei 8.981/1995, art. 21).",
  "A apuração considera apenas os dados e documentos informados. A ausência de documento representa limitação da análise, e não prova de fato contrário.",
];

// Note of the installment schedule, on screen and in the PDF; the workbook spells it with its cells.
// In a permuta com torna the installments are the torna's.
export function scheduleNotePrazo(permuta: boolean): string {
  return permuta
    ? "Uma linha por mês de recebimento da torna. Ganho do mês = razão × (parcela da torna recebida − corretagem paga no mês), com razão = ganho total ÷ torna (IN SRF 84/2001, arts. 19, § 4º, e 31)."
    : SCHEDULE_NOTE_PRAZO;
}

export const SCHEDULE_NOTE_PRAZO =
  "Uma linha por mês de recebimento. Ganho do mês = razão × (valor recebido − corretagem paga no mês), com razão = ganho total ÷ valor de alienação (IN SRF 84/2001, arts. 19, § 4º, e 31).";

// Premise added to the "Notas metodológicas" of the PDF in a permuta com torna.
export const NOTA_PERMUTA =
  "Permuta com torna: só a torna recebida em dinheiro gera ganho, e o custo do imóvel dado entra na proporção torna ÷ (custo + torna); a permuta sem torna não gera ganho. O custo do imóvel recebido é o custo do imóvel dado menos a torna, mais o ganho da torna por essa fórmula. Nos limites de pequeno valor e do único imóvel conta o valor total da operação, torna mais imóvel recebido (Perguntão IRPF 2026, perguntas 632, 634 e 681; RIR/2018, arts. 128, § 4º, II, 132, II, e 134, § 3º).";
