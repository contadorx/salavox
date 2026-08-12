/* Telas compartilhadas: detecção por mudança de cena, ordem na ata e PDF.

   Defeito que originou os valores golden: a assinatura de cena era em tons de
   cinza, e vermelho puro e verde escuro têm luminância quase idêntica — a
   troca de slide passava batido. A tela sintética usa exatamente essas cores. */

import { telaFalsa, paginaLimpa, bloco } from './apoio.mjs';

export default async function (ctx, url, erros) {
  const b = bloco('telas compartilhadas');
  const p = await paginaLimpa(ctx, erros);
  await p.addInitScript(telaFalsa(4));           // um slide novo a cada 4 s
  await p.goto(url + '/app');

  await p.check('#okConsent');
  await p.click('#rec');
  await p.waitForFunction(() => !document.getElementById('stop').classList.contains('hide'), { timeout: 20000 });
  await p.waitForTimeout(13000);                 // 13 s = 4 slides
  await p.click('#stop');
  await p.waitForFunction(() => /pronta|vazia/.test(document.getElementById('recMsg').textContent), { timeout: 60000 });

  b.verdade('o cartão de telas aparece quando se grava a tela', !(await p.isHidden('#telasCard')));

  await p.click('#trans');
  await p.waitForFunction(() => /Ata pronta|Não consegui/.test(document.getElementById('trMsg').textContent), { timeout: 120000 });
  b.verdade('a ata sai com trechos', /Ata pronta/.test(await p.textContent('#trMsg')));

  await p.click('#varrer');
  await p.waitForFunction(() => document.querySelector('#telasMsg .ok') || document.querySelector('#telasMsg .err'), { timeout: 180000 });

  const instantes = await p.$$eval('.telas figcaption', e => e.map(x => x.textContent.trim()));
  b.conferir('instantes das telas detectadas', instantes, ['00:00', '00:04', '00:08', '00:12']);

  const ordem = await p.$$eval('#ata > *', e => e.map(x => x.className.includes('telaAta') ? 'TELA' : 'fala'));
  b.conferir('ata intercalada em ordem cronológica', ordem.join(' '),
             'TELA fala fala TELA TELA fala fala TELA');

  await p.click('.telas figure');                // descarta a primeira tela
  const depois = await p.$$eval('#ata > *', e => e.map(x => x.className.includes('telaAta') ? 'TELA' : 'fala'));
  b.conferir('descartar uma tela a remove da ata', depois.join(' '),
             'fala fala TELA TELA fala fala TELA');
  b.conferir('o contador acompanha o descarte', (await p.textContent('#telasTag')).trim(), '3 de 4 na ata');

  const esperaPdf = p.waitForEvent('download', { timeout: 60000 });
  await p.click('#baixarPdf');
  const arq = await esperaPdf;
  const fluxo = await arq.createReadStream();
  let tamanho = 0, comeco = null;
  for await (const parte of fluxo) { if (comeco === null) comeco = parte.subarray(0, 4).toString(); tamanho += parte.length; }
  b.conferir('o PDF começa com o cabeçalho de PDF', comeco, '%PDF');
  b.entre('o PDF tem tamanho de página com imagens (bytes)', tamanho, 15000, 3000000);

  await p.close();
  return b;
}
