# Calculadora de Ganho de Capital de Imóveis: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir a calculadora de ganho de capital na alienação de imóveis por pessoa física, com tela, PDF e planilha a partir de um único cálculo.

**Architecture:** Aplicação 100% no navegador, feita a partir do esqueleto do IRPF-M. Um motor puro (`calculateCase`) recebe o caso e devolve o resultado, e tela, PDF e planilha só leem esse resultado.

**Tech Stack:** React 19, Vite 6, TypeScript, Tailwind v4, jsPDF, exceljs, lucide-react. Vitest só como dependência de desenvolvimento (motivo: os casos do spec precisam rodar no StackBlitz).

**Spec:** `docs/superpowers/specs/2026-11-06-calculadora-ganho-capital-design.md`. Leia o spec antes de cada tarefa: ele traz os valores legais, as citações e a ordem das regras, que este plano não repete.

**Referência:** `C:\Users\EduardoPedroSouzaBor\Documents\calculadora-irpf` (só leitura).

## Global Constraints

- Interface, relatórios e mensagens em português do Brasil. Código e comentários em inglês, como no IRPF-M.
- Sem backend, sem API externa, sem chat. Única persistência: histórico no `localStorage`, sem nome do contribuinte.
- Só dados fictícios em código, testes, commits e prints.
- Todo valor legal em `src/constants.ts`, uma vez, com lei e vigência em comentário.
- Datas no formato ISO `YYYY-MM-DD`, tratadas como texto e sem fuso. Nunca use `new Date("YYYY-MM-DD")` com getters locais.
- Duas casas só em `round2`, no valor final de cada etapa exibida. Motor guarda precisão total.
- Fundo creme `#ede6b6`; demais tokens de `src/index.css` do IRPF-M. Coral só para alerta e imposto devido.
- `tabular-nums` só em `td`, `th` e `input`.
- Rodapé do PDF, literal: "Ferramenta interna do Gaia Silva Gaede Advogados - PR para apuração do ganho de capital na alienação de imóveis. Simulação de caráter consultivo, não substitui a declaração nem a análise individual de cada caso."
- Node não existe nesta máquina e não pode ser instalado.
- Push só com autorização do usuário. Nunca em `main` sem pedido expresso. Antes de cada push: `git fetch` e comparação com o remoto.

## Como testar

Trabalhe na branch `desenvolvimento`. Depois de cada tarefa com testes, com a autorização de push:

1. `git fetch origin` e `git push origin desenvolvimento`.
2. Abra `stackblitz.com/github/eduardoborri/calculadora-ganho-capital/tree/desenvolvimento` no navegador embutido.
3. Abra um terminal novo (+), porque o inicial fica preso no servidor.
4. Rode `node node_modules/vitest/vitest.mjs run` e `node node_modules/typescript/bin/tsc --noEmit`, pressionando Enter à parte.

O "Run" dos passos abaixo significa este procedimento. `vite build` costuma travar no StackBlitz: o teste de build é o check-run da Cloudflare no commit. Se o StackBlitz não puder ser operado, pare e avise: não declare teste como passado.

## Review Focus

1. Formulário incompleto (datas vazias, valores zerados): o motor devolve `status: "incompleto"` com a lista do que falta, sem `NaN` nem exceção. Teste na Tarefa 3.
2. Data de alienação anterior à de aquisição, ou item de custo posterior à venda: erro claro, sem cálculo. Teste na Tarefa 3.
3. Parcelas da venda a prazo que não somam o valor total: alerta com a diferença, e o cronograma mostra só o informado. Teste na Tarefa 5.
4. Valor aplicado maior que o produto da venda: parte tributada 0, nunca negativa. Teste na Tarefa 4.
5. `localStorage` bloqueado, cheio ou com JSON corrompido: a tela abre com histórico vazio e avisa ao salvar. Teste na Tarefa 7.

---

### Task 1: Esqueleto do projeto

