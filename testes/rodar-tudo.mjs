/* Constrói, sobe o que acabou de ser construído e roda as verificações.
   Sai com código diferente de zero se qualquer uma falhar — é isso que
   permite dizer "passou" sem ter olhado a tela. */

import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { servir, RAIZ } from './apoio.mjs';
import telas from './t-telas.mjs';
import pedacos from './t-pedacos.mjs';
import recuperacao from './t-recuperacao.mjs';

const SO = process.argv[2];                       // roda um teste só, pelo nome
const PORTA = Number(process.env.PORTA || 8131);

const TESTES = [
  ['telas', telas],
  ['pedacos', pedacos],
  ['recuperacao', recuperacao]
].filter(([n]) => !SO || n === SO);

console.log(execFileSync('python3', ['build.py'], { cwd: RAIZ }).toString().trim());

const servidor = await servir(PORTA);
const nav = await chromium.launch({
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream']
});

let falhou = false;
for (const [nome, teste] of TESTES) {
  const erros = [];
  const ctx = await nav.newContext({ permissions: ['microphone'], viewport: { width: 1100, height: 900 } });
  let b;
  try {
    b = await teste(ctx, servidor.url, erros);
  } catch (e) {
    console.log(`\n■ ${nome}\n  ✗ o teste quebrou: ${e.message.split('\n')[0]}`);
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
  if (!b.passou || erros.length) falhou = true;
}

await nav.close();
await servidor.fechar();

console.log(falhou ? '\nRESULTADO: falhou' : '\nRESULTADO: passou');
process.exit(falhou ? 1 : 0);
