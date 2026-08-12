/* Constrói, sobe o que acabou de ser construído e roda as verificações.
   Sai com código diferente de zero se qualquer uma falhar — é isso que
   permite dizer "passou" sem ter olhado a tela. */

import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { servir, RAIZ } from './apoio.mjs';
import telas from './t-telas.mjs';
import pedacos from './t-pedacos.mjs';
import recuperacao from './t-recuperacao.mjs';
import extras from './t-extras.mjs';

const SO = process.argv[2];                       // roda um teste só, pelo nome
const PORTA = Number(process.env.PORTA || 8131);

const TESTES = [
  ['telas', telas],
  ['pedacos', pedacos],
  ['recuperacao', recuperacao],
  ['extras', extras]
].filter(([n]) => !SO || n === SO);

console.log(execFileSync('python3', ['build.py'], { cwd: RAIZ }).toString().trim());

const servidor = await servir(PORTA);
const nav = await chromium.launch({
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream']
});

let falhou = false;
const resumo = [];
for (const [nome, teste] of TESTES) {
  const erros = [];
  const ctx = await nav.newContext({ permissions: ['microphone'], viewport: { width: 1100, height: 900 } });
  let b;
  try {
    b = await teste(ctx, servidor.url, erros);
  } catch (e) {
    console.log(`\n■ ${nome}\n  ✗ o teste quebrou: ${e.message.split('\n')[0]}`);
    resumo.push([nome, ['o teste quebrou: ' + e.message.split('\n')[0]]]);
    falhou = true;
    await ctx.close();
    continue;
  }
  await ctx.close();

  console.log(`\n■ ${b.nome}`);
  for (const i of b.itens)
    console.log(`  ${i.ok ? '✓' : '✗'} ${i.oque}` +
      (i.ok ? `  →  ${JSON.stringify(i.real)}` : `\n      esperado: ${JSON.stringify(i.esperado)}\n      obtido:   ${JSON.stringify(i.real)}`));
  if (erros.length) { console.log('  ✗ erros no console da página:'); erros.forEach(e => console.log('      ' + e)); }
  resumo.push([nome, b.itens.filter(i => !i.ok).map(i => i.oque).concat(erros)]);
  if (!b.passou || erros.length) falhou = true;
}

await nav.close();
await servidor.fechar();

/* Resumo no fim, para que um `| tail` mostre o que falhou sem obrigar a rolar
   a saída inteira. Já perdi uma corrida vermelha por não ver a linha que
   importava. */
console.log('\n' + '─'.repeat(56));
for (const [nome, falhas] of resumo)
  console.log(falhas.length ? `✗ ${nome}: ${falhas.join(' | ')}` : `✓ ${nome}`);
console.log(falhou ? '\nRESULTADO: falhou' : '\nRESULTADO: passou');
process.exit(falhou ? 1 : 0);