**Files:**
- Create: `package.json`, `vite.config.ts`, `vitest.config.ts`, `tsconfig.json`, `index.html`, `.gitignore`, `metadata.json`, `README.md`, `src/main.tsx`, `src/App.tsx`, `src/vite-env.d.ts`, `src/index.css`, `src/utils/format.ts`, `src/components/shared/CurrencyInput.tsx`, `src/components/shared/Tooltip.tsx`, `src/components/shared/LabelField.tsx`, `functions/_middleware.js`, `public/brand/gsga-logo.png`, `public/fonts/*`
- Test: `tests/format.test.ts`

**Interfaces:**
- Produces: `formatCurrency`, `formatPercent`, `slug`, `parseCurrencyBR` em `format.ts`; `round2(value: number): number` e `formatFactor(value: number): string` (6 casas) novos em `format.ts`.

- [ ] **Step 1: Copie da referência** os arquivos acima, sem `motion`, `pdfjs-dist` e `tesseract.js` no `package.json`, e adicione `vitest` em devDependencies e o script `"test": "vitest run"`. Nome do pacote `calculadora-ganho-capital`. No `index.css`, `--color-paper` e `--color-background` passam a `#ede6b6`. No `_middleware.js`, o realm passa a `Calculadora Ganho de Capital`. Título da página: `Calculadora de Ganho de Capital | GSGA-PR`.
- [ ] **Step 2: Escreva `tests/format.test.ts`:** `round2(1.005)` retorna `1.01` (arredonda sem erro de ponto flutuante); `round2(53125.229411)` retorna `53125.23`; `formatFactor(0.5059546)` retorna `"0,505955"`; `slug("João da Silva")` retorna `"joao_da_silva"`.
- [ ] **Step 3: Implemente `round2` e `formatFactor`.**
- [ ] **Step 4: Commit local na `main`** (`Esqueleto do projeto a partir do IRPF-M`) e crie a branch `desenvolvimento`.
- [ ] **Step 5: Com o usuário:** ele cria o repositório público vazio `eduardoborri/calculadora-ganho-capital`. Adicione o `origin` e, com a autorização dele, faça o primeiro push.
- [ ] **Step 6: Run.** Esperado: testes de `format` passam e `tsc` sem erros.

### Task 2: Datas, constantes e Anexo Único

**Files:**
- Create: `src/utils/dates.ts`, `src/constants.ts`, `src/data/custoAte1995.ts`, `tools/gerar_tabela_custo.py`
- Test: `tests/dates.test.ts`, `tests/custoAte1995.test.ts`

**Interfaces:**
- Produces, em `dates.ts`: `monthsInclusive(from: string, to: string): number`; `completedMonths(from: string, to: string): number`; `addDays(date: string, days: number): string`; `lastBusinessDayOfNextMonth(date: string): string`; `isNationalHoliday(date: string): boolean`.
- Produces, em `constants.ts`: `TAX_BRACKETS`, `ART18_REDUCTION`, `FR1_RATE`, `FR2_RATE`, `FR1_START` (`1996-01`), `FR1_END` (`2005-11`), `FR2_START` (`2005-12`), `MIN_SALE_DATE` (`2005-12-01`), `SMALL_VALUE_LIMIT`, `SINGLE_PROPERTY_LIMIT`, `REINVESTMENT_DAYS`, `REINVESTMENT_LOCK_YEARS`, `LAW14973_PERCENT_TABLE`, `REARP_LOCK_YEARS`, `REARP_OPTION_DEADLINE`, `DARF_CODE`.
- Produces, em `custoAte1995.ts`: `type Moeda = "Reais" | "Cruzeiros Reais" | "Cruzeiros" | "Cruzados Novos" | "Cruzados" | "Cruzeiros Novos" | "Mil-Réis"`; `costIndex(moeda: Moeda, year: number, month: number): number | null`; `currenciesFor(year: number, month: number): Moeda[]`.

