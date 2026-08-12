/* Gravação em pedaços: a memória tem de ficar parada enquanto o disco cresce,
   e o áudio cru tem de ficar alinhado com o vídeo.

   Defeito que originou a verificação de alinhamento: o áudio cru começava a
   ser captado antes de o gravador de vídeo iniciar, e a reunião de 180 s
   produzia 182,79 s de áudio. Como as telas são datadas pelo vídeo e as falas
   pelo áudio, os dois se deslocavam e a tela caía no minuto errado da ata. */

import { telaFalsa, paginaLimpa, bloco, transcrever } from './apoio.mjs';

const SEGUNDOS = 60;

export default async function (ctx, url, erros) {
  const b = bloco('gravação em pedaços');
  const p = await paginaLimpa(ctx, erros);
  await p.addInitScript(telaFalsa(20));
  await p.goto(url + '/app');

  await p.check('#okConsent');
  await p.click('#rec');
  await p.waitForFunction(() => !document.getElementById('stop').classList.contains('hide'), null, { timeout: 20000 });

  const medir = () => p.evaluate(() => ({
    heap: performance.memory ? performance.memory.usedJSHeapSize : 0,
    tam: window.__salavox.tamanhos()
  }));

  const marcos = [];
  for (let s = 10; s <= SEGUNDOS; s += 10) {
    await p.waitForFunction(seg => {
      const t = document.getElementById('tempo').textContent.split(':').map(Number);
      return t[0] * 60 + t[1] >= seg;
    }, s, { timeout: 60000 });
    marcos.push({ s, ...(await medir()) });
  }

  const heapInicio = marcos[0].heap, heapFim = marcos[marcos.length - 1].heap;
  b.verdade('a memória não cresce com a duração da reunião', heapFim <= heapInicio * 1.5);
  b.verdade('o disco cresce enquanto a memória não', marcos[marcos.length - 1].tam.pcm > marcos[0].tam.pcm * 3);
  b.verdade('os pedaços estão indo para o disco, não para a memória', marcos[0].tam.disco === true);

  await p.click('#stop');
  await p.waitForFunction(() => /pronta|vazia/.test(document.getElementById('recMsg').textContent), null, { timeout: 60000 });

  const info = await p.evaluate(async () => {
    const dir = await navigator.storage.getDirectory();
    const nomes = [];
    for await (const n of dir.keys()) nomes.push(n);
    const t = document.getElementById('tempo').textContent.split(':').map(Number);
    return {
      video: nomes.filter(n => n.startsWith('gravacao-')).length,
      audio: nomes.filter(n => n.startsWith('pcm-')).length,
      meta: nomes.includes('meta'),
      pcmBytes: window.__salavox.pcm().size,
      relogio: t[0] * 60 + t[1],
      real: window.__salavox.duracaoReal()
    };
  });

  const duracao = info.pcmBytes / 4 / 16000;                  // 2 canais Int16 a 16 kHz
  b.entre('taxa do áudio cru em KB/s', info.pcmBytes / duracao / 1024, 62.4, 62.6);
  /* Conferência grossa: o arquivo de áudio tem a duração da gravação. A margem é
     larga de propósito — entre mandar parar e o evento de parada chegar passam
     dezenas ou centenas de milissegundos, e apertar isto só produziria teste
     instável. O alinhamento fino é medido mais abaixo, pelo conteúdo. */
  b.entre('o áudio tem a duração da gravação, em segundos de diferença', duracao - info.real, -1.5, 1.5);
  b.entre('pedaços de vídeo no disco (1 a cada 10 s)', info.video, 4, 8);
  b.entre('pedaços de áudio no disco (1 a cada 4 s)', info.audio, 12, 20);
  b.verdade('os metadados da sessão foram gravados', info.meta);

  await transcrever(p);
  const falas = await p.evaluate(() => window.__salavox.falas().map(f => ({ a: Math.round(f.a), quem: f.quem, texto: f.texto })));
  // uma janela de 30 s por vez; o modelo falso devolve dois trechos por janela
  b.conferir('as falas são datadas a partir do início de cada janela',
             [...new Set(falas.map(f => f.a))].sort((x, y) => x - y), [1, 9, 31, 39]);

  /* Cada janela recebe mesmo o seu pedaço de áudio, e não de novo o primeiro.
     O volume da tela sintética cai aos 20 s, então a primeira janela (0–30 s)
     tem de chegar ao modelo bem mais alta que a segunda (30–60 s). Sem esta
     conferência, trocar a fatia por "sempre a primeira" passa despercebido. */
  const amp = n => {
    const f = falas.find(x => x.quem === 'outros' && x.a === n && /amp=/.test(x.texto));
    return f ? Number(f.texto.match(/amp=([0-9.]+)/)[1]) : null;
  };
  const a1 = amp(1), a2 = amp(31);
  b.verdade('a segunda janela leu o segundo trecho do áudio, não o primeiro',
            a1 !== null && a2 !== null && a1 >= a2 * 2);

  /* ---- alinhamento fino, medido pelo conteúdo e não por cronômetro ----
     A tela sintética troca de slide e abaixa o volume no mesmo instante. A troca
     de slide é datada pelo vídeo; a queda de volume, pelo áudio cru. Se as duas
     linhas do tempo estiverem alinhadas, os dois números são o mesmo — e isso
     vale mesmo que o gravador tenha demorado a começar. */
  await p.click('#varrer');
  await p.waitForFunction(() => document.querySelector('#telasMsg .ok') || document.querySelector('#telasMsg .err'), null, { timeout: 240000 });
  const legendas = await p.$$eval('.telas figcaption', e => e.map(x => x.textContent.trim()));
  const segundosDe = t => { const [m, s] = t.split(':').map(Number); return m * 60 + s; };
  const telaDoMeio = legendas[1] ? segundosDe(legendas[1]) : null;

  const primeira = falas.find(f => f.quem === 'outros' && f.a === 1 && /quieto=/.test(f.texto));
  const quieto = primeira ? Number(primeira.texto.match(/quieto=(-?[0-9.]+)/)[1]) : null;

  /* A varredura amostra o vídeo de 0,6 em 0,6 segundo no mínimo, então o
     instante da tela é o primeiro quadro amostrado DEPOIS da troca: pode estar
     até um passo adiantado em relação à troca de verdade. O áudio, ao
     contrário, é medido amostra a amostra. A janela reflete essa diferença de
     resolução — apertá-la mais faria o teste piscar sem nenhum defeito real. */
  const PASSO = Math.max(0.6, 60 / 900);
  /* Com a máquina rodando três blocos ao mesmo tempo, o vídeo perde quadros e a
     troca de slide é vista um pouco depois. A folga cobre isso; quem garante que
     ela não virou desculpa é a sabotagem, que desloca o áudio em 3 s inteiros e
     continua sendo pega. */
  const FOLGA = 1.0;

  /* Faixa larga de propósito: o instante absoluto depende de quanto o gravador
     demorou para começar depois de a tela sintética entrar no ar. O que precisa
     ser exato é a diferença entre as duas linhas do tempo, conferida logo abaixo. */
  b.entre('a segunda tela cai perto do meio da gravação (segundos)', telaDoMeio, 15, 22);
  b.verdade('a queda de volume e a troca de tela caem no mesmo instante',
            quieto !== null && telaDoMeio !== null &&
            quieto >= telaDoMeio - PASSO - FOLGA && quieto <= telaDoMeio + 0.6);

  await p.close();
  return b;
}
