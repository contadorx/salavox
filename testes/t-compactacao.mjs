/* Compactar o silêncio antes de mandar ao modelo.

   O Whisper processa sempre trinta segundos, com ou sem fala dentro. Numa
   reunião real cada canal fala uma fração do tempo, então a maior parte do
   trabalho é o modelo ouvindo silêncio. Compactar costura a fala, tira os vãos
   e manda pacotes densos.

   O QUE ESTE BLOCO PERSEGUE, e por que é o teste mais importante da mudança:

   o modelo devolve instantes na linha do tempo **compactada**, que não é a da
   reunião. Errar esse remapeamento desloca a ata inteira sem que nada pareça
   errado — o texto sai bonito, com carimbo de hora, e mentindo. Por isso o
   áudio deste teste tem bordas escolhidas a dedo e os instantes esperados estão
   escritos à mão, calculados fora do código que está sendo medido.

   O ÁUDIO: 120 segundos, quatro rajadas de 5 s começando em 10, 40, 70 e 100.
   Sem compactar, são quatro janelas de 30 s → quatro passagens pelo modelo.
   Compactando, 20 s de fala cabem num pacote só → uma passagem. */

import { paginaLimpa, bloco, transcrever } from './apoio.mjs';

const RAJADAS = [10, 40, 70, 100];        // início de cada rajada, em segundos
const DURACAO = 5;                        // duração de cada uma
const FOLGA = 0.2;                        // o que o produto acrescenta em volta da fala

/* WAV mono de 120 s com quatro rajadas. Montado dentro da página, como no
   bloco de arquivo importado — sem depender de ffmpeg nem de binário no
   repositório. */
const MONTAR_WAV = `(() => {
  const SR = 16000, seg = 120, n = SR * seg;
  const buf = new ArrayBuffer(44 + n * 2), d = new DataView(buf);
  const txt = (o, t) => { for (let i = 0; i < t.length; i++) d.setUint8(o + i, t.charCodeAt(i)); };
  txt(0, 'RIFF'); d.setUint32(4, 36 + n * 2, true); txt(8, 'WAVEfmt ');
  d.setUint32(16, 16, true); d.setUint16(20, 1, true); d.setUint16(22, 1, true);
  d.setUint32(24, SR, true); d.setUint32(28, SR * 2, true); d.setUint16(32, 2, true); d.setUint16(34, 16, true);
  txt(36, 'data'); d.setUint32(40, n * 2, true);
  const rajadas = ${JSON.stringify(RAJADAS)};
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const falando = rajadas.some(r => t >= r && t < r + ${DURACAO});
    const amp = falando ? 0.4 : 0;      // silêncio digital entre as rajadas
    d.setInt16(44 + i * 2, Math.sin(2 * Math.PI * 220 * t) * amp * 32767, true);
  }
  const dt = new DataTransfer();
  dt.items.add(new File([new Blob([buf], { type: 'audio/wav' })], 'reuniao-espacada.wav', { type: 'audio/wav' }));
  document.getElementById('solta').dispatchEvent(
    new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
})();`;

async function importar(p) {
  await p.evaluate(MONTAR_WAV);
  await p.waitForFunction(() => /pronto|<span class="err">/.test(document.getElementById('arqMsg').innerHTML),
                          null, { timeout: 60000 });
  return /pronto/.test(await p.textContent('#arqMsg'));
}

