/* Painel de negócio: a única tela do Salavox que lê a base inteira.

   O que este bloco guarda não é o desenho — é a tranca e a aritmética.

   A tranca: sem sessão o painel não mostra número nenhum, e uma conta que não
   está em ADMIN_EMAILS leva 403 e continua sem ver nada. Isso é conferido do
   lado do navegador; do lado do servidor a mesma regra está em api/painel.js,
   e as funções de banco têm execução revogada de quem não é a chave de serviço
   (migrations/003-painel.sql.txt). Três voltas, e esta aqui é a primeira.

   A aritmética: margem, conversão e custo em reais são contas que ninguém
   confere de olho depois de prontas — e um painel que erra a margem é pior do
   que não ter painel, porque decisão de preço se toma em cima dele. Os valores
   golden abaixo estão escritos à mão. */

import { paginaLimpa, bloco } from './apoio.mjs';

const SUPA = 'https://projeto-de-teste.supabase.co';

/* Um mês de operação inventado, com números redondos de propósito: assim a
   conta esperada dá para fazer de cabeça e o golden não vira "o que o código
   devolveu daquela vez". */
const NUMEROS = {
  mes: '2026-08-01',
  contas: 40, contas_no_mes: 12,
  assinantes: 10, vencendo_em_7: 2,
  provaram: 20, provaram_e_assinaram: 5,
  resumos_mes: 300, premium_mes: 7, emails_mes: 18,
  tokens_ent_mes: 4000000, tokens_sai_mes: 400000,
  meses: [
    { mes: '2026-06-01', resumos: 40,  premium: 1, emails: 2,  tokens_ent: 500000,  tokens_sai: 50000,  pessoas: 4 },
    { mes: '2026-07-01', resumos: 120, premium: 3, emails: 9,  tokens_ent: 1500000, tokens_sai: 150000, pessoas: 9 },
    { mes: '2026-08-01', resumos: 300, premium: 7, emails: 18, tokens_ent: 4000000, tokens_sai: 400000, pessoas: 21 }
  ],
  ultimas: [
    { email: 'ana@escritorio.com.br', plano: 'profissional', assinante_ate: '2026-09-30T00:00:00Z', criado_em: '2026-08-01T10:00:00Z' },
    { email: 'bruno@contabil.com.br', plano: 'gratis', assinante_ate: null, criado_em: '2026-08-02T10:00:00Z' }
  ]
};

/* Haiku: US$ 1 por milhão na entrada, US$ 5 na saída.
   4.000.000 × 1 / 1e6 = 4,00   +   400.000 × 5 / 1e6 = 2,00   =   US$ 6,00 */
const CUSTO_USD = 6;
const RECEITA = 10 * 19.90;                        // 10 assinantes = R$ 199,00
const DOLAR = 5;                                   // fixado pelo teste, não pela cotação do dia
const MARGEM = (RECEITA - CUSTO_USD * DOLAR) / RECEITA * 100;   // (199 − 30) / 199 = 84,9%

