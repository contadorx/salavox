/* Constrói, sobe o que acabou de ser construído e roda as verificações.

   Duas decisões de velocidade:

   1. Os blocos rodam EM PARALELO, cada um com o seu próprio servidor numa porta
      diferente. Porta diferente é origem diferente, e origem diferente é
      armazenamento diferente — sem isso um bloco apagaria a gravação do outro no
      meio do caminho. O ganho é grande: antes o relógio somava a duração de
      todas as gravações; agora é a mais longa delas.

   2. Cada bloco imprime quanto levou. Sem número não há como decidir onde
      cortar, e cortar no escuro tira justamente a verificação que estava
      segurando alguma coisa.

   Sai com código diferente de zero quando falha — é isso que permite dizer
   "passou" sem ter olhado a tela.

   Uso:
     node testes/rodar-tudo.mjs              tudo, em paralelo
     node testes/rodar-tudo.mjs telas ia     só os blocos pedidos
     JUNTOS=1 node testes/rodar-tudo.mjs     um de cada vez (para depurar)
*/

import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { servir, RAIZ } from './apoio.mjs';
import telas from './t-telas.mjs';
import pedacos from './t-pedacos.mjs';
import recuperacao from './t-recuperacao.mjs';
import extras from './t-extras.mjs';
import conformidade from './t-conformidade.mjs';
import conta from './t-conta.mjs';

const TODOS = [
  ['telas', telas],
  ['pedacos', pedacos],
  ['recuperacao', recuperacao],
  ['extras', extras],
  ['conformidade', conformidade],
  ['conta', conta]
];

const pedidos = process.argv.slice(2).filter(a => !a.startsWith('--'));
// o mais demorado entra primeiro: senão ele começa por último e todo mundo espera
const DEMORA = { pedacos: 70, conta: 45, recuperacao: 31, telas: 18, extras: 18, conformidade: 16 };
const TESTES = (pedidos.length ? TODOS.filter(([n]) => pedidos.includes(n)) : TODOS.slice())
  .sort((a, b) => (DEMORA[b[0]] || 0) - (DEMORA[a[0]] || 0));
const PORTA = Number(process.env.PORTA || 8131);
const UM_DE_CADA = process.env.JUNTOS === '1';

console.log(execFileSync('python3', ['build.py'], { cwd: RAIZ }).toString().trim());

const nav = await chromium.launch({
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream']
});

const comeco = Date.now();
const resultado = [];

async function rodar([nome, teste], i) {
  const servidor = await servir(PORTA + i);
  const ctx = await nav.newContext({ permissions: ['microphone'], viewport: { width: 1100, height: 900 } });
  const erros = [];
  const t0 = Date.now();
  let b = null, quebrou = null;
  try {
    b = await teste(ctx, servidor.url, erros);
  } catch (e) {
    quebrou = e.message.split('\n')[0];
  }
  await ctx.close();
  await servidor.fechar();
  resultado.push({ nome, b, erros, quebrou, seg: (Date.now() - t0) / 1000 });
}

/* Três de cada vez, não seis. Estes testes gravam mídia em tempo real: com a
   máquina saturada o navegador perde quadros, a tela sintética troca de slide
   sem ser capturada, e o teste acusa defeito que não existe. Três foi o número
   em que a suíte ficou verde três corridas seguidas nesta máquina. */
const LADOS = Number(process.env.LADOS || 3);

if (UM_DE_CADA) {
  for (let i = 0; i < TESTES.length; i++) await rodar(TESTES[i], i);
} else {
  const fila = TESTES.map((t, i) => [t, i]);
  await Promise.all(Array.from({ length: Math.min(LADOS, fila.length) }, async () => {
    while (fila.length) { const [t, i] = fila.shift(); await rodar(t, i); }
  }));
}

await nav.close();

let falhou = false;
const ordem = TESTES.map(([n]) => n);
resultado.sort((a, b) => ordem.indexOf(a.nome) - ordem.indexOf(b.nome));

for (const r of resultado) {
  if (r.quebrou) {
    console.log(`\n■ ${r.nome}  (${r.seg.toFixed(0)}s)\n  ✗ o teste quebrou: ${r.quebrou}`);
    falhou = true;
    continue;
  }
  console.log(`\n■ ${r.b.nome}  (${r.seg.toFixed(0)}s)`);
  for (const i of r.b.itens)
    console.log(`  ${i.ok ? '✓' : '✗'} ${i.oque}` +
      (i.ok ? `  →  ${JSON.stringify(i.real)}` : `\n      esperado: ${JSON.stringify(i.esperado)}\n      obtido:   ${JSON.stringify(i.real)}`));
  if (r.erros.length) { console.log('  ✗ erros no console da página:'); r.erros.forEach(e => console.log('      ' + e)); }
  if (!r.b.passou || r.erros.length) falhou = true;
}

/* Resumo no fim, para que um `| tail` mostre o que falhou sem obrigar a rolar
   a saída inteira. Já perdi uma corrida vermelha por não ver a linha que
   importava. */
console.log('\n' + '─'.repeat(56));
for (const r of resultado) {
  const falhas = r.quebrou ? [r.quebrou]
    : r.b.itens.filter(i => !i.ok).map(i => i.oque).concat(r.erros);
  console.log((falhas.length ? `✗ ${r.nome}: ${falhas.join(' | ')}` : `✓ ${r.nome}`) +
              `   (${r.seg.toFixed(0)}s)`);
}
console.log(`\nRESULTADO: ${falhou ? 'falhou' : 'passou'} em ${((Date.now() - comeco) / 1000).toFixed(0)}s` +
            (UM_DE_CADA ? ' (um de cada vez)' : ' (em paralelo)'));
process.exit(falhou ? 1 : 0);
