# Como ligar a camada paga

Quatro peças, nesta ordem. Enquanto nenhuma delas existir, o Salavox continua funcionando inteiro,
local e sem cadastro — o cartão de conta e o cartão de resumo simplesmente não aparecem.

Desde 12/08/2026 a **IA do Salavox é o único motor de resumo do produto**. Os três anteriores (prompt para
colar, Ollama local, chave de terceiro) foram removidos. Consequência prática: sem esta camada ligada, o
produto não tem resumo por IA nenhum — o que ele tem é gravação, transcrição, telas, ata e exportação,
ilimitados e sem cadastro.

---

## 1. Supabase

1. Crie o projeto. Anote a **URL** e a **anon key** (essas duas são públicas, podem ir no navegador) e a
   **service role key** (esta **nunca** vai ao navegador).
2. Rode `migrations/001-contas.sql.txt` no editor SQL, de uma vez.
   Depois `migrations/002-degustacao.sql.txt` — é ele que libera os **3 resumos de cortesia** por conta.
   Depois `migrations/003-painel.sql.txt` — contagem de tokens e as funções do painel.
   Depois `migrations/004-cobranca.sql.txt` — a ligação com o Asaas e a validade da assinatura.
   **Se o 001 já foi aplicado, rode só os que faltam:** nenhum dos dois cria ou apaga tabela; o 002 troca
   a função `consumir_ia`, e o 003 acrescenta duas colunas de contador e as funções de leitura.
3. Em Authentication → URL Configuration, aponte o **Site URL** para `https://salavox.com/app` — é para lá
   que o link do e-mail volta.

O que o banco guarda: e-mail, plano e contador de uso do mês. O que ele nunca guarda: áudio, vídeo,
transcrição, ata. Se aparecer uma coluna com conteúdo de reunião, a promessa da página inicial deixou de
ser verdade.

## 2. Variáveis de ambiente na Vercel

| Variável | De onde vem |
|---|---|
| `ANTHROPIC_API_KEY` | console.anthropic.com, com faturamento ativo |
| `SUPABASE_URL` | Supabase → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API — **só no servidor** |
| `RESEND_API_KEY` | resend.com, para o envio de e-mail |
| `REMETENTE` | ex.: `ata@salavox.com`, com o domínio verificado no Resend |
| `ADMIN_EMAILS` | os e-mails que abrem `/painel`, separados por vírgula — **sem ela o painel não abre para ninguém** |
| `ASAAS_API_KEY` | Asaas → Integrações → API. `$aact_hmlg_…` no sandbox, `$aact_prod_…` em produção |
| `ASAAS_URL` | `https://api.asaas.com/v3` (sandbox: `https://api-sandbox.asaas.com/v3`) |
| `ASAAS_WEBHOOK_TOKEN` | um segredo que **você inventa** e repete na tela de webhooks do Asaas |

## 3. `public/config.json` — **já vai preenchido**

Desde 12/08/2026 o arquivo sai do repositório apontando para o projeto de produção:

```json
{
  "supabaseUrl": "https://zyqncemxjobkvdveordz.supabase.co",
  "supabaseAnonKey": "eyJhbGciOiJIUzI1NiIs…"
}
```

Esses dois valores são **públicos por natureza** — vão para o navegador de qualquer visitante, e é assim
que o Supabase foi desenhado: quem protege os dados é a política de acesso do banco (RLS), não o segredo
da chave. A **service role key nunca entra aqui**; ela é variável de ambiente da função.

**A trava que substituiu a antiga.** Enquanto o arquivo ia em branco, um teste conferia que ele estava em
branco. Agora `testes/t-funcoes.mjs` faz algo melhor: decodifica o JWT publicado e exige que o campo
`role` seja `anon`. As duas chaves do Supabase se parecem — mesmo formato, mesma tela de origem — e a
diferença mora dentro do token. Colar a de serviço aqui por engano expõe a base inteira, e é o tipo de erro
que se comete em três segundos; agora a suíte fica vermelha antes de o zip sair.

Deixar as duas linhas vazias desliga a camada paga e devolve o Salavox ao modo local, sem cadastro — é o
que acontece com quem baixa o código e serve por conta própria, e é o modo que quase todos os testes
descrevem.

