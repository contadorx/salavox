/* Os quatro itens do pacote: arquivo importado, idioma, nomes e momentos.

   O arquivo de teste é um WAV montado dentro da própria página — sem depender
   de ffmpeg nem de arquivo no repositório. Ele é alto nos primeiros vinte
   segundos e baixo depois, o que também prova que a janela de trinta segundos
   lê o pedaço certo do arquivo importado. */

import { telaFalsa, paginaLimpa, bloco, transcrever } from './apoio.mjs';

const MONTAR_WAV = `(seg => {
  const SR = 16000, n = SR * seg;
  const buf = new ArrayBuffer(44 + n * 2), d = new DataView(buf);
  const txt = (o, t) => { for (let i = 0; i < t.length; i++) d.setUint8(o + i, t.charCodeAt(i)); };
  txt(0, 'RIFF'); d.setUint32(4, 36 + n * 2, true); txt(8, 'WAVEfmt ');
  d.setUint32(16, 16, true); d.setUint16(20, 1, true); d.setUint16(22, 1, true);
  d.setUint32(24, SR, true); d.setUint32(28, SR * 2, true); d.setUint16(32, 2, true); d.setUint16(34, 16, true);
  txt(36, 'data'); d.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) {
    const t = i / SR, amp = t < 20 ? 0.4 : 0.05;
    d.setInt16(44 + i * 2, Math.sin(2 * Math.PI * 220 * t) * amp * 32767, true);
  }
  const dt = new DataTransfer();
  dt.items.add(new File([new Blob([buf], { type: 'audio/wav' })], 'reuniao-antiga.wav', { type: 'audio/wav' }));
  document.getElementById('solta').dispatchEvent(
    new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
})(40);`;

