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
  b.verdade('o cartão de telas volta disponível', !(await p.isHidden('#corpo3')));

  await transcrever(p);
  b.verdade('dá para transcrever o material recuperado', /Ata pronta/.test(await p.textContent('#trMsg')));

  await p.click('#varrer');
  await p.waitForFunction(() => document.querySelector('#telasMsg .ok') || document.querySelector('#telasMsg .err'), null, { timeout: 180000 });
  const telas = await p.$$eval('.telas figure', e => e.length);
  b.entre('telas encontradas no vídeo recuperado', telas, 2, 4);

  /* ---------- salvar a gravação em fluxo ----------

     O caminho antigo montava a gravação inteira num Blob e a entregava por
     URL.createObjectURL — duas cópias de tudo antes de a barra de download
     aparecer, e era isso que demorava. Agora os pedaços vão um a um para o
     arquivo escolhido.

     O seletor de arquivo do navegador não pode ser clicado por um teste, então
     ele é substituído por um que aceita e guarda o que foi escrito. O que este
     teste mede é o que importa: que a escrita aconteça em MAIS DE UM pedaço
     (ou seja, em fluxo) e que a soma bata com a gravação inteira. */
  await p.evaluate(() => {
    globalThis.__salvo = { pedacos: [], bytes: 0, nome: null, fechado: false };
    window.showSaveFilePicker = async opcoes => {
      globalThis.__salvo.nome = opcoes && opcoes.suggestedName;
      return {
        createWritable: async () => ({
          write: async d => { globalThis.__salvo.pedacos.push(d.size || d.byteLength || 0);
                              globalThis.__salvo.bytes += d.size || d.byteLength || 0; },
          close: async () => { globalThis.__salvo.fechado = true; }
        })
      };
    };
  });

  const tamanhoEsperado = await p.evaluate(() => window.__salavox.gravacao().size);
  await p.click('#baixarGrav');
  await p.waitForFunction(() => globalThis.__salvo && globalThis.__salvo.fechado, null, { timeout: 30000 });
  const salvo = await p.evaluate(() => globalThis.__salvo);

  b.conferir('o arquivo salvo tem exatamente os bytes da gravação', salvo.bytes, tamanhoEsperado);
  b.verdade('e foi escrito em pedaços, não de uma vez só', salvo.pedacos.length > 1);
  b.verdade('nenhum pedaço saiu vazio', salvo.pedacos.every(n => n > 0));
  b.verdade('o nome sugerido leva a marca e a extensão certa',
            /^salavox-gravacao-.*\.(webm|mp4)$/.test(salvo.nome || ''));
  b.verdade('e a tela confirma que salvou', /salva/.test(await p.textContent('#ataMsg')));

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