- [ ] **Step 1: Escreva `tests/dates.test.ts`:** `monthsInclusive("1996-01-01","2005-11-30") === 119`; `monthsInclusive("2005-12-01","2025-10-10") === 239`; `completedMonths("2022-01-15","2025-01-15") === 36`; `completedMonths("2022-01-15","2025-01-14") === 35`; `addDays("2026-01-01",180) === "2026-06-30"`; `lastBusinessDayOfNextMonth("2026-01-10") === "2026-02-27"`; `lastBusinessDayOfNextMonth("2026-03-15") === "2026-04-30"`; `isNationalHoliday("2026-04-03") === true` (Paixão de Cristo, calculada pela Páscoa); `isNationalHoliday("2026-11-20") === true`.
- [ ] **Step 2: Implemente `dates.ts`.** Feriados nacionais fixos (01/01, 21/04, 01/05, 07/09, 12/10, 02/11, 15/11, 20/11, 25/12) mais Paixão de Cristo. Carnaval é ponto facultativo: não entra. Conte só meses-calendário por `ano*12+mês`.
- [ ] **Step 3: Crie `constants.ts`** com os valores das seções 4 do spec. `DARF_CODE = "4600"` com comentário de ponto em aberto. `LAW14973_PERCENT_TABLE` como pares `{ upToMonths, percent }`, com a linha final `{ upToMonths: Infinity, percent: 1 }`.
- [ ] **Step 4: Escreva `tools/gerar_tabela_custo.py`** para ler `docs/fontes/anexo-unico-in-srf-84-2001.txt` (latin-1; cabeçalhos `## ...` indicam a moeda; linha seguinte, os anos; `-` é vazio) e gerar `src/data/custoAte1995.ts`. Rode com `python -I tools/gerar_tabela_custo.py`.
- [ ] **Step 5: Escreva `tests/custoAte1995.test.ts`:** `costIndex("Reais",1995,12) === 0.9596`; `costIndex("Cruzados",1988,1) === 53.3508`; `costIndex("Cruzeiros",1990,3) === 33.2962`; `costIndex("Cruzados Novos",1990,3) === 33.2962`; `costIndex("Mil-Réis",1938,1) === 4.6475`; `costIndex("Reais",1993,1) === null`; `currenciesFor(1989,1)` contém `"Cruzados"` e `"Cruzados Novos"`.
- [ ] **Step 6: Run.** Esperado: tudo passa.
- [ ] **Step 7: Confira as Leis 7.713 (art. 18) e 8.981 (art. 21) na versão compilada do Planalto** e registre o resultado no commit. Divergência: pare e avise.
- [ ] **Step 8: Commit.**

### Task 3: Tipos e motor central

**Files:**
- Create: `src/types.ts`, `src/utils/capitalGain.ts`
- Test: `tests/capitalGain.core.test.ts`

**Interfaces:**
- Consumes: Tarefa 2.
- Produces, em `types.ts`:

```ts
export type AcquisitionForm = "compra" | "heranca" | "legado" | "doacao_adiantamento" | "dissolucao";
export type Ownership = "exclusivo" | "condominio" | "comunhao";
export type SaleMode = "vista" | "prazo" | "partes";
export type OutOfScope = "nao_residente" | "pessoa_juridica" | "rural_terra_nua" | "exterior" | "moeda_estrangeira" | "permuta_torna";

export interface CostItem {
  id: string; description: string; date: string; value: number;
  hasDocument: boolean;
  isLand?: boolean;
  original?: { amount: number; moeda: Moeda }; // item até 31/12/1995
  manual?: boolean;                            // valor digitado sobre o padrão
}
export interface Installment { id: string; date: string; value: number; brokerage: number }
export interface PriorPart { id: string; date: string; gain: number; taxPaid: number }
export interface Application { id: string; date: string; value: number; kind: "aquisicao" | "quitacao" }
export interface ValueUpdate {
  law: "14973" | "rearp"; date: string; caa: number; dta: number;
  originalAcquisitionDate: string; migratedFrom14973: boolean;
  taxPaidSelic: number; // Rearp: imposto pago corrigido, digitado
  exceptionCausaMortisOuPartilha: boolean;
}
export interface CaseInput {
  taxpayerName: string; calendarYear: number; propertyDescription: string;
  residential: boolean; acquisitionDate: string; acquisitionForm: AcquisitionForm;
  transferAtMarket: boolean; ownership: Ownership; quotaPct: number;
  landRule: boolean; costItems: CostItem[];
  contractDate: string; saleValue: number; brokerage: number; saleMode: SaleMode;
  belowMarket: boolean; installments: Installment[]; priorParts: PriorPart[];
  smallValue: { sameNatureMonthTotal: number; confirmed: boolean };
  singleProperty: { onlyProperty: boolean; noSaleIn5Years: boolean };
  reinvestment: { enabled: boolean; firstContractDate: string; applications: Application[];
    usedInLast5Years: boolean; moreThanOneSale: boolean; landOrGarage: boolean };
  update: ValueUpdate | null; outOfScope: OutOfScope[];
}
export interface ItemReduction {
  itemId: string; share: number; gain: number; art18Pct: number;
  m1: number; m2: number; fr1: number; fr2: number; reducedGain: number;
}
export interface BracketLine { from: number; to: number; rate: number; base: number; tax: number }
export interface ScheduleLine { month: string; received: number; gain: number; tax: number; dueDate: string }
export interface Alert { id: string; level: "info" | "aviso" | "risco" | "aberto"; text: string; legal?: string }
export type CaseStatus = "ok" | "incompleto" | "invalido" | "fora_de_escopo";
export interface CaseResult {
  status: CaseStatus; missing: string[];
  saleNet: number; totalCost: number; grossGain: number;
  items: ItemReduction[]; gainAfterReductions: number;
  exemption: { small: ExemptionCheck; single: ExemptionCheck };
  reinvestment: { deadline: string | null; applied: number; proceeds: number; taxedShare: number };
  taxableBase: number; brackets: BracketLine[]; taxDue: number; priorTaxPaid: number; taxPayable: number;
  schedule: ScheduleLine[]; alerts: Alert[];
}
export interface ExemptionCheck { applies: boolean; reasons: string[] }
```

- Produces, em `capitalGain.ts`: `calculateCase(input: CaseInput): CaseResult`; `progressiveTax(base: number): { brackets: BracketLine[]; total: number }`; `factorFR1(m1: number): number`; `factorFR2(m2: number): number`; `art18Percent(year: number): number`; `countM1(acquisition: string): number`; `countM2(acquisition: string, sale: string): number`; `defaultCaseInput(): CaseInput`; `correctedCost(item: CostItem): number`.

Nesta tarefa `calculateCase` cobre validação, escopo, venda à vista, custo e reduções. As Tarefas 4 a 6 ampliam a mesma função em módulos próprios.

