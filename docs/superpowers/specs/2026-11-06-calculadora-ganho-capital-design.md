# Calculadora de Ganho de Capital de Imóveis (GSGA-PR): desenho

Data: 06/11/2026. Base: prompt do projeto, código do zip do AI Studio, Calculadora IRPF-M e leitura das normas.

## 1. Objetivo

Ferramenta interna do Gaia Silva Gaede Advogados - PR. Apura o imposto sobre o ganho de capital de pessoa física residente no Brasil na alienação de imóvel no Brasil e gera PDF e planilha Excel com o cálculo completo. É consultiva: não substitui o demonstrativo oficial da Receita, a declaração nem a análise do caso.

Sucesso significa:

- os casos da seção 9 deste documento passam;
- tela, PDF e planilha mostram o mesmo resultado, e a conferência da planilha dá diferença zero;
- pontos legais não confirmados aparecem marcados, nunca calculados em silêncio.

## 2. Decisões

| Tema | Decisão | Origem |
|---|---|---|
| Conflito entre código e prompt | O código prevalece, salvo os itens de 2.2 | Usuário |
| Chat com Gemini e servidor Express | Retirados. Versão 1 roda só no navegador | Usuário |
| Simulador de cenários | Fora da versão 1 | Usuário |
| Análise custo-benefício | Fora da versão 1 | Usuário |
| Histórico | Salvo no `localStorage`, sem o nome do contribuinte, com aviso e botões de excluir | Usuário e desenho aprovado |
| Importação da DIRPF | Fora da versão 1 | Usuário |
| Repositório | `eduardoborri/calculadora-ganho-capital`, público | Usuário |
| Pasta local | `Documents\calculadora-ganho-capital` | Usuário |
| Hospedagem | Cloudflare Pages, projeto `calculadora-ganho-capital`, branch `main`, `npm run build`, saída `dist` | Usuário |
| Quitação de financiamento | Sem divergência a decidir: a Receita incorporou a hipótese (IN 599, art. 2º, § 10, III) | Leitura |
| Texto "aspectos gerais" | Minuta aprovada, na seção 8 | Usuário |

### 2.1 Contradições resolvidas pelo código

- Fundo da tela: creme `#ede6b6`, no lugar do papel `#f5f7f6`. Os demais tokens seguem o prompt.
- Reduções: aplicadas por item de custo, conforme a data de cada item. A IN 599, art. 3º, § 4º, confirma essa forma.
- Corretagem paga pelo vendedor: deduzida do valor de alienação. A citação legal correta é a IN 84, art. 19, § 4º.

### 2.2 Pontos em que o código não é seguido

- Planilha com `exceljs`, não `xlsx`. A versão gratuita do `xlsx` não grava estilos de célula, e o código atual cola valores sem fórmulas.
- Aquisição em novembro de 2005, depois do dia 1º: o código dá m1 = 0, o que contraria a IN 599. Corrigir.
- m2 de aquisição depois de dez/2005: contar o mês de aquisição. O código não conta. Ver 4.3.

## 3. Restrições

- Dados de clientes não saem do navegador. Sem backend, sem API externa, sem banco.
- O histórico é a única persistência, por decisão do usuário, e fica naquela máquina.
- Repositório público: só casos fictícios em código, testes, commits e prints.
- Node.js não pode ser instalado na máquina do usuário. Testes rodam no StackBlitz.
- Senhas e segredos são digitados pelo usuário.
- Push e publicação só a pedido do usuário. Antes de cada push: `git fetch` e comparação com a `main` remota.

## 4. Regras de cálculo

Todas as regras ficam em funções puras em `src/utils/capitalGain.ts`, sem React. O mesmo resultado alimenta tela, PDF e planilha.

### 4.1 Escopo e bloqueios

Calcula: venda à vista, a prazo e em partes; composição do custo; art. 18, FR1 e FR2; isenções de pequeno valor, único imóvel e reinvestimento; herança, legado, doação em adiantamento da legítima e dissolução da sociedade conjugal; Lei 14.973/2024 e Rearp; copropriedade.

Avisa e não calcula: não residente, pessoa jurídica, imóvel rural com regra de terra nua, imóvel no exterior, moeda estrangeira, permuta com torna e alienação anterior a 01/12/2005 (que segue outros fatores, IN 599, art. 3º, § 1º, I e II).

