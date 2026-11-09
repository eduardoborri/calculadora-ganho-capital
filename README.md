# Calculadora de Ganho de Capital

Ferramenta interna do Gaia Silva Gaede Advogados - PR (GSGA-PR) para apurar o ganho de capital na alienação de imóveis por pessoa física residente no Brasil, com base na Instrução Normativa SRF nº 84/2001 e normas relacionadas. Aplica as reduções do art. 18, FR1 e FR2, as isenções, o reinvestimento (Lei 11.196/2005, art. 39), a atualização de valor (Lei 14.973/2024 e Rearp) e a tabela progressiva de 15% a 22,5%. Mostra a memória de cálculo linha a linha, o cronograma de pagamento e os alertas, e exporta o relatório em PDF e a planilha Excel com fórmulas.

Os resultados têm caráter consultivo e não substituem a análise individual de cada caso nem o demonstrativo oficial da Receita.

## Permuta com torna

A permuta com torna está no escopo da ferramenta (bloco "Alienação", operação "Permuta com torna"). Informam-se a torna recebida e o valor do imóvel recebido. Só a torna, recebida em dinheiro, gera ganho: o custo do imóvel dado entra na proporção torna ÷ (custo + torna), e a permuta sem torna não gera ganho. O custo do imóvel recebido, para a declaração de bens, é o custo do imóvel dado menos a torna, mais o ganho da torna por essa fórmula. Nos limites de pequeno valor e do único imóvel conta o valor total da operação, torna mais imóvel recebido. Base: Perguntão IRPF 2026, perguntas 632, 634 e 681; RIR/2018, arts. 128, § 4º, II, 132, II, e 134, § 3º. A corretagem na permuta e o limite do único imóvel aparecem como pontos em aberto.

## Dados e privacidade

- Todo o cálculo roda no navegador. Nenhum dado do caso é enviado para fora da máquina.
- O histórico de simulações fica no `localStorage` do navegador daquela máquina. Ele guarda valores e datas; nome e descrição não são gravados (o nome do contribuinte e a descrição do imóvel ficam em branco ao reabrir). O botão "Excluir" apaga uma simulação e "Limpar tudo" apaga todas.
- O nome do contribuinte e a descrição do imóvel digitados na tela aparecem apenas nos relatórios (PDF e planilha) gerados na hora.
- Não use dados reais de clientes em testes, exemplos ou capturas de tela.

## Estrutura de `src/`

```
src/
  main.tsx, App.tsx          entrada da aplicação
  index.css                  tema (paleta, fontes), classes de tabela e botões
  types.ts, constants.ts     tipos do caso e do resultado; limites e marcos legais
  components/
    Calculator.tsx           tela de trabalho, cabeçalho, exportação e histórico
    WelcomeScreen.tsx        tela inicial e lista do histórico
    CostTable.tsx            tabela do custo de aquisição (com custo até 1995)
    CalculationMemo.tsx      memória de cálculo (memoLines.ts monta as linhas)
    ScheduleTable.tsx        cronograma de pagamento
    AlertList.tsx            alertas e pontos em aberto
    OutOfScopeNotice.tsx     aviso de caso fora do escopo
    blocks/                  blocos do formulário (identificação, imóvel,
                             alienação, isenções, reinvestimento, atualização)
    shared/                  CurrencyInput, Tooltip (portal), RowTable, estilos
  utils/                     regras de cálculo (capitalGain, exemptions,
                             saleModes, valueUpdate, taxTable, alerts),
                             datas, formatação, histórico,
                             pdfReport.ts e xlsxReport.ts
  data/                      índices do Anexo Único (custo até 1995) e textos
tests/                       testes do Vitest
functions/_middleware.js     autenticação básica na Cloudflare Pages
public/brand, public/fonts   logo e fonte Inter
docs/                        especificação, plano e fontes legais
```

## Como rodar

```
npm install
npm run dev
```

- `npm test`: executa os testes (Vitest).
- `npm run lint`: verifica os tipos (`tsc --noEmit`).
- `npm run build`: gera a versão de produção em `dist/`.

## Como testar no StackBlitz

1. Abra o repositório no StackBlitz pelo SHA do commit que quer conferir, para testar exatamente aquele estado: `https://stackblitz.com/github/eduardoborri/calculadora-ganho-capital/tree/<SHA>` (troque `<SHA>` pelo hash completo do commit).
2. Abra um terminal novo no StackBlitz.
3. Confira os tipos: `npx tsc --noEmit`
4. Rode os testes: `npx vitest run`
5. Para ver a tela, rode `npm run dev` e use a prévia. Confira também em largura de celular (375 px) e de tablet (cerca de 800 px): a página não deve ter rolagem horizontal, e as tabelas largas rolam dentro do próprio quadro.

## Publicação na Cloudflare Pages

- Comando de build: `npm run build`
- Diretório de saída: `dist`
- Versão do Node: variável de ambiente `NODE_VERSION=22` (a mesma do `.nvmrc`; o `package.json` exige Node 20.19 ou mais novo).
- Lockfile: as dependências diretas estão fixadas nas versões testadas no StackBlitz em 09/11/2026; ainda é recomendado fazer o commit do `package-lock.json` gerado no StackBlitz (`npm install` no terminal) para fixar também as dependências transitivas, de modo que a Cloudflare instale exatamente as versões conferidas.
- Segredos (Settings > Variables and Secrets): `SITE_USER` e `SITE_PASSWORD`. O usuário não diferencia maiúsculas de minúsculas; sem `SITE_USER`, qualquer usuário é aceito.
- Sem `SITE_PASSWORD` o site responde 503 e fica fechado: a configuração é obrigatória.
- O acesso é protegido por `functions/_middleware.js` (autenticação básica) para toda a equipe.

A publicação só acontece quando o responsável pedir: o merge em `main`, a criação do projeto na Cloudflare e o cadastro dos segredos não fazem parte do desenvolvimento rotineiro.

## Pontos em aberto (especificação, seção 5.1)

A ferramenta marca estes pontos com o selo "ponto em aberto" na tela, no PDF e na planilha:

1. m2 de aquisição depois de dez/2005: a contagem é por inferência, sem exemplo oficial. Pode ser conferida com caso fictício no GCAP 2026.
2. Venda a prazo com ganho acima de R$ 5.000.000: a alíquota por parcela é interpretação.
3. Lei 14.973 com percentual acima de zero: não há exemplo oficial do rateio entre CAA e DTA.
4. DARF 4600: citado pelo Perguntão para doação, sem o ato que o institui.
5. Migração da Lei 14.973 para o Rearp e venda em até 5 anos: tratada como desfazimento do Rearp (IN RFB 2.302/2025, art. 17, não lido por inteiro).
6. Venda a prazo com corretagem: o ganho é apurado sobre o valor total e a corretagem é deduzida da parcela do mês em que foi paga (IN SRF 84/2001, art. 19, § 4º); o efeito sobre a proporção do ganho por parcela é ponto em aberto.
7. Permuta com corretagem: a corretagem é deduzida da torna, e a proporção e o custo do imóvel recebido usam a torna bruta; o Perguntão não traz exemplo.
8. Permuta e isenção do único imóvel: o limite compara o valor total da operação (torna mais imóvel recebido), a leitura conservadora.