- [ ] **Step 1: Escreva `tests/capitalGain.core.test.ts`** com um helper `caso(partial)` sobre `defaultCaseInput()`:
  - Caso 1: `700000 * factorFR2(195)` dá `354168.20` em `round2`, `factorFR2(195)` dá `"0,505955"`, e `progressiveTax(...).total` em `round2` dá `53125.23`.
  - Caso 2: `factorFR1(70)`, `factorFR2(246)`, base `278526.58`, imposto `41778.99`.
  - Caso 3: `progressiveTax(12000000).total === 2025000`, com faixas `750000`, `875000`, `400000`.
  - Limites: `progressiveTax(5000000).total === 750000`; `progressiveTax(5000000.01)` tem segunda faixa com base `0.01`.
  - Casos 4, 5 e 6: `art18Percent(1985) === 0.2`, `art18Percent(1969) === 1`, `art18Percent(1989) === 0`. Com data de 1969, `taxDue === 0`.
  - Caso 16: ganho negativo dá `grossGain` negativo, `taxableBase === 0`, `taxDue === 0`.
  - Caso 17: `countM1("1995-05-31") === 119`, `countM2("1995-05-31","2025-10-10") === 239`, e `(1 - factorFR1(119)) * 100` em 6 casas dá `50.927262`; `(1 - factorFR2(239)) * 100` dá `56.614267`.
  - Caso 18: `countM1("2005-11-15") === 1`; `countM2("2005-11-15","2005-12-20") === 1`.
  - Caso 19: `countM1("2010-03-10") === 0`; `countM2("2010-03-10","2011-03-20") === 13`.
  - Rateio: custos 300.000 (2000) e 100.000 (2015), ganho 400.000 dá `share` 0,75 e 0,25, e cada parcela usa os seus m1 e m2.
  - `landRule` com terreno (`isLand`) de 1985 e obra de 1987: art. 18 e fatores usam a data do terreno sobre todo o ganho. Terreno de 1985 e obra de 1990: fatores pela data do terreno sobre todo o ganho, e art. 18 só sobre a parcela do terreno (IN 84, art. 26, § 3º). Terreno de 1985 e obra de 1997: cada item com a sua data. A data do item de obra é a do início da obra.
  - Condomínio: `quotaPct` 50 e venda 1.000.000 dão `saleNet` 500.000 antes da corretagem; comunhão ignora `quotaPct`.
  - Corretagem: venda 1.000.000 e corretagem 60.000 dão `saleNet` 940.000.
  - Custo até 1995: item com `original: { amount: 10000, moeda: "Reais" }` em 1995-12 dá `correctedCost` `10000 / 0.9596`; item `manual: true` usa `value`.
  - Review Focus 1: `calculateCase(defaultCaseInput())` tem `status "incompleto"`, `missing` não vazio e nenhum `NaN` em `JSON.stringify`.
  - Review Focus 2: alienação anterior à aquisição e item de custo posterior à venda dão `status "invalido"`.
  - Escopo: `outOfScope: ["exterior"]` dá `status "fora_de_escopo"`; `contractDate` `2005-11-30` também.
- [ ] **Step 2: Run.** Esperado: FAIL, funções inexistentes.
- [ ] **Step 3: Implemente** `src/types.ts` e `src/utils/capitalGain.ts`, seguindo o spec 4.2 itens 1 a 6, 4.3 e 4.6. Custo total zero: um único item virtual com a data de aquisição. Herança, legado, doação e dissolução: o usuário informa o valor de transferência como item de custo e a data do art. 21 como `acquisitionDate`.
- [ ] **Step 4: Run.** Esperado: PASS.
- [ ] **Step 5: Commit.**

### Task 4: Isenções e reinvestimento

**Files:**
- Create: `src/utils/exemptions.ts`
- Modify: `src/utils/capitalGain.ts`
- Test: `tests/exemptions.test.ts`

**Interfaces:**
- Consumes: Tarefa 3.
- Produces: `checkSmallValue(input): ExemptionCheck`; `checkSingleProperty(input): ExemptionCheck`; `reinvestmentOutcome(input, proceeds): CaseResult["reinvestment"]`.

- [ ] **Step 1: Escreva os testes:**
  - Caso 7: venda 1.000.000, aplicados 600.000 dentro do prazo: `reinvestmentOutcome(...).taxedShare === 0.4`. Como m2 nunca é zero pela contagem inclusiva, o caso "antes de FR" testa a conta isolada: `400000 * 0.4 === 160000` e `progressiveTax(160000).total === 24000`.
  - Casos 11 e 12: 440.000,00 com `onlyProperty` e `noSaleIn5Years` isenta; 440.000,01 não, com motivo em `reasons`; sem `noSaleIn5Years`, não isenta e explica.
  - Em condomínio, o limite usa a parte do titular.
  - Casos 13 e 14: `sameNatureMonthTotal` 35.000 isenta; 40.000 não.
  - Dia 180 entra e 181 não: contrato 2026-01-01, aplicação em 2026-06-30 conta, em 2026-07-01 não, e `deadline === "2026-06-30"`.
  - Corretagem: `proceeds` = venda menos corretagem.
  - Review Focus 4: aplicado 2.000.000 sobre produto 1.000.000 dá `taxedShare === 0`.
  - Isenção aplicada zera `taxDue` e mantém a memória até `gainAfterReductions`.