### 4.2 Sequência

1. **Valor de alienação.** Preço efetivo (Lei 7.713, art. 19), menos corretagem paga pelo vendedor. Em condomínio, a parcela do titular (IN 84, art. 19, IV). Em bem comum do casamento, o bem inteiro (IN 84, art. 22), com a informação de que o imposto pode ser recolhido 50% em nome de cada cônjuge ou pela totalidade em nome de um deles (art. 30, § 2º).
2. **Custo.** Soma dos itens com data. Itens admitidos: IN 84, art. 17, I, com aviso de documento comprobatório. Item até 31/12/1995: valor original dividido pelo índice do Anexo Único da IN 84 (art. 7º), em campo de valor padrão editável. Custo a partir de 1996 não é corrigido (art. 8º).
3. **Herança, doação em adiantamento e partilha.** O custo é o valor da transferência (Lei 9.532, art. 23, § 4º; IN 84, art. 20, § 5º). A data de aquisição segue a IN 84, art. 21. A ferramenta não calcula o imposto da transferência a mercado (15% fixos, Lei 9.532, art. 23, § 1º), que cabe ao espólio ou ao doador: alerta que o Darf comprova o custo (art. 20, § 6º, III).
4. **Ganho bruto.** Valor de alienação menos custo. Zero ou negativo: sem imposto e sem base negativa.
5. **Reduções.** Rateio do ganho pelo peso de cada item no custo total. Em cada parcela, em sequência e cada uma sobre o saldo anterior (IN 599, art. 3º, §§ 2º a 5º): art. 18 da Lei 7.713 para item até 31/12/1988; FR1 para item até nov/2005; FR2. Custo total zero: todo o ganho usa a data de aquisição do imóvel.
6. **Terreno com obra iniciada até o marco.** Opção na tela: a data do terreno vale para todo o ganho, com marco de 31/12/1988 para o art. 18 (IN 84, art. 26, § 1º) e de 31/12/1995 para os fatores (IN 599, art. 3º, § 6º).
7. **Isenções de tudo ou nada.** Pequeno valor: até R$ 35.000,00 no mês, considerado o conjunto de bens da mesma natureza e a parte de cada condômino (IN 599, art. 1º). Único imóvel: valor até R$ 440.000,00, sem outra alienação em 5 anos, tributada ou não (Lei 9.250, art. 23; IN 84, art. 29, I), limite pela parte do condômino ou pelo imóvel em comunhão (art. 29, § 1º, II). Só valem com todos os requisitos marcados. O requisito faltante aparece com o motivo.
8. **Reinvestimento (Lei 11.196, art. 39; IN 599, art. 2º).** Parte tributada = `1 − aplicado ÷ (produto da venda − corretagem)`, limitada a 0 e 1, aplicada depois de FR1 e FR2. Só entra valor aplicado até o dia 180 contado do contrato. O dia 180 vale, o 181 não. Com mais de uma venda, o prazo conta do primeiro contrato.
9. **Imposto.** Tabela progressiva por faixa sobre a base final (Lei 8.981, art. 21).
10. **Alienação em partes.** A partir da segunda operação, se feita até o fim do ano-calendário seguinte ao da primeira: soma os ganhos, aplica a tabela ao total e deduz o imposto já pago. Fora desse prazo, apuração própria.
11. **Venda a prazo.** Ganho apurado como à vista. Ganho da parcela = `ganho total ÷ valor total × parcela` (IN 84, art. 31; Perguntão 668). O imposto total sai da tabela sobre o ganho total, e cada parcela paga sua proporção. A corretagem sai da parcela do mês em que foi paga (art. 19, § 4º). Juros e correção ficam fora do ganho, com aviso de carnê-leão ou fonte (art. 19, § 3º). Vencimento: último dia útil do mês seguinte ao recebimento, considerando feriados nacionais.

### 4.3 Contagem de m1 e m2

Conta o mês inicial e o final, pelo exemplo oficial da pergunta 649 do Perguntão 2026.

- m1: de jan/1996, ou do mês de aquisição se posterior, até nov/2005. Só para item até nov/2005. Imóvel anterior a 1996: m1 = 119.
- m2: de dez/2005, ou do mês de aquisição se posterior, até o mês da alienação, inclusive.
- FR1 = 1 / 1,0060^m1. FR2 = 1 / 1,0035^m2.

