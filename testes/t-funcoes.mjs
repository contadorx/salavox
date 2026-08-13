/* As funções do servidor, chamadas direto — sem navegador.

   Por que este arquivo existe: `api/painel.js` e `api/resumo.js` são o único
   código do Salavox que roda com a chave de serviço do banco e com a chave da
   Anthropic. É onde mora o dinheiro e é onde mora o acesso total à base. Os
   outros testes sobem um navegador e conferem o comportamento da página; a
   página não tem como demonstrar que o servidor recusa quem deve recusar.

   Aqui as funções são importadas e chamadas com `fetch` substituído por um
   duplo que registra o que foi pedido. Assim dá para afirmar duas coisas que
   antes eram só intenção escrita em comentário:

     1. quem não está em ADMIN_EMAILS não passa, mesmo com sessão válida;
     2. a cota é consumida ANTES de a Anthropic ser chamada — falhar depois de
        gastar seria o pior dos mundos, e é o erro fácil de cometer ao mexer
        nessa função.

   O que continua não verificado: as respostas reais da Anthropic, do Supabase
   e do Resend. Isto testa a lógica da função, não os serviços. */

import { bloco, RAIZ } from './apoio.mjs';
import fs from 'node:fs';
import path from 'node:path';

function respostaFalsa() {
  const r = { codigo: null, corpo: null };
  r.status = c => { r.codigo = c; return r; };
  r.json = d => { r.corpo = d; return r; };
  return r;
}

/* Substitui o fetch global e registra cada chamada. Devolve o registro e uma
   função para restaurar — deixar o fetch trocado vazaria para os outros
   blocos, que rodam no mesmo processo. */
function espionarFetch(respostas) {
  const chamadas = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, opcoes = {}) => {
    chamadas.push({ url: String(url), opcoes, corpo: opcoes.body ? JSON.parse(opcoes.body) : null,
                    cabecalhos: opcoes.headers || {} });
    for (const [padrao, resposta] of respostas) {
      if (String(url).indexOf(padrao) >= 0) return resposta;
    }
    return { ok: false, status: 500, json: async () => ({}), text: async () => '' };
  };
  return { chamadas, restaurar: () => { globalThis.fetch = original; } };
}

const ok = corpo => ({ ok: true, status: 200, json: async () => corpo, text: async () => JSON.stringify(corpo) });
const ruim = (status, corpo) => ({ ok: false, status, json: async () => corpo || {}, text: async () => '' });

const SUPA = 'https://projeto.supabase.co';

