/* Telas compartilhadas: detecção por mudança de cena, ordem na ata e PDF.

   Defeito que originou os valores golden: a assinatura de cena era em tons de
   cinza, e vermelho puro e verde escuro têm luminância quase idêntica — a
   troca de slide passava batido. A tela sintética usa exatamente essas cores. */

import { telaFalsa, paginaLimpa, bloco, transcrever } from './apoio.mjs';

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

  await transcrever(p);
  b.verdade('a ata sai com trechos', /Ata pronta/.test(await p.textContent('#trMsg')));

  await p.click('#varrer');
  await p.waitForFunction(() => document.querySelector('#telasMsg .ok') || document.querySelector('#telasMsg .err'), { timeout: 180000 });

  const instantes = await p.$$eval('.telas figcaption', e => e.map(x => x.textContent.trim()));
  // a captura começa preta; a primeira tela guardada é a primeira com conteúdo
  b.conferir('instantes das telas detectadas', instantes, ['00:01', '00:04', '00:08', '00:12']);

  /* A primeira tela cai depois das primeiras falas porque a captura passa o
     primeiro segundo preta: a tela só existe a partir de 1,2 s, e as falas do
     modelo estão em 1,0 s. A ordem é estável por construção — a tela nunca pode
     aparecer antes, e é isso que o golden guarda. */
  const ordem = await p.$$eval('#ata > *', e => e.map(x => x.className.includes('telaAta') ? 'TELA' : 'fala'));
  b.conferir('ata intercalada em ordem cronológica', ordem.join(' '),
             'fala fala TELA TELA TELA fala fala TELA');

  await p.click('.telas figure');                // descarta a primeira tela
  const depois = await p.$$eval('#ata > *', e => e.map(x => x.className.includes('telaAta') ? 'TELA' : 'fala'));
  b.conferir('descartar uma tela a remove da ata', depois.join(' '),
             'fala fala TELA TELA fala fala TELA');   // some a primeira das três
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