Conferência oficial: aquisição em 31/05/1995 e alienação em 10/10/2025 dão m1 = 119 e m2 = 239, ou seja, reduções de 50,927262% e 56,614267%.

### 4.4 Lei 14.973/2024

GK = valor da alienação − [CAA + (DTA × %)]. Percentual pelo tempo desde a atualização, em meses completos: até 36, 0%; até 48, 8%; até 60, 16%; até 72, 24%; até 84, 32%; até 96, 40%; até 108, 48%; até 120, 56%; até 132, 62%; até 144, 70%; até 156, 78%; até 168, 86%; até 180, 94%; acima de 180, 100%. As reduções são rateadas entre CAA e DTA, cada uma pela sua data (IN 2.222, art. 12, § 1º). Tabela progressiva (art. 12, § 2º).

### 4.5 Rearp (Lei 15.265/2025)

- Só trata quem já aderiu. Não simula adesão nova: a opção terminou em 19/02/2026 (IN 2.302, art. 9º).
- Data de aquisição para art. 18 e art. 40: a da Deap ou do pagamento, a que ocorrer por último (IN 2.302, art. 7º, § 2º).
- Alienação em até 5 anos da adesão, salvo causa mortis ou partilha: volta o custo e a data originais, e deduz o imposto pago corrigido pela Selic (Lei 15.265, art. 7º). Esse valor corrigido é digitado pelo usuário.
- Migração da Lei 14.973: mantém os valores atualizados, e a data e o custo passam à data da Deap (IN 2.302, art. 17).

### 4.6 Arredondamento

Precisão total nas contas internas. Duas casas só no valor final de cada etapa exibida, com uma única função usada por tela, PDF e planilha. Fatores exibidos com 6 casas.

### 4.7 Constantes

`src/constants.ts` guarda cada valor legal uma vez, com lei e vigência em comentário. Tabelas que mudam com o tempo são indexadas por data. O Anexo Único fica em `src/data/custoAte1995.ts`, gerado da cópia oficial.

## 5. Alertas

Três níveis visuais. O coral fica só para imposto devido e risco.

- Venda abaixo do mercado: risco de arbitramento (Lei 7.713, art. 20).
- 180 dias: data-limite e risco de imposto com juros e multa (art. 39, § 4º).
- Art. 39: uso nos últimos 5 anos; opção irretratável (IN 599, art. 2º, § 4º); terreno e vaga de garagem avulsa fora da isenção (§ 11, II e III, vigentes); dívida quitada precisa ser da aquisição a prazo do imóvel já possuído (Perguntão; Solução de Consulta Cosit 14/2025); com mais de uma venda, só as vendas anteriores à primeira aquisição (§ 6º).
- Rearp: venda dentro de 5 anos da adesão.
- Documento faltante: linguagem de limitação da análise, não de prova em contrário.
- Operação futura: nota de caráter projetivo.

### 5.1 Pontos em aberto (selo "ponto em aberto" na tela, no PDF e na planilha)

1. m2 de aquisição depois de dez/2005: contagem por inferência, sem exemplo oficial. Pode ser conferida com caso fictício no GCAP 2026.
2. Venda a prazo com ganho acima de R$ 5.000.000: alíquota por parcela é interpretação.
3. Lei 14.973 com percentual acima de zero: não há exemplo oficial do rateio entre CAA e DTA.
4. DARF 4600: citado pelo Perguntão para doação, sem o ato que o institui.
5. Migração da Lei 14.973 para o Rearp e venda em até 5 anos: tratada como desfazimento do Rearp (IN RFB 2.302/2025, art. 17, não lido por inteiro).
6. Venda a prazo com corretagem: o ganho é apurado sobre o valor total e a corretagem é deduzida da parcela do mês em que foi paga (IN SRF 84/2001, art. 19, § 4º); o efeito sobre a proporção do ganho por parcela é ponto em aberto.

## 6. Tela