- [ ] **Step 2: Run.** Esperado: FAIL.
- [ ] **Step 3: Implemente e integre** em `calculateCase`: isenções de tudo ou nada antes da tabela; `taxedShare` multiplica `gainAfterReductions`. Sem `residential`, o reinvestimento não se aplica e `reasons` explica por alerta.
- [ ] **Step 4: Run.** Esperado: PASS.
- [ ] **Step 5: Commit.**

### Task 5: Venda a prazo e alienação em partes

**Files:**
- Create: `src/utils/saleModes.ts`
- Modify: `src/utils/capitalGain.ts`
- Test: `tests/saleModes.test.ts`

**Interfaces:**
- Consumes: Tarefas 2 e 3.
- Produces: `buildSchedule(input, totalGainForRatio: number, totalTax: number): ScheduleLine[]`; `applyPriorParts(input, gain: number): { totalGain: number; tax: number; priorTaxPaid: number; payable: number }`.

- [ ] **Step 1: Escreva os testes:**
  - Caso 8: valor 1.000.000, ganho 400.000, parcela 250.000 dá `gain` 100.000 e `tax` 15.000.
  - Parcelas no mesmo mês viram uma linha, com `dueDate` do último dia útil do mês seguinte.
  - Corretagem da parcela: parcela 250.000 com `brokerage` 10.000 dá ganho `(240000 * 0.4)`.
  - Ganho acima de 5.000.000: imposto total pela tabela, parcelas proporcionais, somando o total, e alerta `aberto`.
  - Caso 9: 1ª ganho 4.000.000 e imposto 600.000; 2ª ganho 3.000.000 no ano seguinte: total 7.000.000, imposto 1.100.000, a pagar 500.000.
  - Caso 10: 2ª dois anos-calendário depois: imposto próprio de 450.000, sem soma.
  - Review Focus 3: parcelas somando 900.000 sobre valor 1.000.000: alerta com a diferença de 100.000 e cronograma só com o informado.
- [ ] **Step 2: Run.** Esperado: FAIL.
- [ ] **Step 3: Implemente e integre.** Venda à vista gera uma linha de cronograma pelo `contractDate`. A prazo, `grossGain` não desconta `brokerage` do caso: a corretagem vem das parcelas.
- [ ] **Step 4: Run.** Esperado: PASS.
- [ ] **Step 5: Commit.**

### Task 6: Atualização de valor e alertas

**Files:**
- Create: `src/utils/valueUpdate.ts`, `src/utils/alerts.ts`
- Modify: `src/utils/capitalGain.ts`
- Test: `tests/valueUpdate.test.ts`, `tests/alerts.test.ts`

**Interfaces:**
- Consumes: Tarefas 2 a 5.
- Produces: `law14973Percent(months: number): number`; `applyValueUpdate(input): { costItems: CostItem[]; gainOverride: number | null; deductFromTax: number; alerts: Alert[] }`; `buildAlerts(input, partial: CaseResult): Alert[]`.

- [ ] **Step 1: Escreva os testes:**
  - Caso 15: venda 2.000.000, CAA 500.000, DTA 1.000.000, 50 meses: `law14973Percent(50) === 0.16` e GK 1.340.000.
  - `law14973Percent(36) === 0`; `(37) === 0.08`; `(132) === 0.62`; `(180) === 0.94`; `(181) === 1`.
  - Percentual acima de zero: reduções rateadas entre CAA e DTA pelas datas, com alerta `aberto`.
  - Rearp após 5 anos: data de aquisição é a da opção, e o art. 18 é zero.
  - Rearp dentro de 5 anos: volta custo e data originais, `deductFromTax` é `taxPaidSelic`, e há alerta `risco`.
  - Exceção de causa mortis ou partilha: não desfaz.
  - Migração da Lei 14.973: data e custo na Deap.
  - Alertas: `belowMarket` gera arbitramento; `reinvestment.enabled` gera 180 dias e opção irretratável; `usedInLast5Years`, `landOrGarage` e aplicação `quitacao` geram os avisos do spec 5; `moreThanOneSale` gera o aviso do § 6º; item sem `hasDocument` gera texto com "limitação da análise"; `contractDate` futuro gera nota projetiva; herança com `transferAtMarket` gera o aviso dos 15% e do Darf; `ownership "comunhao"` gera a informação do recolhimento em nome de cada cônjuge; caso com m2 pós-dez/2005 gera o selo `aberto`; `DARF_CODE` aparece com o selo `aberto`.
