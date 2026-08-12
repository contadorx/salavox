/* Captura a ferramenta inteira, com uma reunião de exemplo já processada, para
   conferir o visual depois de mexer nele. Reclama de qualquer erro de console
   ou recurso faltando — imagem que não existe é o erro que ninguém percebe.

   Uso: node ferramentas/ver-app.mjs   →   /tmp/app-cheio.png */

import { chromium } from 'playwright';
import { servir } from '../testes/apoio.mjs';
import { telaFalsa, paginaLimpa, transcrever } from '../testes/apoio.mjs';

const s = await servir(8175);
const nav = await chromium.launch({
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream']
});
const ctx = await nav.newContext({ permissions: ['microphone'], viewport: { width: 1000, height: 900 }, deviceScaleFactor: 2 });
const erros = [];
const p = await paginaLimpa(ctx, erros);
p.on('response', r => { if (r.status() >= 400) erros.push(r.status() + ' ' + r.url()); });
await p.addInitScript(telaFalsa(4));

/* A camada paga é fingida aqui só para que o cartão de resumo apareça na
   captura: sem configuração ele não existe, que é o certo, e a imagem sairia
   sem a parte que mais se olha. */
const SUPA = 'https://demonstracao.supabase.co';
await p.route('**/config.json', r => r.fulfill({ contentType: 'application/json',
  body: JSON.stringify({ supabaseUrl: SUPA, supabaseAnonKey: 'anon-de-demonstracao' }) }));
await p.route(SUPA + '/rest/v1/perfis**', r => r.fulfill({ contentType: 'application/json',
  body: JSON.stringify([{ email: 'voce@escritorio.com.br', plano: 'profissional',
    assinante_ate: new Date(Date.now() + 30 * 86400000).toISOString() }]) }));
await p.route('**/api/resumo', r => r.fulfill({ contentType: 'application/json',
  body: JSON.stringify({ restante: 27, texto:
    'Assuntos: apuração de março, parcelamento do ISS e a troca do certificado digital (02:14).\n' +
    'Decisões: o parcelamento vai em 12 vezes (05:41); o certificado A1 fica no escritório (08:02).\n' +
    'Pendências: enviar o balancete até sexta — responsável: você (09:30).' }) }));

await p.goto(s.url + '/app#access_token=exemplo&refresh_token=exemplo');

await p.check('#okConsent');
await p.click('#rec');
await p.waitForFunction(() => !document.getElementById('stop').classList.contains('hide'), { timeout: 20000 });
await p.waitForTimeout(4000);
await p.screenshot({ path: '/tmp/app-gravando.png', fullPage: true });
await p.waitForTimeout(9000);
await p.click('#stop');
await p.waitForFunction(() => /pronta|vazia/.test(document.getElementById('recMsg').textContent), { timeout: 60000 });
await transcrever(p);
await p.click('#varrer');
await p.waitForFunction(() => document.querySelector('#telasMsg .ok') || document.querySelector('#telasMsg .err'), { timeout: 180000 });
await p.click('#iaResumo');
await p.waitForFunction(() => document.querySelector('#iaSaida .resumo'), null, { timeout: 30000 });
await p.evaluate(() => { document.getElementById('ata').style.maxHeight = 'none'; });
await p.waitForTimeout(300);
await p.screenshot({ path: '/tmp/app-cheio.png', fullPage: true });
/* A captura de página inteira do Chrome perde a barra fixa do topo quando ela
   usa desfoque de fundo. Já me fez procurar defeito onde não havia: esta
   segunda captura, do tamanho da janela, mostra a barra como ela é. */
await p.evaluate(() => window.scrollTo(0, 0));
await p.waitForTimeout(200);
await p.screenshot({ path: '/tmp/app-topo.png' });

console.log('erros:', erros.length ? erros : 'nenhum');
await nav.close(); await s.fechar();
