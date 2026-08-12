/* Captura o painel com dados de exemplo, para conferir o visual sem precisar de
   Supabase. Uso: node ferramentas/ver-painel.mjs  →  /tmp/painel.png */

import { chromium } from 'playwright';
import { servir } from '../testes/apoio.mjs';

const SUPA = 'https://demonstracao.supabase.co';
const s = await servir(8177);
const nav = await chromium.launch();
const ctx = await nav.newContext({ viewport: { width: 1200, height: 1000 }, deviceScaleFactor: 2 });
const p = await ctx.newPage();
const erros = [];
p.on('pageerror', e => erros.push(e.message));
p.on('response', r => { if (r.status() >= 400) erros.push(r.status() + ' ' + r.url()); });

await p.route('**/config.json', r => r.fulfill({ contentType: 'application/json',
  body: JSON.stringify({ supabaseUrl: SUPA, supabaseAnonKey: 'anon-de-demonstracao' }) }));
await p.route('**/api/painel', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({
  numeros: {
    mes: '2026-08-01', contas: 137, contas_no_mes: 41, assinantes: 23, vencendo_em_7: 3,
    provaram: 84, provaram_e_assinaram: 19,
    resumos_mes: 512, premium_mes: 34, emails_mes: 96,
    tokens_ent_mes: 7200000, tokens_sai_mes: 610000,
    meses: [
      { mes: '2026-03-01', resumos: 18,  premium: 0, emails: 1,  tokens_ent: 240000,  tokens_sai: 20000,  pessoas: 3 },
      { mes: '2026-04-01', resumos: 63,  premium: 2, emails: 8,  tokens_ent: 880000,  tokens_sai: 74000,  pessoas: 9 },
      { mes: '2026-05-01', resumos: 145, premium: 6, emails: 21, tokens_ent: 2000000, tokens_sai: 170000, pessoas: 17 },
      { mes: '2026-06-01', resumos: 268, premium: 14, emails: 44, tokens_ent: 3700000, tokens_sai: 310000, pessoas: 29 },
      { mes: '2026-07-01', resumos: 401, premium: 25, emails: 71, tokens_ent: 5600000, tokens_sai: 470000, pessoas: 38 },
      { mes: '2026-08-01', resumos: 512, premium: 34, emails: 96, tokens_ent: 7200000, tokens_sai: 610000, pessoas: 46 }
    ],
    ultimas: [
      { email: 'ana.ribeiro@contabilidaderibeiro.com.br', plano: 'profissional', assinante_ate: '2026-09-11T00:00:00Z', criado_em: '2026-08-11T14:02:00Z' },
      { email: 'contato@escritoriomartins.com.br', plano: 'gratis', assinante_ate: null, criado_em: '2026-08-11T09:40:00Z' },
      { email: 'j.pereira@perezcontabil.com.br', plano: 'profissional', assinante_ate: '2026-08-29T00:00:00Z', criado_em: '2026-08-10T18:15:00Z' },
      { email: 'financeiro@grupovertice.com.br', plano: 'gratis', assinante_ate: null, criado_em: '2026-08-10T11:03:00Z' }
    ]
  },
  dinheiro: { receita_mensal: 23 * 19.90, custo_ia_mes_usd: (7200000 * 1 + 610000 * 5) / 1e6,
              precos_usd_por_milhao: { rapido: { entrada: 1, saida: 5 } }, mensalidade: 19.90 },
  meses: [
    { mes: '2026-03-01', custo_usd: 0.34, pessoas: 3 },  { mes: '2026-04-01', custo_usd: 1.25, pessoas: 9 },
    { mes: '2026-05-01', custo_usd: 2.85, pessoas: 17 }, { mes: '2026-06-01', custo_usd: 5.25, pessoas: 29 },
    { mes: '2026-07-01', custo_usd: 7.95, pessoas: 38 }, { mes: '2026-08-01', custo_usd: 10.25, pessoas: 46 }
  ].map((m, i) => ({ ...m, resumos: [18, 63, 145, 268, 401, 512][i] }))
}) }));

await p.goto(s.url + '/painel#access_token=demonstracao&refresh_token=r');
await p.waitForFunction(() => !document.getElementById('conteudo').classList.contains('hide'), null, { timeout: 15000 });
await p.waitForTimeout(400);
await p.screenshot({ path: '/tmp/painel.png', fullPage: true });
console.log('erros:', erros.length ? erros : 'nenhum');
await nav.close(); await s.fechar();
