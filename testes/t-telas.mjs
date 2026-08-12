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

  /* A varredura amostra o vídeo de 0,6 em 0,6 segundo, e o instante que ela
     registra é o do primeiro quadro amostrado depois da troca — pode cair um
     segundo antes ou depois, conforme onde a grade de amostragem calha de
     bater. Exigir o segundo exato era exigir mais precisão do que o
     instrumento tem, e a suíte piscava por isso. O que o golden guarda é o que
     importa: quatro telas, uma perto de cada troca, e nenhuma tela preta do
     começo da captura. */
  const instantes = await p.$$eval('.telas figcaption', e => e.map(x => {
    const [m, s] = x.textContent.trim().split(':').map(Number);
    return m * 60 + s;
  }));
  const ESPERADOS = [1, 4, 8, 12];       // a captura começa preta: a 1ª tela é a 1ª com conteúdo
  b.conferir('quantas telas foram detectadas', instantes.length, ESPERADOS.length);
  b.conferir('cada tela caiu perto da troca de slide (± 1 s)',
             instantes.map((t, i) => Math.abs(t - (ESPERADOS[i] ?? -99)) <= 1),
             ESPERADOS.map(() => true));
  b.verdade('nenhuma tela preta do começo da captura entrou', instantes[0] >= 1);

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
