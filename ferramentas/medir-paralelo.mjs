/* Linha do tempo de uma gravação, para ver o que acontece em paralelo.

   Existe porque "roda durante a reunião" é uma afirmação, e afirmação sobre
   tempo se confere com relógio. Ele grava 90 segundos e imprime, com carimbo
   de hora, quando o modelo começou a ser preparado, quando ficou pronto, e
   cada janela de 30 s que virou texto ENQUANTO a gravação continuava — mais o
   número de chamadas ao modelo antes e depois do passo 2.

   Foi ele que pegou dois defeitos: a tela dizendo "na processador" e a
   mensagem voltando para "preparando o modelo" numa reunião encerrada.

   Uso:  node ferramentas/medir-paralelo.mjs                                */
import { chromium } from 'playwright';
import { servir, telaFalsa, MODELO_FALSO } from '../testes/apoio.mjs';

const s = await servir(8360);
const nav = await chromium.launch({ args: ['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--disable-dev-shm-usage','--disable-gpu'] });
const ctx = await nav.newContext({ permissions: ['microphone'] });
const p = await ctx.newPage();
await p.route('**/@huggingface/transformers@**', r => r.fulfill(MODELO_FALSO));
await p.addInitScript(() => { try { localStorage.setItem('salavox.idioma','pt'); } catch(e){} });
await p.addInitScript(telaFalsa(9));
await p.goto(s.url + '/app');
await p.check('#okConsent');

const t0 = Date.now();
const marca = (o) => console.log(String(((Date.now()-t0)/1000).toFixed(1)).padStart(6) + 's  ' + o);

await p.click('#rec');
await p.waitForFunction(() => !document.getElementById('stop').classList.contains('hide'), null, {timeout:20000});
marca('gravação começou');

let ultimoVivo = '', ultimaBaixa = '', ultimosPedidos = 0, ultimasFeitas = -1;
const relogio = setInterval(async () => {
  try {
    const e = await p.evaluate(() => ({
      seg: document.getElementById('tempo').textContent,
      vivo: (document.getElementById('vivoMsg').textContent || '').trim(),
      baixa: (document.getElementById('baixaMsg').textContent || '').trim(),
      pedidos: window.__salavox.pedidosAoModelo(),
      v: window.__salavox.vivo()
    }));
    if (e.baixa && e.baixa !== ultimaBaixa) { ultimaBaixa = e.baixa; marca('baixaMsg: ' + e.baixa.slice(0,80)); }
    if (e.vivo && e.vivo !== ultimoVivo) { ultimoVivo = e.vivo; marca('vivoMsg: ' + e.vivo.slice(0,80)); }
    if (e.pedidos !== ultimosPedidos) { ultimosPedidos = e.pedidos; marca('pedidos ao modelo: ' + e.pedidos + '  (relógio ' + e.seg + ')'); }
    if (e.v && e.v.proxima !== ultimasFeitas) { ultimasFeitas = e.v.proxima; marca('janelas vivas prontas: ' + e.v.proxima + '  ativo=' + e.v.ativo); }
  } catch (err) {}
}, 500);

await p.waitForTimeout(92000);
await p.click('#stop');
await p.waitForFunction(() => /pronta|vazia/.test(document.getElementById('recMsg').textContent), null, {timeout:60000});
clearInterval(relogio);
marca('gravação encerrada');
marca('vivoMsg final: ' + (await p.textContent('#vivoMsg')).trim().slice(0,120));

const antes = await p.evaluate(() => window.__salavox.pedidosAoModelo());
marca('pedidos ao modelo ANTES do passo 2: ' + antes);

const t1 = Date.now();
await p.evaluate(() => { document.getElementById('trMsg').textContent = ''; });
await p.click('#trans');
await p.waitForFunction(() => /Ata pronta|Não consegui/.test(document.getElementById('trMsg').textContent), null, {timeout:180000});
marca('passo 2 terminou em ' + ((Date.now()-t1)/1000).toFixed(1) + 's');
marca('pedidos ao modelo DEPOIS: ' + await p.evaluate(() => window.__salavox.pedidosAoModelo()));
marca('mensagem: ' + (await p.textContent('#trMsg')).trim().slice(0,160));

await nav.close(); await s.fechar();
