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

## 3. `public/config.json` — **o arquivo já existe, só preencher**

Ele vem no repositório com os campos em branco:

```json
{
  "supabaseUrl": "",
  "supabaseAnonKey": ""
}
```

Preencha as duas linhas com o **Project URL** e a **anon public** do Supabase (Settings → API) e publique.
Esses dois valores são públicos por natureza — vão para o navegador de qualquer visitante. A
**service role key nunca entra aqui**; ela é variável de ambiente da função.

Em branco = produto local, sem cadastro. É esse o padrão, e é assim que ele vai no repositório.

**Se ficar pela metade, o aplicativo avisa.** Foi assim que a primeira instalação falhou: o arquivo não
existia, o cartão de conta não aparecia e não havia como saber por quê. Agora, config existente mas
incompleto acende um aviso vermelho no cartão de conta, com um botão de **Diagnóstico** que responde as
quatro perguntas de uma vez: o config subiu? é JSON válido? o Supabase responde com essa URL e essa chave?
a função `/api/resumo` está publicada e com as variáveis de ambiente?

### Se o diagnóstico disser "HTTP 404 — a pasta api/ não subiu"

O projeto na Vercel precisa ter `api/` e `public/` lado a lado na raiz, com `outputDirectory: "public"` no
`vercel.json` — que já vai configurado assim no repositório. Se você publicou apontando a raiz para
`public/`, as funções ficam de fora e o 404 é esse.

## 4. Cobrança

Ainda não está ligada. O que existe é o campo `assinante_ate` no perfil: quem tem data no futuro é
assinante. O meio de pagamento (Stripe, Asaas, Mercado Pago) precisa, ao confirmar o pagamento, escrever
essa data — por webhook, com a service role key. Enquanto isso não existe, dá para liberar alguém à mão:

```sql
update perfis set plano = 'profissional', assinante_ate = now() + interval '30 days'
where email = 'cliente@exemplo.com.br';
```

---

## O que foi verificado e o que não foi

**Verificado** (`testes/t-conta.mjs` e `testes/t-telas.mjs`, com servidor simulado): sem `config.json` nem
a conta nem o cartão de resumo aparecem; com o config pela metade a tela denuncia; o link por e-mail entra
na conta inclusive quando a aba já está aberta; no plano grátis os botões da IA **nem existem** — a porta é
fechada antes do clique, não depois da viagem; assinante recebe o resumo, e ele chega ao PDF e ao `.txt`; a
chamada leva o token de quem pediu e o corpo é o texto da ata; a página não fala com mais nenhum servidor;
e o navegador guarda **apenas** a sessão — nenhum pedaço da reunião.

**Não verificado**, porque depende de credencial real: a chamada à Anthropic, o envio pelo Resend, a
migration rodando no Supabase de verdade e o fluxo do link de e-mail ponta a ponta. As funções em `api/`
estão escritas e revisadas, mas nunca executaram contra os serviços reais. Rode uma vez com uma conta de
teste antes de anunciar.

**Feito em 12/08/2026:** a política de privacidade e os termos ganharam as seções da camada paga — o que
sai do computador, para onde vai, que é usado e descartado, o que fica no cadastro (e-mail, plano, contagem
do mês) e como pedir a exclusão. Os termos ganharam ainda conta e assinatura, cota mensal não acumulável,
a natureza do texto gerado por modelo e a limitação de responsabilidade da parte paga.

**Ainda antes do primeiro cliente pagante:** rodar uma vez ponta a ponta com credenciais reais e ligar a
cobrança (item 4).