**Se ficar pela metade, o aplicativo avisa.** Foi assim que a primeira instalação falhou: o arquivo não
existia, o cartão de conta não aparecia e não havia como saber por quê. Agora, config existente mas
incompleto acende um aviso vermelho no cartão de conta, com um botão de **Diagnóstico** que responde as
quatro perguntas de uma vez: o config subiu? é JSON válido? o Supabase responde com essa URL e essa chave?
a função `/api/resumo` está publicada e com as variáveis de ambiente?

Se faltar variável de ambiente, a função agora responde **com o nome da que falta** — `ANTHROPIC_API_KEY`,
`SUPABASE_URL` ou `SUPABASE_SERVICE_ROLE_KEY`. Nome de variável é público; só o valor é segredo, e
"servidor sem configuração" fazia alguém olhar para cinco campos sem saber qual.

### Se o diagnóstico disser "HTTP 404 — a pasta api/ não subiu"

O projeto na Vercel precisa ter `api/` e `public/` lado a lado na raiz, com `outputDirectory: "public"` no
`vercel.json` — que já vai configurado assim no repositório. Se você publicou apontando a raiz para
`public/`, as funções ficam de fora e o 404 é esse.

## 3b. Degustação — quem pode usar a IA

| | Quem é | Cota |
|---|---|---|
| Sem conta | não entrou | os botões nem aparecem |
| Conta grátis | entrou, não assina | **3 resumos rápidos, uma vez na vida da conta** |
| Assinante | `plano <> 'gratis'` e `assinante_ate` no futuro | 30 rápidos + 5 precisos por mês |

A cortesia é contada somando a coluna `resumos` de todos os meses daquele perfil — não precisa de coluna
nova, e quem assinou, gastou trinta e cancelou não ganha degustação de novo ao voltar. O modelo preciso
fica fora da cortesia de propósito: custa cerca de dez vezes mais por chamada.

Para conferir quantas cortesias uma conta já usou:

```sql
select p.email, coalesce(sum(u.resumos), 0) as resumos_na_vida
from perfis p left join uso_ia u on u.perfil_id = p.id
group by p.email order by resumos_na_vida desc;
```

## 3c. O painel — `/painel`

Endereço não divulgado e não indexado, mas a proteção não é o segredo do endereço: são três trancas
independentes.

1. **Sessão válida** do Supabase, conferida contra o Supabase a cada chamada.
2. **E-mail em `ADMIN_EMAILS`**, variável de ambiente da Vercel. Sem a variável, ninguém entra — nem você.
   Fechado por omissão, e não aberto por omissão.
3. **As funções de banco do painel têm execução revogada** de `anon` e `authenticated` (migration 003). Só
   a chave de serviço chama. Mesmo quem descobrir o nome delas não tem caminho do navegador até lá.

O que ele mostra: contas e quantas entraram no mês, assinantes e quantos vencem em sete dias, receita
mensal, custo de IA do mês **contado por token** (a Anthropic informa o consumo em cada resposta, e o
número é guardado), margem, quantas contas provaram a cortesia e quantas dessas assinaram, resumos e
e-mails do mês, e seis meses de histórico em dois gráficos.

O que ele faz: acha uma conta pelo e-mail e mostra plano, validade, cortesia usada e o consumo mês a mês;
libera ou estende um plano — **estender parte da data que já existe**, então renovar antes do vencimento
não rouba os dias que faltavam; e zera a cota do mês, para quando o erro foi nosso.

A única suposição da tela é a cotação do dólar, que fica num campo no rodapé e é dita como suposição. O
resto é medição.

## 4. Cobrança — Asaas

**No Asaas**, além de pegar a chave da API:

1. Vá em **Integrações → Webhooks** e crie um com a URL `https://salavox.com/api/asaas`, versão da API
   **v3**, e um **token de autenticação** que você inventa — o mesmo valor vai em `ASAAS_WEBHOOK_TOKEN`.
2. Marque os eventos de **cobrança** (payment). Os que importam são `PAYMENT_CONFIRMED`,
   `PAYMENT_RECEIVED`, `PAYMENT_REFUNDED` e os de chargeback; os outros chegam e são ignorados.
3. Comece pelo **sandbox** (`api-sandbox.asaas.com`), com um webhook apontando para a publicação de teste.
   Só depois troque as duas variáveis para produção.