export default async function (ctx, url, erros) {
  const b = bloco('funções do servidor');

  const painel = (await import('../api/painel.js')).default;
  const resumo = (await import('../api/resumo.js')).default;

  const ambiente = extra => {
    process.env.SUPABASE_URL = SUPA;
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'chave-de-servico';
    process.env.ANTHROPIC_API_KEY = 'chave-da-anthropic';
    process.env.ADMIN_EMAILS = 'dono@salavox.com, socio@salavox.com';
    Object.assign(process.env, extra || {});
  };
  const limpar = () => {
    for (const k of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'ANTHROPIC_API_KEY', 'ADMIN_EMAILS'])
      delete process.env[k];
  };

  /* ---------- 0. o config.json que vai publicado ----------

     Este arquivo é o único do projeto que carrega credencial e vai inteiro para
     o navegador de qualquer visitante. Os dois valores que moram nele — a URL
     do projeto e a chave `anon` — são públicos por natureza, e é assim que o
     Supabase foi desenhado: quem protege os dados é a política de acesso do
     banco, não o segredo da chave.

     O perigo é outro, e é de um dedo só: colar aqui a chave de serviço, que
     ignora todas as políticas e lê a base inteira. As duas se parecem — ambas
     são JWT longos vindos da mesma tela do Supabase — e a diferença está dentro
     do token, no campo `role`. Então é o `role` que este teste lê.

     Antes daqui existia uma conferência de que o arquivo estava **em branco**.
     Ela morreu quando o projeto ganhou um Supabase de verdade. Esta é melhor:
     protege contra a coisa errada acontecer, não contra qualquer coisa
     acontecer. */
  const bruto = fs.readFileSync(path.join(RAIZ, 'public', 'config.json'), 'utf8');
  let cfg = null;
  try { cfg = JSON.parse(bruto); } catch (e) {}
  b.verdade('o config.json publicado é JSON válido', !!cfg);

  const papel = t => {
    const partes = String(t || '').split('.');
    if (partes.length !== 3) return null;
    try { return JSON.parse(Buffer.from(partes[1], 'base64url').toString()).role || null; }
    catch (e) { return null; }
  };
  b.conferir('a chave publicada é a anon, nunca a de serviço',
             cfg && cfg.supabaseAnonKey ? papel(cfg.supabaseAnonKey) : 'vazio', 'anon');
  b.verdade('nenhum campo do arquivo contém uma chave de serviço',
            !Object.values(cfg || {}).some(v => papel(v) === 'service_role'));
  b.verdade('e nada com cara de segredo entrou por outro nome',
            !Object.keys(cfg || {}).some(k => /service|secret|segredo|senha|anthropic|resend/i.test(k)));
  b.verdade('a URL aponta para um projeto do Supabase',
            !cfg.supabaseUrl || /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(cfg.supabaseUrl));

  /* ---------- 1. painel: sem configuração, ninguém entra ----------
     Fechado por omissão. Quem esquece de configurar fica de fora — e não
     exposto, que é o defeito que este teste existe para impedir. */
  limpar();
  process.env.SUPABASE_URL = SUPA;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'chave-de-servico';
  let res = respostaFalsa();
  await painel({ method: 'POST', headers: { authorization: 'Bearer t' }, body: {} }, res);
  b.conferir('sem ADMIN_EMAILS o painel não abre para ninguém', res.codigo, 500);
  b.conferir('e a resposta diz qual variável falta, pelo nome', res.corpo.faltando, ['ADMIN_EMAILS']);

  /* ---------- 2. painel: sessão válida de quem não administra ---------- */
  ambiente();
  let espiao = espionarFetch([[SUPA + '/auth/v1/user', ok({ id: 'u1', email: 'cliente@escritorio.com.br' })]]);
  res = respostaFalsa();
  await painel({ method: 'POST', headers: { authorization: 'Bearer token-valido' }, body: {} }, res);
  espiao.restaurar();
  b.conferir('conta comum, com sessão boa, leva 403', res.codigo, 403);
  b.conferir('e o banco não chega a ser consultado',
             espiao.chamadas.filter(c => c.url.indexOf('/rpc/') >= 0).length, 0);

  /* ---------- 3. painel: sessão inválida ---------- */
  ambiente();
  espiao = espionarFetch([[SUPA + '/auth/v1/user', ruim(401)]]);
  res = respostaFalsa();
  await painel({ method: 'POST', headers: { authorization: 'Bearer token-podre' }, body: {} }, res);
  espiao.restaurar();
  b.conferir('token que o Supabase não reconhece leva 401', res.codigo, 401);

  /* ---------- 4. painel: o administrador passa ---------- */
  ambiente();
  espiao = espionarFetch([
    [SUPA + '/auth/v1/user', ok({ id: 'u0', email: 'DONO@salavox.com' })],   // caixa alta de propósito
    ['/rpc/painel_numeros', ok({ contas: 3, assinantes: 1, tokens_ent_mes: 1000000, tokens_sai_mes: 200000,
                                 meses: [{ mes: '2026-08-01', tokens_ent: 1000000, tokens_sai: 200000 }] })]
  ]);
  res = respostaFalsa();
  await painel({ method: 'POST', headers: { authorization: 'Bearer token-do-dono' }, body: {} }, res);
  espiao.restaurar();
  b.conferir('o e-mail do administrador é comparado sem diferenciar maiúsculas', res.codigo, 200);
  /* 1.000.000 de entrada × US$ 1 + 200.000 de saída × US$ 5 = 1 + 1 = US$ 2,00 */
  b.conferir('o custo do mês é contado pelos tokens, não estimado',
             res.corpo.dinheiro.custo_ia_mes_usd, 2);
  b.conferir('a receita segue o número de assinantes', res.corpo.dinheiro.receita_mensal, 19.90);
  b.verdade('a consulta ao banco vai com a chave de serviço, nunca com o token de quem pediu',
            espiao.chamadas.some(c => c.url.indexOf('/rpc/painel_numeros') >= 0 &&
                                      c.cabecalhos.Authorization === 'Bearer chave-de-servico'));

  /* ---------- 5. painel: liberar plano tem os limites certos ---------- */
  ambiente();
  espiao = espionarFetch([
    [SUPA + '/auth/v1/user', ok({ id: 'u0', email: 'dono@salavox.com' })],
    ['/rpc/painel_liberar', ok({ achou: true })]
  ]);
  res = respostaFalsa();
  await painel({ method: 'POST', headers: { authorization: 'Bearer t' },
                 body: { acao: 'liberar', alvo: 'a@b.c', plano: 'dono_do_mundo', dias: 30 } }, res);
  b.conferir('plano fora da lista é recusado', res.codigo, 400);

  res = respostaFalsa();
  await painel({ method: 'POST', headers: { authorization: 'Bearer t' },
                 body: { acao: 'liberar', alvo: 'a@b.c', plano: 'profissional', dias: 99999 } }, res);
  espiao.restaurar();
  const pedidoLiberar = espiao.chamadas.filter(c => c.url.indexOf('painel_liberar') >= 0).pop();
  b.conferir('e um número de dias absurdo é aparado, não repassado', pedidoLiberar.corpo.p_dias, 3650);

  /* ---------- 6. resumo: a cota é consumida ANTES do dinheiro ser gasto ----------
     Este é o teste que protege o caixa. Se alguém trocar a ordem — chamar a
     Anthropic e só depois conferir a cota — tudo continua funcionando na tela,
     e cada recusa passa a custar dinheiro. */
  ambiente();
  espiao = espionarFetch([
    [SUPA + '/auth/v1/user', ok({ id: 'u9', email: 'cliente@escritorio.com.br' })],
    ['/rpc/consumir_ia', ok(-1)]                       // cota esgotada
  ]);
  res = respostaFalsa();
  await resumo({ method: 'POST', headers: { authorization: 'Bearer t' },
                 body: { prompt: 'texto da ata', modelo: 'rapido' } }, res);
  espiao.restaurar();
  b.conferir('cota esgotada devolve 402', res.codigo, 402);
  b.conferir('e a Anthropic NÃO é chamada — recusa não pode custar dinheiro',
             espiao.chamadas.filter(c => c.url.indexOf('api.anthropic.com') >= 0).length, 0);
  b.verdade('a recusa convida a assinar', /19,90/.test(res.corpo.erro));

  /* ---------- 7. resumo: caminho feliz ---------- */
  ambiente();
  espiao = espionarFetch([
    [SUPA + '/auth/v1/user', ok({ id: 'u9', email: 'cliente@escritorio.com.br' })],
    ['/rpc/consumir_ia', ok(29)],
    ['/rpc/somar_tokens', ok(null)],
    ['api.anthropic.com', ok({ content: [{ text: 'Resumo da reunião.' }],
                               usage: { input_tokens: 12000, output_tokens: 900 } })]
  ]);
  res = respostaFalsa();
  await resumo({ method: 'POST', headers: { authorization: 'Bearer t' },
                 body: { prompt: 'PARTICIPANTES: ...', modelo: 'preciso' } }, res);
  espiao.restaurar();
  b.conferir('o resumo volta com o texto e a cota restante',
             { codigo: res.codigo, texto: res.corpo.texto, restante: res.corpo.restante },
             { codigo: 200, texto: 'Resumo da reunião.', restante: 29 });

  const paraAnthropic = espiao.chamadas.find(c => c.url.indexOf('api.anthropic.com') >= 0);
  b.conferir('o modelo preciso é o Sonnet atual', paraAnthropic.corpo.model, 'claude-sonnet-5');
  b.verdade('a chave da Anthropic vai no cabeçalho, e só do servidor',
            paraAnthropic.cabecalhos['x-api-key'] === 'chave-da-anthropic');

  const tokens = espiao.chamadas.find(c => c.url.indexOf('somar_tokens') >= 0);
  b.conferir('o consumo de tokens é registrado como número, sem o texto',
             tokens.corpo, { p_perfil: 'u9', p_ent: 12000, p_sai: 900 });
  b.verdade('nenhuma chamada ao banco leva o texto da ata junto',
            !espiao.chamadas.some(c => c.url.indexOf('supabase') >= 0 &&
                                       /PARTICIPANTES/.test(JSON.stringify(c.corpo || {}))));

  /* ---------- 8. resumo: sem token não se fala com ninguém ---------- */
  ambiente();
  espiao = espionarFetch([]);
  res = respostaFalsa();
  await resumo({ method: 'POST', headers: {}, body: { prompt: 'x' } }, res);
  espiao.restaurar();
  b.conferir('sem sessão o resumo é recusado antes de qualquer chamada',
             { codigo: res.codigo, chamadas: espiao.chamadas.length }, { codigo: 401, chamadas: 0 });

  /* ---------- 9. assinar: o que sai daqui, e o que não sai ---------- */
  const assinar = (await import('../api/assinar.js')).default;
  const webhook = (await import('../api/asaas.js')).default;
  const ASAAS = 'https://api-de-teste.asaas.com/v3';

  const ambienteCobranca = () => {
    ambiente();
    process.env.ASAAS_API_KEY = 'chave-do-asaas';
    process.env.ASAAS_URL = ASAAS;
    process.env.ASAAS_WEBHOOK_TOKEN = 'segredo-do-webhook';
  };

  const perfilSemCobranca = ok([{ id: 'u7', email: 'contador@escritorio.com.br',
                                  plano: 'gratis', assinante_ate: null,
                                  cobranca_id: null, assinatura_id: null }]);

  /* Documento inválido para antes de sair daqui: o Asaas recusaria com uma
     mensagem em inglês, e uma viagem à rede para dizer "CPF errado" é uma
     viagem desperdiçada. */
  ambienteCobranca();
  espiao = espionarFetch([
    [SUPA + '/auth/v1/user', ok({ id: 'u7', email: 'contador@escritorio.com.br' })],
    [SUPA + '/rest/v1/perfis', perfilSemCobranca]
  ]);
  res = respostaFalsa();
  await assinar({ method: 'POST', headers: { authorization: 'Bearer t' },
                  body: { nome: 'Escritório Teste', documento: '111.111.111-11' } }, res);
  espiao.restaurar();
  b.conferir('CPF inválido é recusado aqui mesmo', res.codigo, 400);
  b.conferir('e o meio de pagamento não é incomodado',
             espiao.chamadas.filter(c => c.url.indexOf('asaas') >= 0).length, 0);

  /* Caminho feliz: cria o cliente, cria a assinatura, guarda a ligação e
     devolve o endereço de pagamento — sem tocar em plano nenhum. */
  ambienteCobranca();
  espiao = espionarFetch([
    [SUPA + '/auth/v1/user', ok({ id: 'u7', email: 'contador@escritorio.com.br' })],
    [SUPA + '/rest/v1/perfis', perfilSemCobranca],
    [ASAAS + '/customers', ok({ id: 'cus_123' })],
    [ASAAS + '/subscriptions/sub_9/payments', ok({ data: [{ invoiceUrl: 'https://asaas/pagar/1' }] })],
    [ASAAS + '/subscriptions', ok({ id: 'sub_9' })],
    ['/rpc/cobranca_guardar', ok(null)]
  ]);
  res = respostaFalsa();
  await assinar({ method: 'POST', headers: { authorization: 'Bearer t' },
                  body: { nome: 'Escritório Teste', documento: '390.533.447-05' } }, res);
  espiao.restaurar();
  b.conferir('a assinatura é criada e o endereço de pagamento volta',
             { codigo: res.codigo, pagar: res.corpo.pagar, valor: res.corpo.valor },
             { codigo: 200, pagar: 'https://asaas/pagar/1', valor: 19.90 });

  const cli = espiao.chamadas.find(c => c.url.endsWith('/customers'));
  b.conferir('o documento vai só com dígitos', cli.corpo.cpfCnpj, '39053344705');
  b.verdade('a chave do Asaas vai no cabeçalho próprio dele, não em Authorization',
            cli.cabecalhos.access_token === 'chave-do-asaas' && !cli.cabecalhos.Authorization);
  b.verdade('e o User-Agent exigido pelo Asaas vai junto', /^Salavox\//.test(cli.cabecalhos['User-Agent'] || ''));

  const ass = espiao.chamadas.find(c => c.url.endsWith('/subscriptions') && c.opcoes.method === 'POST');
  b.conferir('a assinatura é mensal, no valor do plano, deixando o pagador escolher como pagar',
             { value: ass.corpo.value, cycle: ass.corpo.cycle, billingType: ass.corpo.billingType },
             { value: 19.90, cycle: 'MONTHLY', billingType: 'UNDEFINED' });
  b.verdade('a ligação com o Asaas é guardada no perfil',
            espiao.chamadas.some(c => c.url.indexOf('cobranca_guardar') >= 0 &&
                                      c.corpo.p_cobranca === 'cus_123' && c.corpo.p_assinatura === 'sub_9'));
  b.conferir('nenhum plano é liberado por esta função — quem libera é o webhook',
             espiao.chamadas.filter(c => /cobranca_aplicar|painel_liberar/.test(c.url)).length, 0);

  /* ---------- 10. webhook: a porta ---------- */
  ambienteCobranca();
  espiao = espionarFetch([['/rpc/cobranca_aplicar', ok({ achou: true, repetido: false })]]);
  res = respostaFalsa();
  await webhook({ method: 'POST', headers: {},
                  body: { event: 'PAYMENT_CONFIRMED', payment: { id: 'pay_1', customer: 'cus_123' } } }, res);
  espiao.restaurar();
  b.conferir('webhook sem token é recusado', res.codigo, 401);
  b.conferir('e nada é escrito no banco', espiao.chamadas.length, 0);

  ambienteCobranca();
  espiao = espionarFetch([['/rpc/cobranca_aplicar', ok({ achou: true, repetido: false })]]);
  res = respostaFalsa();
  await webhook({ method: 'POST', headers: { 'asaas-access-token': 'chute' },
                  body: { event: 'PAYMENT_CONFIRMED', payment: { id: 'pay_1', customer: 'cus_123' } } }, res);
  espiao.restaurar();
  b.conferir('webhook com token errado também', res.codigo, 401);
  b.conferir('e continua sem escrever nada', espiao.chamadas.length, 0);

  /* ---------- 11. webhook: liberar, cortar e ignorar ---------- */
  ambienteCobranca();
  espiao = espionarFetch([['/rpc/cobranca_aplicar',
                           ok({ achou: true, repetido: false, assinante_ate: '2026-09-12T00:00:00Z' })]]);
  res = respostaFalsa();
  await webhook({ method: 'POST', headers: { 'asaas-access-token': 'segredo-do-webhook' },
                  body: { event: 'PAYMENT_CONFIRMED', payment: { id: 'pay_1', customer: 'cus_123' } } }, res);
  espiao.restaurar();
  b.conferir('pagamento confirmado libera o plano', { codigo: res.codigo, aplicado: res.corpo.aplicado },
             { codigo: 200, aplicado: true });
  const aplic = espiao.chamadas.find(c => c.url.indexOf('cobranca_aplicar') >= 0);
  b.conferir('a conta é achada pelo cliente do Asaas, e o pagamento vai junto para não contar duas vezes',
             { p_cobranca: aplic.corpo.p_cobranca, p_pagamento: aplic.corpo.p_pagamento, p_dias: aplic.corpo.p_dias },
             { p_cobranca: 'cus_123', p_pagamento: 'pay_1', p_dias: 31 });

  ambienteCobranca();
  espiao = espionarFetch([['/rpc/cobranca_revogar', ok({ achou: true })]]);
  res = respostaFalsa();
  await webhook({ method: 'POST', headers: { 'asaas-access-token': 'segredo-do-webhook' },
                  body: { event: 'PAYMENT_REFUNDED', payment: { id: 'pay_1', customer: 'cus_123' } } }, res);
  espiao.restaurar();
  b.conferir('estorno corta o acesso', { codigo: res.codigo, revogado: res.corpo.revogado },
             { codigo: 200, revogado: true });

  ambienteCobranca();
  espiao = espionarFetch([]);
  res = respostaFalsa();
  await webhook({ method: 'POST', headers: { 'asaas-access-token': 'segredo-do-webhook' },
                  body: { event: 'PAYMENT_BANK_SLIP_VIEWED', payment: { id: 'pay_1', customer: 'cus_123' } } }, res);
  espiao.restaurar();
  b.conferir('evento que não interessa é aceito e ignorado, sem tocar no banco',
             { codigo: res.codigo, chamadas: espiao.chamadas.length }, { codigo: 200, chamadas: 0 });

  /* Erro nosso não pode virar falha de entrega: quinze seguidas param a fila do
     Asaas inteira, inclusive os eventos de quem pagou certo. */
  ambienteCobranca();
  espiao = espionarFetch([['/rpc/cobranca_aplicar', ruim(500)]]);
  res = respostaFalsa();
  await webhook({ method: 'POST', headers: { 'asaas-access-token': 'segredo-do-webhook' },
                  body: { event: 'PAYMENT_CONFIRMED', payment: { id: 'pay_1', customer: 'cus_123' } } }, res);
  espiao.restaurar();
  b.conferir('banco fora do ar ainda responde 2xx, para não travar a fila do Asaas', res.codigo, 200);

  limpar();
  for (const k of ['ASAAS_API_KEY', 'ASAAS_URL', 'ASAAS_WEBHOOK_TOKEN']) delete process.env[k];
  return b;
}