- [ ] **Step 2: Run.** Esperado: FAIL.
- [ ] **Step 3: Implemente e integre.** Textos dos alertas em `alerts.ts`, sem afirmar fato não comprovado.
- [ ] **Step 4: Run.** Esperado: PASS.
- [ ] **Step 5: Commit.** Ao final, informe ao usuário os arquivos e o resultado dos testes (entrega 1 do spec).

### Task 7: Histórico

**Files:**
- Create: `src/utils/history.ts`
- Test: `tests/history.test.ts`

**Interfaces:**
- Produces: `HISTORY_KEY = "gsga-ganho-capital-historico"`; `interface HistoryEntry { id: string; savedAt: string; input: CaseInput }`; `loadHistory(storage?: Storage): HistoryEntry[]`; `saveEntry(input: CaseInput, storage?: Storage): boolean`; `removeEntry(id: string, storage?: Storage): void`; `clearHistory(storage?: Storage): void`.

- [ ] **Step 1: Escreva os testes** com um `Storage` falso: `saveEntry` grava com `taxpayerName === ""`; `removeEntry` e `clearHistory` funcionam. Review Focus 5: JSON corrompido faz `loadHistory` retornar `[]`; `setItem` que lança faz `saveEntry` retornar `false`; acesso que lança não propaga exceção.
- [ ] **Step 2: Run.** Esperado: FAIL.
- [ ] **Step 3: Implemente** com `try/catch` em cada acesso.
- [ ] **Step 4: Run.** Esperado: PASS.
- [ ] **Step 5: Commit.**

### Task 8: Tela e memória de cálculo