- **Inicial:** logo, ação "Começar do zero" e lista do histórico salvo.
- **Trabalho:** grade do IRPF-M, com formulário e coluna de 380 px para a memória, que desce para baixo do formulário no celular.
- **Blocos:** Identificação, Imóvel, Custo, Alienação, Isenções, Reinvestimento e Atualização de valor. Os que não se aplicam ficam recolhidos.
- **Memória:** padrão do `CalculationMemo`, de ganho bruto até imposto a pagar, com detalhe por linha. Abaixo, cronograma e alertas.
- **Histórico:** valores e datas, sem nome e sem descrição do imóvel, com aviso de que ficam naquela máquina, "Excluir" e "Limpar tudo".
- **Reaproveitados do IRPF-M:** `CurrencyInput`, `Tooltip` com portal, valor padrão editável com ↺, colunas amarelas, layout `max-sm:`, `index.css`, fontes Inter, logo.

Valor manual aparece marcado no PDF e na planilha. Ao sair do campo sem alterar, o valor segue automático.

## 7. Arquitetura

React 19, Vite 6, TypeScript, Tailwind v4, jsPDF, exceljs, lucide-react.

```
functions/_middleware.js     Basic Auth, copiado do IRPF-M
public/brand, public/fonts   logo e Inter
src/constants.ts             valores legais
src/data/custoAte1995.ts     Anexo Único da IN 84
src/types.ts
src/utils/capitalGain.ts     motor de cálculo puro
src/utils/dates.ts           meses, 180 dias, último dia útil, feriados
src/utils/alerts.ts          alertas a partir do resultado
src/utils/history.ts         leitura e escrita do localStorage
src/utils/format.ts
src/utils/pdfReport.ts
src/utils/xlsxReport.ts
src/components/              tela, blocos, memória e shared/
tests/                       casos da seção 9
```

**PDF:** a partir de `pdfReport.ts`, A4 paisagem, Inter embutida, texto justificado, montagem síncrona no clique com fontes e logo em cache. Ordem: aspectos gerais, notas metodológicas, cálculo. Mantém a etiqueta de minuta e usa o rodapé do prompt. Arquivo `apuracao_ganho_capital_<nome>.pdf`.

**Planilha:** a partir de `xlsxReport.ts`, com import dinâmico e pré-carga. Aba "Apuração", fórmulas reais, `fullCalcOnLoad`, premissas com referência legal, cálculo linha a linha, cronograma e conferência. Azul para entrada, amarelo para preencher, preto para fórmula. Arquivo `apuracao_ganho_capital_<nome>.xlsx`.

**Cloudflare:** segredos `SITE_USER` e `SITE_PASSWORD` cadastrados pelo usuário. Sem `SITE_PASSWORD`, o site responde 503.

## 8. Texto "Ganho de capital: aspectos gerais" (aprovado)

O ganho de capital na alienação de imóveis por pessoa física residente no Brasil corresponde à diferença positiva entre o valor de alienação e o custo de aquisição (Lei nº 7.713/1988, art. 3º, § 2º). O conceito de alienação é amplo e alcança, entre outras operações, a compra e venda, a permuta, a dação em pagamento, a cessão e a promessa de compra e venda.

O imposto é apurado em separado dos demais rendimentos, não integra a base do ajuste anual e não é compensável na declaração. Incidem alíquotas progressivas de 15% a 22,5%, por parcela do ganho (Lei nº 8.981/1995, art. 21, com a redação da Lei nº 13.259/2016). O pagamento deve ocorrer até o último dia útil do mês seguinte ao da percepção do ganho. Nas vendas a prazo, o ganho é apurado como se a venda fosse à vista, e o imposto é pago na proporção das parcelas recebidas.

A legislação prevê reduções do ganho em função da data de aquisição: o percentual do art. 18 da Lei nº 7.713/1988, para imóveis adquiridos até 1988, e os fatores FR1 e FR2 do art. 40 da Lei nº 11.196/2005. Prevê também isenções, entre elas a do bem de pequeno valor, a do único imóvel alienado por até R$ 440.000,00 e a do reinvestimento em imóvel residencial no prazo de 180 dias, cada qual sujeita a requisitos próprios.

Imóveis recebidos por herança, legado, doação em adiantamento da legítima ou partilha têm como custo o valor pelo qual foram transferidos. Imóveis atualizados pela Lei nº 14.973/2024 ou pelo Rearp (Lei nº 15.265/2025) seguem regras específicas de custo e de data de aquisição, e a alienação dentro dos prazos legais pode alterar ou desfazer os efeitos da atualização.

