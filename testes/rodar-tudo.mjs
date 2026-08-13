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
import silencio from './t-silencio.mjs';
import painel from './t-painel.mjs';
import funcoes from './t-funcoes.mjs';
import compactacao from './t-compactacao.mjs';
import idioma from './t-idioma.mjs';

const TODOS = [
  ['telas', telas],
  ['pedacos', pedacos],
  ['recuperacao', recuperacao],
  ['extras', extras],
  ['conformidade', conformidade],
  ['conta', conta],
  ['silencio', silencio],
  ['painel', painel],
  ['funcoes', funcoes],
  ['compactacao', compactacao],
  ['idioma', idioma]
];

const pedidos = process.argv.slice(2).filter(a => !a.startsWith('--'));
// o mais demorado entra primeiro: senão ele começa por último e todo mundo espera
const DEMORA = { pedacos: 70, conta: 45, recuperacao: 31, silencio: 25, telas: 18, extras: 18,
                 conformidade: 16, painel: 10, funcoes: 2, compactacao: 20, idioma: 30 };
const TESTES = (pedidos.length ? TODOS.filter(([n]) => pedidos.includes(n)) : TODOS.slice())
  .sort((a, b) => (DEMORA[b[0]] || 0) - (DEMORA[a[0]] || 0));
const PORTA = Number(process.env.PORTA || 8131);
const UM_DE_CADA = process.env.JUNTOS === '1';

console.log(execFileSync('python3', ['build.py'], { cwd: RAIZ }).toString().trim());

/* `--disable-dev-shm-usage` não é enfeite: com onze blocos, o Chromium desta
   máquina passou a morrer no meio da faixa paralela e a corrida terminava com
   "Target page, context or browser has been closed" — que parece defeito do
   produto e é falta de memória compartilhada. */
const ARGS = ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
              '--disable-dev-shm-usage', '--disable-gpu'];

const comeco = Date.now();
const resultado = [];

/* Um navegador por bloco, e não um só para a corrida inteira.

   Com onze blocos o Chromium compartilhado passou a morrer no meio da faixa
   paralela, e a corrida terminava com "Target page, context or browser has
   been closed" — uma linha que parece defeito do produto e é o instrumento
   caindo. Abrir um navegador por bloco custa ~200 ms e faz a queda de um
   bloco ficar dentro dele. Fechar também vai dentro de try: navegador que já
   morreu não pode derrubar o relatório de quem passou. */
async function rodar([nome, teste], i, repetido = false) {
  const servidor = await servir(PORTA + i);
  const nav = await chromium.launch({ args: ARGS });
  const ctx = await nav.newContext({ permissions: ['microphone'], viewport: { width: 1100, height: 900 } });
  const erros = [];
  const t0 = Date.now();
  let b = null, quebrou = null;
  try {
    b = await teste(ctx, servidor.url, erros);
  } catch (e) {
    quebrou = e.message.split('\n')[0];
    if (process.env.PILHA) console.log(e.stack);
  }
  try { await ctx.close(); } catch (e) {}
  try { await nav.close(); } catch (e) {}
  await servidor.fechar();

  /* Uma segunda chance, e só para o navegador morrendo.

     Nesta máquina de dois núcleos o Chromium às vezes cai inteiro no meio de
     um bloco de mídia, e a mensagem que sobra — "Target page, context or
     browser has been closed" — não fala do produto, fala do instrumento.
     Repetir uma vez separa uma coisa da outra: se cair de novo, é vermelho.
     Nada mais é repetido: teste que passa na segunda tentativa por outro
     motivo é teste instável, e esconder isso seria pior que a falha. */
  const morreuONavegador = quebrou && /Target page, context or browser has been closed/.test(quebrou);
  if (morreuONavegador && !repetido) {
    console.log(`  (o navegador caiu em "${nome}" — repetindo uma vez)`);
    return rodar([nome, teste], i, true);
  }
  resultado.push({ nome, b, erros, quebrou, seg: (Date.now() - t0) / 1000 });
}

/* Duas faixas, e um bloco que roda sozinho.

   Eram três faixas enquanto a suíte tinha seis blocos. Com dez — e com a
   transcrição rodando DURANTE a gravação — três Chromiums gravando vídeo ao
   mesmo tempo saturam a máquina, e o que passa a falhar são as medições finas.
   Não é defeito do produto: é o instrumento medindo uma máquina sem fôlego.

   Três blocos precisam de mais que isso, e rodam **um de cada vez, no fim**:

     telas        a tela sintética é pintada pela linha principal da própria
                  página, a dez quadros por segundo, e capturada a oito. Com a
                  máquina disputada a pintura atrasa, um quadro pela metade é
                  gravado no lugar do preto do começo, e a varredura acha uma
                  tela a mais.
     pedacos      compara a duração do áudio com o relógio, com margem de 1,5 s
                  em 60 — a mais fina da suíte.
     recuperacao  mata a aba no meio da gravação e conta o que sobrou.

   Os três medem mídia em tempo real; os outros sete medem lógica, e lógica não
   se importa com máquina ocupada. Afrouxar as margens seria o remédio errado e
   o mais tentador — este projeto já decidiu não fazer isso. A corrida fica
   ~50 s mais longa e passa a dizer a verdade. */
const LADOS = Number(process.env.LADOS || 2);
const SOZINHOS = ['telas', 'pedacos', 'recuperacao', 'extras'];
/* `extras` entrou nesta lista depois de reprovar sozinho na corrida cheia: ele
   marca dois momentos com a mão, um no começo e um no meio, e confere se cada
   marca caiu no instante em que o clique aconteceu. Com a máquina disputada o
   clique atrasa e a marca do "meio" cai em 22 s de uma gravação de 30. A
   medição está certa; o que faltava era ela não competir por CPU. */

if (UM_DE_CADA) {
  for (let i = 0; i < TESTES.length; i++) await rodar(TESTES[i], i);
} else {
  const juntos = TESTES.map((t, i) => [t, i]).filter(([t]) => SOZINHOS.indexOf(t[0]) < 0);
  const sos    = TESTES.map((t, i) => [t, i]).filter(([t]) => SOZINHOS.indexOf(t[0]) >= 0);
  await Promise.all(Array.from({ length: Math.min(LADOS, juntos.length) }, async () => {
    while (juntos.length) { const [t, i] = juntos.shift(); await rodar(t, i); }
  }));
  for (const [t, i] of sos) await rodar(t, i);
}


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