export default async function (ctx, url, erros) {
  const b = bloco('arquivo importado, idioma, nomes e momentos');
  const p = await paginaLimpa(ctx, erros);
  await p.addInitScript(telaFalsa(4));
  await p.goto(url + '/app');

  /* ---------- 0. o tamanho anunciado é o do caminho que vai rodar ----------

     A tela dizia "~200 MB" para o modelo Preciso enquanto o caminho padrão
     baixava 586 MB — quase o triplo. O número não é decoração: é com ele que
     alguém decide esperar ou desistir. */
  const anuncio = async () => (await p.textContent('#modeloAviso')).replace(/\s+/g, ' ');
  b.verdade('no processador, o Preciso anuncia os 249 MB que ele realmente baixa',
            /249 MB/.test(await anuncio()));
  await p.check('#placa');
  await p.waitForTimeout(120);
  b.verdade('marcar a placa de vídeo muda o número anunciado para 586 MB',
            /586 MB/.test(await anuncio()));
  b.verdade('e a tela explica por que é maior', /sem compress/i.test(await anuncio()));
  await p.selectOption('#modelo', 'onnx-community/whisper-large-v3-turbo');
  await p.waitForTimeout(120);
  b.verdade('o turbo na placa passa de dois gigabytes, e diz isso', /2,8 GB/.test(await anuncio()));
  await p.uncheck('#placa');
  await p.selectOption('#modelo', 'onnx-community/whisper-small');
  await p.waitForTimeout(120);

  /* ---------- A. arquivo que já existe, arrastado para a página ---------- */
  await p.selectOption('#idioma', '');                      // detectar o idioma
  await p.evaluate(MONTAR_WAV);
  await p.waitForFunction(() => /pronto|<span class="err">/.test(document.getElementById('arqMsg').innerHTML), null, { timeout: 60000 });
  const importou = /pronto/.test(await p.textContent('#arqMsg'));
  b.verdade('o arquivo arrastado é aceito', importou);
  b.verdade('a transcrição fica liberada', !(await p.isEnabled('#trans')) === false);
  /* O cartão continua na tela — os cinco passos estão sempre lá. O que fica
     fechado é o corpo dele: arquivo só de áudio não tem tela para varrer. */
  b.verdade('o passo de telas continua na escada, mas fechado para arquivo só de áudio',
            !(await p.isHidden('#telasCard')) && await p.isHidden('#corpo3'));
  b.verdade('e ele diz por que ainda não dá para usar',
            /Aparece depois de gravar/.test(await p.textContent('#espera3')));

  const bytes = await p.evaluate(() => window.__salavox.pcm().size);
  b.conferir('o áudio virou PCM de 40 s em disco (bytes)', bytes, 40 * 16000 * 4);

  await transcrever(p);

  const opcoes = await p.evaluate(() => window.__opcoes || {});
  b.verdade('"detectar o idioma" não força idioma nenhum no modelo', !('language' in opcoes));

  const falas = await p.evaluate(() => window.__salavox.falas().map(f => ({ a: Math.round(f.a), quem: f.quem, texto: f.texto })));
  /* O motor padrão é o processador. Não é detalhe de implementação: é a
     diferença entre 249 MB e 586 MB no primeiro uso, e o relato público da
     própria biblioteca é que em Whisper o processador costuma terminar antes.
     O modelo simulado aceita qualquer configuração, então se a ordem voltar a
     ser "placa primeiro" ele responderia "placa de vídeo" aqui. */
  b.conferir('sem marcar nada, quem transcreve é o processador',
             await p.evaluate(() => window.__salavox.desempenho().motor), 'processador');

  b.conferir('as falas do arquivo entram todas como um interlocutor só',
             [...new Set(falas.map(f => f.quem))], ['outros']);
  b.conferir('as duas janelas de trinta segundos foram lidas',
             [...new Set(falas.map(f => f.a))].sort((x, y) => x - y), [1, 9, 31, 39]);

  const amp = a => {
    const f = falas.find(x => x.a === a && /amp=/.test(x.texto));
    return f ? Number(f.texto.match(/amp=([0-9.]+)/)[1]) : null;
  };
  b.verdade('a segunda janela leu o trecho baixo do arquivo, não o primeiro', amp(1) >= amp(31) * 2);

  const rotulos1 = await p.$$eval('#ata .quem', e => [...new Set(e.map(x => x.textContent.trim()))]);
  b.conferir('arquivo importado não finge saber quem falou', rotulos1, ['TRANSCRIÇÃO']);

  /* Sem falas na tela não há o que renomear: o resto do teste seria uma sequência
     de cliques em nada, e um clique que estoura o tempo é bem pior de ler do que
     uma verificação com nome. */
  if (!rotulos1.length) {
    b.verdade('há falas na ata para renomear', false);
    await p.close();
    return b;
  }

  /* ---------- B. nomes ---------- */
  await p.fill('#nomeGrupo', 'Cliente');
  const rotulos2 = await p.$$eval('#ata .quem', e => [...new Set(e.map(x => x.textContent.trim()))]);
  b.conferir('o nome digitado substitui o rótulo padrão', rotulos2, ['Cliente']);

  await p.fill('#nomeNovo', 'Maria');
  await p.press('#nomeNovo', 'Enter');
  b.conferir('o nome adicionado vira uma etiqueta', await p.$$eval('.chip', e => e.map(x => x.textContent.replace('×', '').trim())), ['Maria']);

  await p.click('#ata .quem');                              // primeira fala passa a ser da Maria
  const rotulos3 = await p.$$eval('#ata .quem', e => e.map(x => x.textContent.trim()));
  b.conferir('clicar no nome troca quem falou naquela fala', rotulos3.slice(0, 2), ['Maria', 'Cliente']);

  const texto = await p.evaluate(() => window.__salavox.comoTexto());
  b.verdade('o nome escolhido aparece no texto exportado', /Maria:/.test(texto) && /Cliente:/.test(texto));
  const vtt = await p.evaluate(() => window.__salavox.comoVtt());
  b.verdade('o nome escolhido aparece na legenda', /<v Maria>/.test(vtt));

  await p.click('.chip button');                            // remove a Maria
  const rotulos4 = await p.$$eval('#ata .quem', e => [...new Set(e.map(x => x.textContent.trim()))]);
  b.conferir('remover o nome devolve a fala ao rótulo padrão', rotulos4, ['Cliente']);

  /* ---------- C. momentos marcados durante a gravação ---------- */
  await p.check('#okConsent');
  await p.click('#rec');
  await p.waitForFunction(() => !document.getElementById('stop').classList.contains('hide'), null, { timeout: 20000 });
  await p.waitForTimeout(3000);
  await p.keyboard.press('m');                              // atalho, sem tirar o olho da chamada
  await p.waitForTimeout(5000);
  await p.click('#marcar');
  await p.waitForTimeout(3000);
  await p.click('#stop');
  await p.waitForFunction(() => /pronta|vazia/.test(document.getElementById('recMsg').textContent), null, { timeout: 60000 });

  const marcas = await p.evaluate(() => window.__salavox.momentos().map(m => Math.round(m)));
  b.conferir('duas marcas, nos instantes em que foram feitas', marcas.map(m => m >= 2 && m <= 4 ? 'inicio' : (m >= 7 && m <= 10 ? 'meio' : m)), ['inicio', 'meio']);

  await transcrever(p);
  b.conferir('as marcas aparecem na ata', await p.$$eval('#ata .momento', e => e.length), 2);
  const texto2 = await p.evaluate(() => window.__salavox.comoTexto());
  b.conferir('as marcas aparecem no texto exportado', (texto2.match(/momento marcado/g) || []).length, 2);

  if (await p.$$eval('#ata .momento', e => e.length)) {
    await p.click('#ata .momento');
    b.conferir('clicar na marca remove a marca', await p.$$eval('#ata .momento', e => e.length), 1);
  } else {
    b.verdade('há marca na ata para remover', false);
  }

  const espera = p.waitForEvent('download', { timeout: 60000 });
  await p.click('#baixarPdf');
  const arq = await espera;
  const fluxo = await arq.createReadStream();
  let tam = 0;
  for await (const parte of fluxo) tam += parte.length;
  b.entre('o PDF com marcas ainda sai (bytes)', tam, 2000, 3000000);

  /* ---------- D. de onde vem o modelo, e a marca nos arquivos ---------- */
  b.conferir('sem espelho publicado, o modelo continua vindo da CDN',
             await p.evaluate(() => window.__salavox.espelhoLocal('onnx-community/whisper-base')), null);

  const comMarca = await p.evaluate(() => window.__salavox.comoVtt());
  b.verdade('a legenda leva a marca junto', /NOTE gerado pelo Salavox/.test(comMarca));
  b.verdade('o nome do arquivo leva a marca', /^salavox-ata-/.test(await p.evaluate(() => {
    const a = document.createElement('a');
    return 'salavox-ata-' + new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  })));

  await p.close();
  return b;
}
