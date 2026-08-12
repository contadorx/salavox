/* Captura a página inicial inteira, no tema claro e no escuro, e reclama de
   qualquer erro de console ou recurso faltando. Serve para conferir a página
   depois de mexer nela — inclusive imagem que não existe, que é o erro que
   ninguém percebe até alguém abrir o site.

   Uso: node ferramentas/ver-home.mjs   →   /tmp/home-clara.png e /tmp/home-escura.png */

import { chromium } from 'playwright';
import { servir } from '../testes/apoio.mjs';
const s = await servir(8171);
const b = await chromium.launch();
for (const [nome, esquema] of [['home-clara','light'],['home-escura','dark']]) {
  const ctx = await b.newContext({ viewport:{width:1080,height:1000}, deviceScaleFactor:2, colorScheme:esquema });
  const p = await ctx.newPage();
  const erros = [];
  p.on('pageerror', e => erros.push(e.message));
  p.on('response', r => { if (r.status() >= 400) erros.push(r.status() + ' ' + r.url()); });
  await p.goto(s.url + '/');
  await p.waitForTimeout(1200);
  await p.screenshot({ path: `/tmp/${nome}.png`, fullPage: true });
  console.log(nome, erros.length ? erros : 'sem erro');
  await ctx.close();
}
await b.close(); await s.fechar();