export default async function (ctx, url, erros) {
  const b = bloco('painel de negócio');

  const p = await paginaLimpa(ctx, erros);
  const enviados = [];
  let admin = false;

  await p.route('**/config.json', r => r.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ supabaseUrl: SUPA, supabaseAnonKey: 'anon-de-teste' })
  }));
  await p.route(SUPA + '/auth/v1/otp', r => r.fulfill({ contentType: 'application/json', body: '{}' }));
  await p.route('**/api/painel', r => {
    const req = r.request();
    const corpo = req.postDataJSON();
    enviados.push({ corpo, auth: req.headers()['authorization'] });
    if (!admin) {
      return r.fulfill({ status: 403, contentType: 'application/json',
        body: JSON.stringify({ erro: 'esta conta não administra o Salavox' }) });
    }
    if (corpo.acao === 'conta') {
      return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ conta: {
        achou: corpo.alvo === 'ana@escritorio.com.br',
        email: 'ana@escritorio.com.br', plano: 'profissional',
        assinante_ate: '2026-09-30T00:00:00Z', criado_em: '2026-08-01T10:00:00Z',
        cortesia_usada: 3,
        uso: [{ mes: '2026-08-01', resumos: 12, premium: 1, emails: 3, tokens_ent: 90000, tokens_sai: 9000 }]
      } }) });
    }
    if (corpo.acao === 'liberar' || corpo.acao === 'zerar') {
      return r.fulfill({ contentType: 'application/json', body: JSON.stringify({
        feito: { achou: true, plano: corpo.plano, assinante_ate: '2026-10-30T00:00:00Z', zerado: '2026-08-01' }
      }) });
    }
    return r.fulfill({ contentType: 'application/json', body: JSON.stringify({
      numeros: NUMEROS,
      dinheiro: { receita_mensal: RECEITA, custo_ia_mes_usd: CUSTO_USD,
                  precos_usd_por_milhao: { rapido: { entrada: 1, saida: 5 } }, mensalidade: 19.90 },
      meses: NUMEROS.meses.map(m => ({ ...m,
        custo_usd: (m.tokens_ent * 1 + m.tokens_sai * 5) / 1e6 }))
    }) });
  });

  /* ---------- 1. sem sessão, nada ---------- */
  await p.goto(url + '/painel');
  await p.waitForFunction(() => !!window.__painel, null, { timeout: 15000 });
  b.verdade('sem entrar, o painel não mostra número nenhum', await p.isHidden('#conteudo'));
  b.verdade('e oferece a entrada por link de e-mail', !(await p.isHidden('#entrar')));
  b.conferir('nem chega a perguntar ao servidor', enviados.length, 0);

  await p.fill('#email', 'quemquer@exemplo.com');
  await p.click('#pedirLink');
  await p.waitForFunction(() => /Link enviado|não consegui/.test(document.getElementById('entrarMsg').textContent),
                          null, { timeout: 15000 });
  b.verdade('pedir o link não exige senha', /Link enviado/.test(await p.textContent('#entrarMsg')));

  /* ---------- 2. sessão de quem não é administrador ---------- */
  await p.goto(url + '/painel#access_token=token-de-gente-comum&refresh_token=r');
  await p.waitForFunction(() => /não administra|servidor respondeu/.test(
    document.getElementById('entrarMsg').textContent), null, { timeout: 15000 }).catch(() => {});
  b.verdade('conta comum leva recusa e continua sem ver o painel',
            (await p.isHidden('#conteudo')) &&
            /não administra/.test(await p.textContent('#entrarMsg')));
  b.verdade('a recusa veio do servidor, com o token junto',
            enviados.length === 1 && /^Bearer token-de-gente-comum$/.test(enviados[0].auth || ''));

  /* ---------- 3. administrador ---------- */
  admin = true;
  await p.evaluate(d => localStorage.setItem('salavox.dolar', String(d)), DOLAR);
  await p.goto(url + '/painel#access_token=token-do-dono&refresh_token=r');
  await p.waitForFunction(() => !document.getElementById('conteudo').classList.contains('hide'),
                          null, { timeout: 15000 });
  b.verdade('o token some da barra de endereço', !(await p.evaluate(() => location.hash)));

  const tiles = await p.$$eval('#tiles .tile', e => e.map(x => ({
    rot: x.querySelector('.rot').textContent, num: x.querySelector('.num').textContent,
    pe: x.querySelector('.pe').textContent })));
  const pega = r => (tiles.find(t => t.rot === r) || {});

  b.conferir('contas', pega('contas').num, '40');
  b.conferir('assinantes', pega('assinantes').num, '10');
  b.conferir('receita mensal, com dez assinantes a R$ 19,90', pega('receita mensal').num, 'R$ 199,00');
  b.conferir('custo de IA do mês convertido em reais', pega('custo de IA no mês').num, 'R$ 30,00');
  b.conferir('margem calculada sobre a receita, com vírgula como manda o português',
             pega('margem').num, MARGEM.toFixed(1).replace('.', ',') + '%');
  b.conferir('conversão de quem provou a cortesia', pega('provaram a IA').pe, '25% viraram assinantes');
  b.verdade('e o vencimento próximo é avisado', /2 vencem em 7 dias/.test(pega('assinantes').pe));

  /* ---------- 4. os gráficos ----------
     Uma série por gráfico e nenhum eixo duplo: resumos e dólares não podem
     dividir a mesma altura. O que se confere aqui é a geometria — a barra do
     maior valor é a mais alta, e todas partem da mesma base. */
  const barras = await p.$$eval('#grResumos rect.b', e => e.map(x => ({
    y: +x.getAttribute('y'), h: +x.getAttribute('height'), rx: +x.getAttribute('rx') })));
  b.conferir('três meses viram três barras', barras.length, 3);
  b.verdade('a barra do maior mês é a mais alta',
            barras[2].h > barras[1].h && barras[1].h > barras[0].h);
  b.verdade('todas terminam na mesma base',
            new Set(barras.map(x => Math.round(x.y + x.h))).size === 1);
  b.conferir('a ponta é arredondada em 4px', [...new Set(barras.map(x => x.rx))], [4]);
  b.conferir('há dois gráficos, um por medida — nunca dois eixos no mesmo',
             await p.$$eval('svg.gr', e => e.length), 2);
  b.verdade('o custo do mês corrente aparece rotulado no gráfico de custo',
            /US\$ 6,00/.test(await p.textContent('#grCusto')));
  b.verdade('e cada gráfico oferece a tabela equivalente',
            (await p.$$eval('#grResumos details', e => e.length)) === 1);

  b.verdade('as últimas contas aparecem com o plano',
            /ana@escritorio\.com\.br/.test(await p.textContent('#ultimas')));

  /* ---------- 5. atendimento ---------- */
  await p.fill('#alvo', 'ana@escritorio.com.br');
  await p.click('#buscar');
  await p.waitForFunction(() => /cortesias usadas/.test(document.getElementById('conta').textContent),
                          null, { timeout: 15000 });
  b.verdade('a conta procurada mostra plano, validade e cortesia usada',
            /profissional/.test(await p.textContent('#conta')) &&
            /3 de 3 cortesias usadas/.test(await p.textContent('#conta')));

  p.on('dialog', d => d.accept());
  await p.fill('#dias', '60');
  await p.click('#liberar');
  await p.waitForFunction(() => /Feito|não achei|respondeu/.test(document.getElementById('opMsg').textContent),
                          null, { timeout: 15000 });
  const liberou = enviados.filter(e => e.corpo.acao === 'liberar').pop();
  b.conferir('liberar manda e-mail, plano e dias exatamente como estão na tela',
             { alvo: liberou.corpo.alvo, plano: liberou.corpo.plano, dias: liberou.corpo.dias },
             { alvo: 'ana@escritorio.com.br', plano: 'profissional', dias: 60 });
  b.verdade('e a tela confirma com a nova validade', /Feito/.test(await p.textContent('#opMsg')));

  await p.click('#zerar');
  await p.waitForFunction(() => /zerada|não achei|respondeu/.test(document.getElementById('opMsg').textContent),
                          null, { timeout: 15000 });
  const zerou = enviados.filter(e => e.corpo.acao === 'zerar').pop();
  b.conferir('zerar manda só o e-mail', zerou.corpo.alvo, 'ana@escritorio.com.br');

  /* ---------- 6. o painel não é indexável ---------- */
  b.verdade('a página pede para não ser indexada',
            await p.evaluate(() => {
              const m = document.querySelector('meta[name="robots"]');
              return !!m && /noindex/.test(m.content);
            }));

  await p.close();
  return b;
}