**Como o dinheiro vira acesso, em uma frase:** o navegador cria a cobrança e abre a tela de pagamento; o
webhook, e só ele, escreve a data de validade quando o Asaas confirma.

Três decisões que estão no código e vale conhecer:

- **Libera no `PAYMENT_CONFIRMED`, não no `PAYMENT_RECEIVED`.** A documentação do Asaas recomenda o
  segundo, e recomenda bem — para a pergunta "já posso contar com esse dinheiro". A pergunta aqui é
  "esta pessoa pagou?". No cartão a liquidação leva semanas: esperar por ela seria alguém pagar hoje e
  usar o produto no mês que vem. O risco é coberto do outro lado — estorno e chargeback **cortam o
  acesso na hora**.
- **O mesmo pagamento não conta duas vezes.** O Asaas reenvia o evento quando não recebe 2xx, até quinze
  vezes. O id do pagamento fica guardado no perfil e o repetido é ignorado; sem isso, uma rede instável
  daria cinco meses por um pagamento.
- **Erro nosso responde 2xx assim mesmo.** Quinze falhas seguidas interrompem a fila do Asaas inteira,
  inclusive os eventos de quem pagou certo. O erro vai para o log da função, não para o código HTTP.

Liberar à mão continua existindo — é o que resolve atendimento — pelo botão do painel ou por SQL:

```sql
update perfis set plano = 'profissional', assinante_ate = now() + interval '30 days'
where email = 'cliente@exemplo.com.br';
```

---

## O que foi verificado e o que não foi

**Verificado no servidor** (`testes/t-funcoes.mjs`, chamando `api/painel.js` e `api/resumo.js` direto, com
o `fetch` substituído): sem `ADMIN_EMAILS` o painel responde 500 dizendo o nome da variável que falta;
conta comum com sessão válida leva 403 e **o banco não chega a ser consultado**; token que o Supabase não
reconhece leva 401; o e-mail do administrador é comparado sem diferenciar maiúsculas; a consulta vai com a
chave de serviço e nunca com o token de quem pediu; plano fora da lista é recusado e um número de dias
absurdo é aparado; a cota é consumida **antes** de a Anthropic ser chamada, e com a cota esgotada a
Anthropic não é chamada nenhuma vez — recusa não pode custar dinheiro; e nenhuma chamada ao banco leva o
texto da ata junto.

**Verificado no navegador** (`testes/t-conta.mjs`, `t-painel.mjs` e `t-telas.mjs`, com servidor simulado): sem `config.json` nem
a conta nem o cartão de resumo aparecem; com o config pela metade a tela denuncia; o link por e-mail entra
na conta inclusive quando a aba já está aberta; no plano grátis os botões da IA **nem existem** — a porta é
fechada antes do clique, não depois da viagem; assinante recebe o resumo, e ele chega ao PDF e ao `.txt`; a
chamada leva o token de quem pediu e o corpo é o texto da ata; a página não fala com mais nenhum servidor;
e o navegador guarda **apenas** a sessão — nenhum pedaço da reunião.

**Não verificado**, porque depende de credencial real: a chamada à Anthropic, o envio pelo Resend, as
migrations rodando no Supabase de verdade (inclusive a `cortesia_restante`, cuja resposta o teste simula),
o fluxo do link de e-mail ponta a ponta e **todo o caminho do Asaas** — criar cliente, criar assinatura e
receber o webhook. A lógica das funções está verificada contra um Asaas de mentira que responde nos
formatos que a documentação descreve; os formatos de verdade só se confirmam no sandbox. **Rode uma
assinatura de ponta a ponta no sandbox antes de apontar para produção.** As funções em `api/`
estão escritas e revisadas, mas nunca executaram contra os serviços reais. Rode uma vez com uma conta de
teste antes de anunciar.

**Feito em 12/08/2026:** a política de privacidade e os termos ganharam as seções da camada paga — o que
sai do computador, para onde vai, que é usado e descartado, o que fica no cadastro (e-mail, plano, contagem
do mês) e como pedir a exclusão. Os termos ganharam ainda conta e assinatura, cota mensal não acumulável,
a natureza do texto gerado por modelo e a limitação de responsabilidade da parte paga.

**Ainda antes do primeiro cliente pagante:** rodar uma vez ponta a ponta com credenciais reais e ligar a
cobrança (item 4).