**Files:**
- Create: `src/components/Calculator.tsx`, `WelcomeScreen.tsx`, `CalculationMemo.tsx`, `ScheduleTable.tsx`, `AlertList.tsx`, `CostTable.tsx`, `OutOfScopeNotice.tsx`, e em `src/components/blocks/`: `IdentificationBlock.tsx`, `PropertyBlock.tsx`, `SaleBlock.tsx`, `ExemptionsBlock.tsx`, `ReinvestmentBlock.tsx`, `ValueUpdateBlock.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `calculateCase`, `defaultCaseInput`, `correctedCost`, `costIndex`, `currenciesFor`, `history.ts`.
- Produces: estado único `CaseInput` em `Calculator.tsx`, com `result = useMemo(() => calculateCase(input), [input])`. Cada bloco recebe `{ input, onChange: (patch: Partial<CaseInput>) => void }`.

- [ ] **Step 1: Implemente `WelcomeScreen`:** logo, "Começar do zero", histórico salvo, aviso da gravação local, "Excluir" e "Limpar tudo".
- [ ] **Step 2: Implemente os blocos** na ordem do spec 6, recolhendo os que não se aplicam. Requisito faltante da isenção mostra o motivo de `ExemptionCheck.reasons`. O reinvestimento mostra a data-limite. Situações fora de escopo mostram `OutOfScopeNotice` e nenhum valor.
- [ ] **Step 3: Implemente `CostTable`** com colunas amarelas e o padrão de valor editável com ↺ de `DividendSourcesTable.tsx`: sair do campo sem alterar mantém automático; alterar grava `manual: true`.
- [ ] **Step 4: Implemente `CalculationMemo`, `ScheduleTable` e `AlertList`,** com o selo "Ponto em aberto" para `level: "aberto"` e a grade `xl:grid-cols-[minmax(0,1fr)_380px]`.
- [ ] **Step 5: Run** (`tsc` e testes). Depois abra a prévia do StackBlitz e preencha os casos 1, 7 e 15. Esperado: valores iguais aos do spec. Registre o que foi visto e o que não foi.
- [ ] **Step 6: Commit.**

### Task 9: PDF

**Files:**
- Create: `src/utils/pdfReport.ts`, `src/data/textos.ts`
- Modify: `src/components/Calculator.tsx`
- Test: `tests/pdfReport.test.ts`

**Interfaces:**
- Produces: `preloadReportFiles(): Promise<ReportFiles>`; `buildPdfReport(params: { input: CaseInput; result: CaseResult }, files: ReportFiles): { blob: Blob; fileName: string }`; `reportFileName(name: string, ext: "pdf" | "xlsx"): string`; em `textos.ts`, `ASPECTOS_GERAIS: string[]` com o texto literal do spec 8.

- [ ] **Step 1: Escreva os testes:** `reportFileName("João da Silva","pdf") === "apuracao_ganho_capital_joao_da_silva.pdf"`; sem nome, usa a data do dia; `ASPECTOS_GERAIS.length === 5`.
- [ ] **Step 2: Run.** Esperado: FAIL.
- [ ] **Step 3: Adapte `pdfReport.ts` da referência,** mantendo cache de arquivos, montagem síncrona no clique, Inter e texto justificado. Ordem: "Ganho de capital: aspectos gerais", "Notas metodológicas" (com alertas e pontos em aberto, e a nota projetiva quando houver), páginas de cálculo. Valor manual marcado. Rodapé literal das Global Constraints e etiqueta de minuta.
- [ ] **Step 4: Run** e gere o PDF do caso 7 na prévia. Esperado: download no clique, três partes na ordem, valores iguais à tela.
- [ ] **Step 5: Commit.**

### Task 10: Planilha

**Files:**
- Create: `src/utils/xlsxReport.ts`, `tools/conferir_planilha.py`
- Modify: `src/components/Calculator.tsx`

**Interfaces:**
- Produces: `preloadExcel()`; `generateXlsxReport(params: { input: CaseInput; result: CaseResult }): Promise<{ blob: Blob; fileName: string }>`.

- [ ] **Step 1: Adapte `xlsxReport.ts` da referência:** aba "Apuração", `fullCalcOnLoad`, premissas com referência legal, dados, reduções por item, isenções, imposto por faixa, cronograma e conferência (valor da ferramenta, valor da planilha, diferença). Fórmulas reais; FR1 e FR2 como `=1/1,0060^m` em notação de Excel. Azul para entrada, amarelo para preencher, preto para fórmula. Valor manual marcado.
- [ ] **Step 2: Escreva `tools/conferir_planilha.py`,** que recalcula um `.xlsx` com a biblioteca `formulas` do Python e imprime cada linha de conferência. Rode com a planilha fictícia baixada da prévia.
- [ ] **Step 3: Rode nos casos 1, 7, 8, 9 e 15.** Esperado: diferença `0,00` em todas as linhas. Se a biblioteca não instalar, avise o usuário e não declare conferido.
- [ ] **Step 4: Commit.**

### Task 11: Revisão de celular e entrega

**Files:**
- Modify: componentes da Tarefa 8, `README.md`

- [ ] **Step 1: Aplique os padrões `max-sm:` do IRPF-M** às tabelas, com títulos que quebram como bloco e tooltips por portal.
- [ ] **Step 2: Confira na prévia em 375 px** a tela inicial, os blocos, a memória e o cronograma. Esperado: sem rolagem horizontal na página. Registre o que foi visto.
- [ ] **Step 3: Atualize o `README.md`** com estrutura, testes e publicação.
- [ ] **Step 4: Commit** e informe ao usuário. Merge em `main`, projeto na Cloudflare e segredos só quando ele pedir.