Esta apuração foi elaborada com base nas informações e nos documentos fornecidos. A ausência de documento representa limitação da análise e não prova de fato contrário. Os resultados têm caráter consultivo e não substituem o demonstrativo oficial da Receita Federal, a declaração nem a análise individual de cada caso.

## 9. Testes

Valores fictícios, sem arredondamento intermediário.

| # | Situação | Esperado |
|---|---|---|
| 1 | Ganho R$ 700.000; m1 = 0; m2 = 195 | FR2 = 0,505955; base R$ 354.168,20; imposto R$ 53.125,23 |
| 2 | Ganho R$ 1.000.000; m1 = 70; m2 = 246 | FR1 = 0,657872; FR2 = 0,423375; base R$ 278.526,58; imposto R$ 41.778,99 |
| 3 | Ganho tributável R$ 12.000.000 | R$ 2.025.000 |
| 4 | Imóvel de 1985, ganho R$ 100.000, antes de FR | R$ 80.000 |
| 5 | Imóvel de 1969 | Imposto zero |
| 6 | Imóvel de 1989 | Sem redução do art. 18 |
| 7 | Venda R$ 1.000.000, ganho R$ 400.000, aplicados R$ 600.000 em 180 dias | Tributável R$ 160.000; imposto R$ 24.000, antes de FR |
| 8 | A prazo: valor R$ 1.000.000, ganho R$ 400.000, parcela R$ 250.000 | Ganho da parcela R$ 100.000; imposto R$ 15.000 |
| 9 | Em partes: 1ª ganho R$ 4.000.000, imposto R$ 600.000; 2ª ganho R$ 3.000.000 no ano seguinte | Total R$ 7.000.000; imposto R$ 1.100.000; a pagar R$ 500.000 |
| 10 | Caso 9, 2ª operação dois anos-calendário depois | Imposto próprio de R$ 450.000 |
| 11 | Único imóvel, venda R$ 440.000,00, sem venda em 5 anos | Isento |
| 12 | Único imóvel, venda R$ 440.000,01 | Sem esta isenção |
| 13 | Venda R$ 35.000,00 | Isento por pequeno valor |
| 14 | Duas vendas no mês, mesma natureza, somando R$ 40.000 | Sem isenção de pequeno valor |
| 15 | Lei 14.973: venda R$ 2.000.000, CAA R$ 500.000, DTA R$ 1.000.000, 50 meses | 16%; GK R$ 1.340.000 |
| 16 | Ganho negativo | Sem imposto, sem base negativa |
| 17 | Aquisição 31/05/1995, alienação 10/10/2025 | m1 = 119; m2 = 239; reduções de 50,927262% e 56,614267% |
| 18 | Aquisição 15/11/2005, alienação em dez/2005 | m1 = 1; m2 = 1 |
| 19 | Aquisição em mar/2010, alienação em mar/2011 | m1 = 0; m2 = 13 |

Limites exatos: ganho de R$ 5.000.000,00 e R$ 5.000.000,01; 36 e 37 meses na Lei 14.973; dia 180 e dia 181.

**Verificação:** StackBlitz por branch para typecheck e testes; build pelos check-runs da Cloudflare; recálculo da planilha em Python com biblioteca de fórmulas. Cada entrega diz o que foi testado e o que não foi.

## 10. Ordem de entrega

1. Repositório, esqueleto, motor de cálculo e constantes, com os casos da seção 9.
2. Tela completa e memória de cálculo.
3. PDF.
4. Planilha, com conferência igual a zero.
5. Revisão de celular.
6. Publicação, somente a pedido do usuário.

## 11. Fontes lidas

Planalto: Leis 7.713/1988 (via prompt), 8.981/1995 (via prompt), 9.249/1995, 9.250/1995 compilada, 9.532/1997, 11.196/2005, 14.973/2024, 15.265/2025 e 15.270/2025. Receita: Perguntão IRPF 2026 v1.00, IN SRF 599/2005 (versão multivigente), IN RFB 2.070/2022, IN RFB 2.222/2024, IN RFB 2.302/2025, Anexo Único da IN SRF 84/2001 e página do GCAP 2026. Secundária: texto da IN SRF 84/2001 em normaslegais.com.br.

Não lidos: Nota SEI 48/2018 da PGFN (PDF sem texto extraível, deixou de ser necessária) e texto integral do ADI RFB 3/2016.