export default async function (ctx, url, erros) {
  const b = bloco('compactar o silêncio');

  /* ---------- 1. as peças, medidas sozinhas ----------
     Antes da integração: as funções puras, com números que dá para conferir de
     cabeça. Se estas contas estiverem erradas, o resto do bloco mente. */
  const p = await paginaLimpa(ctx, erros);
  await p.goto(url + '/app');
  await p.waitForFunction(() => !!window.__salavox, null, { timeout: 15000 });

  const pecas = await p.evaluate(() => {
    const S = window.__salavox;
    const SR = 16000, Q = S.QUADRO;                 // 320 amostras = 20 ms
    const porSeg = SR / Q;                          // 50 quadros por segundo

    /* 100 s de quadros: fala de 10 a 15 e de 40 a 45, silêncio no resto */
    const q = Array.from({ length: 100 * porSeg }, (_, i) => {
      const t = i / porSeg;
      return (t >= 10 && t < 15) || (t >= 40 && t < 45) ? 0.08 : 0.0005;
    });
    const pedacos = S.acharFala(q, 0.01, null).map(x => ({ de: +(x.de / SR).toFixed(2), ate: +(x.ate / SR).toFixed(2) }));

    /* dois vãos: um de 300 ms (respiro dentro da frase) e um de 2 s */
    const q2 = Array.from({ length: 30 * porSeg }, (_, i) => {
      const t = i / porSeg;
      const calado = (t >= 5 && t < 5.3) || (t >= 10 && t < 12);
      return calado ? 0.0005 : 0.08;
    });
    const pedacos2 = S.acharFala(q2, 0.01, null).length;

    /* o mapa de volta */
    const pacote = [{ de: 10 * SR, ate: 15 * SR }, { de: 40 * SR, ate: 45 * SR }];
    return {
      pedacos, pedacos2,
      /* empacotar: nada pode passar do teto, e pedaço maior que o teto é
         fatiado — fala corrida de meio minuto existe em reunião de verdade */
      caixas: S.empacotar([{ de: 0, ate: 70 * SR }], 30 * SR).map(x => x.length),
      duracoes: S.empacotar(
        [{ de: 0, ate: 20 * SR }, { de: 30 * SR, ate: 50 * SR }, { de: 60 * SR, ate: 65 * SR }], 30 * SR)
        .map(c => c.reduce((t, x) => t + (x.ate - x.de), 0) / SR),
      emCasa: +S.instanteReal(pacote, 2).toFixed(2),     // 2 s dentro do 1º pedaço
      noSegundo: +S.instanteReal(pacote, 7).toFixed(2),  // 5 + 2 → 2 s dentro do 2º
      naBorda: +S.instanteReal(pacote, 5).toFixed(2),    // exatamente na emenda
      alemDoFim: +S.instanteReal(pacote, 99).toFixed(2)  // além de tudo
    };
  });

  b.conferir('a fala é achada com 0,2 s de folga dos dois lados',
             pecas.pedacos, [{ de: 9.8, ate: 15.2 }, { de: 39.8, ate: 45.2 }]);
  b.conferir('vão de 300 ms é respiro e não separa; o de 2 s separa', pecas.pedacos2, 2);
  b.conferir('fala corrida de 70 s é fatiada em três pacotes', pecas.caixas, [1, 1, 1]);
  /* 20 s + 20 s + 5 s, com teto de 30: o segundo pedaço não cabe junto do
     primeiro e abre pacote novo, onde o terceiro ainda cabe. */
  b.conferir('os pedaços são empacotados sem estourar o teto', pecas.duracoes, [20, 25]);
  b.verdade('e nenhum pacote passa dos 30 s que o modelo aceita',
            pecas.duracoes.every(d => d <= 30));
  b.conferir('instante dentro do primeiro pedaço volta para o lugar certo', pecas.emCasa, 12);
  b.conferir('instante que caiu no segundo pedaço pula o vão', pecas.noSegundo, 42);
  b.conferir('a emenda pertence ao pedaço seguinte', pecas.naBorda, 40);
  b.conferir('instante além do pacote não escapa para o infinito', pecas.alemDoFim, 45);

  /* ---------- 2. o ganho, medido ---------- */
  b.verdade('o áudio de teste foi aceito', await importar(p));
  await p.uncheck('#compactar');
  await transcrever(p);
  const semCompactar = await p.evaluate(() => window.__salavox.pedidosAoModelo());
  const falasSem = await p.evaluate(() => window.__salavox.falas().map(f => +f.a.toFixed(2)));
  b.conferir('sem compactar, 120 s viram quatro passagens pelo modelo', semCompactar, 4);

  b.verdade('o áudio de teste foi aceito de novo', await importar(p));
  await p.check('#compactar');
  await transcrever(p);
  const comCompactar = await p.evaluate(() => window.__salavox.pedidosAoModelo()) - semCompactar;
  b.conferir('compactando, os mesmos 120 s viram uma passagem só', comCompactar, 1);

  /* ---------- 3. e os instantes voltam para o minuto certo ----------
     O pacote tem quatro pedaços de 5,4 s (5 s de rajada + 0,2 s de folga de
     cada lado), nesta ordem: 9,8 · 39,8 · 69,8 · 99,8.

     O modelo simulado devolve marcas em 1 s e 9 s dentro do pacote.
       1 s  → cai no 1º pedaço, 1 s adentro     → 9,8 + 1   = 10,8
       9 s  → 5,4 do 1º + 3,6 no 2º             → 39,8 + 3,6 = 43,4
     Ambos calculados aqui, à mão, e não pelo código que está sendo medido. */
  const falas = await p.evaluate(() => window.__salavox.falas().map(f => +f.a.toFixed(2)));
  b.conferir('a primeira marca volta para dentro da primeira rajada', falas[0], 10.8);
  b.conferir('a segunda marca pula o vão e cai na segunda rajada', falas[1], 43.4);

  b.verdade('nenhuma fala cai no silêncio entre as rajadas',
            falas.every(t => RAJADAS.some(r => t >= r - FOLGA - 0.01 && t <= r + DURACAO + FOLGA + 0.01)));
  b.verdade('e nenhuma passa do fim da gravação', falas.every(t => t <= 120));

  /* Sem compactar, os instantes são outros — e é isso que prova que a
     compactação está mesmo mudando a linha do tempo, e não apenas passando. */
  b.verdade('sem compactar as marcas caem no início de cada janela de 30 s',
            JSON.stringify(falasSem) !== JSON.stringify(falas) && falasSem[0] === 1);

  /* ---------- 4. a medição que autoriza escolher ----------
     A diferença entre a placa de vídeo e o processador é maior que qualquer
     otimização desta lista. Até agora a queda acontecia em silêncio e quem
     estava no caminho lento não sabia. */
  const d = await p.evaluate(() => window.__salavox.desempenho());
  b.verdade('a ferramenta sabe dizer em que motor o modelo rodou', !!d.motor);
  b.verdade('e quantas vezes mais rápido que o tempo real foi', d.vezesOTempoReal > 0);
  b.verdade('o número aparece na tela junto da ata',
            /o tempo real/.test(await p.textContent('#trMsg')));

  await p.close();
  return b;
}
