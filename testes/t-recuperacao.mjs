/* Recuperação: a aba morre no meio da reunião e o que já foi gravado precisa
   estar lá quando a página abrir de novo.

   Isto só funciona porque cada pedaço é fechado no disco assim que chega. Se
   alguém trocar a escrita por um fluxo mantido aberto até o fim — que é o
   caminho mais natural de escrever esse código — a gravação continua saindo
   perfeita ao encerrar normalmente, e some inteira quando o navegador cai.
   Este teste existe para pegar exatamente essa troca. */

import { telaFalsa, paginaLimpa, bloco, transcrever } from './apoio.mjs';

const ATE = 25;

export default async function (ctx, url, erros) {
  const b = bloco('recuperação de gravação interrompida');

  let p = await paginaLimpa(ctx, erros);
  await p.addInitScript(telaFalsa(10));
  await p.goto(url + '/app');
  await p.check('#okConsent');
  await p.click('#rec');
  await p.waitForFunction(() => !document.getElementById('stop').classList.contains('hide'), null, { timeout: 20000 });
  await p.waitForFunction(seg => {
    const t = document.getElementById('tempo').textContent.split(':').map(Number);
    return t[0] * 60 + t[1] >= seg;
  }, ATE, { timeout: 60000 });
  await p.close();                       // sem encerrar: é o caso do travamento

  p = await paginaLimpa(ctx, erros);
  await p.addInitScript(telaFalsa(10));
  await p.goto(url + '/app');
  const apareceu = await p.waitForSelector('#recupCard:not(.hide)', { timeout: 15000 }).then(() => true, () => false);
  b.verdade('a página oferece a gravação interrompida', apareceu);
  if (!apareceu) { await p.close(); return b; }

  await p.click('#recupUsar');
  await p.waitForFunction(() => !document.getElementById('trans').disabled, null, { timeout: 30000 });

  const seg = await p.evaluate(() => window.__salavox.pcm().size / 4 / 16000);
  b.entre('segundos de áudio recuperados dos 25 gravados', seg, 20, 25.5);
  b.verdade('o cartão de telas volta disponível', !(await p.isHidden('#telasCard')));

  await transcrever(p);
  b.verdade('dá para transcrever o material recuperado', /Ata pronta/.test(await p.textContent('#trMsg')));

  await p.click('#varrer');
  await p.waitForFunction(() => document.querySelector('#telasMsg .ok') || document.querySelector('#telasMsg .err'), null, { timeout: 180000 });
  const telas = await p.$$eval('.telas figure', e => e.length);
  b.entre('telas encontradas no vídeo recuperado', telas, 2, 4);

  await p.close();

  p = await paginaLimpa(ctx, erros);
  await p.goto(url + '/app');
  await p.waitForSelector('#recupCard:not(.hide)', { timeout: 15000 });
  await p.click('#recupApagar');
  await p.waitForFunction(() => document.getElementById('recupCard').classList.contains('hide'), null, { timeout: 15000 });
  const sobrou = await p.evaluate(async () => {
    const dir = await navigator.storage.getDirectory(); let n = 0;
    for await (const _ of dir.keys()) n++; return n;
  });
  b.conferir('apagar limpa o armazenamento por inteiro', sobrou, 0);

  await p.close();
  return b;
}
