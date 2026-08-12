/* Gera as imagens da página inicial a partir do aplicativo de verdade.

   São capturas reais, não maquetes: a mesma ferramenta que o visitante vai
   abrir, alimentada com uma reunião de exemplo. Se a interface mudar e alguém
   esquecer de regerar, a diferença aparece — o que é bem melhor do que uma
   maquete bonita que nunca correspondeu a nada.

   Uso:  node ferramentas/gerar-imagens.mjs
   Saída: public/img/*.webp  e  public/img/pdf.png (via pdftoppm) */

import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { servir, RAIZ } from '../testes/apoio.mjs';

const IMG = path.join(RAIZ, 'public', 'img');
fs.mkdirSync(IMG, { recursive: true });

/* Tela compartilhada de exemplo: um material de escritório contábil, trocando
   a cada nove segundos. Nada de "SLIDE 1" — a imagem vai para a página inicial. */
const TELA_EXEMPLO = `(() => {
  /* Disco de uma máquina normal. Sem isso, a captura sai com o aviso de pouco
     espaço do ambiente de teste — que é verdadeiro aqui e mentira no computador
     de quem vai ver a imagem. */
  if (navigator.storage) navigator.storage.estimate = async () => ({ quota: 480*1073741824, usage: 96*1073741824 });

  navigator.mediaDevices.getDisplayMedia = async () => {
    const c = document.createElement('canvas'); c.width = 1000; c.height = 470;
    const x = c.getContext('2d');
    const T = '#1f1e1c', M = '#6b6862', A = '#2f6f66', L = '#e5e2dc';

    const moldura = titulo => {
      x.fillStyle = '#ffffff'; x.fillRect(0,0,1000,470);
      x.fillStyle = '#f4f2ee'; x.fillRect(0,0,1000,64);
      x.fillStyle = L; x.fillRect(0,64,1000,1);
      x.fillStyle = T; x.font = '600 24px system-ui,sans-serif'; x.fillText(titulo, 40, 41);
    };
    const linha = (y, cols, larguras, cor, peso) => {
      x.font = (peso||'400') + ' 17px system-ui,sans-serif'; x.fillStyle = cor;
      let px = 40; cols.forEach((t,i) => { x.fillText(t, px, y); px += larguras[i]; });
    };

    const telas = [
      () => { moldura('Fechamento de agosto — apuração');
        linha(120, ['Regime','Base de cálculo','Alíquota','Imposto'], [280,260,180,200], M, '600');
        x.fillStyle = L; x.fillRect(40,136,920,1);
        [['Simples Nacional','R$ 184.200,00','6,00%','R$ 11.052,00'],
         ['Lucro Presumido','R$ 96.500,00','11,33%','R$ 10.933,45'],
         ['Retenções','R$ 12.400,00','4,65%','R$ 576,60']]
          .forEach((r,i) => { linha(180+i*54, r, [280,260,180,200], T);
                              x.fillStyle=L; x.fillRect(40,196+i*54,920,1); });
        linha(350, ['Total apurado','','','R$ 22.562,05'], [280,260,180,200], A, '600'); },

      () => { moldura('Conciliação bancária — pendências');
        const barras = [['01/08',150],['08/08',95],['15/08',210],['22/08',60],['29/08',130]];
        barras.forEach((b,i) => {
          const h = b[1]; const px = 90 + i*170;
          x.fillStyle = i===2 ? '#b3402a' : A; x.fillRect(px, 380-h, 96, h);
          x.fillStyle = M; x.font='15px system-ui,sans-serif'; x.fillText(b[0], px+18, 406);
        });
        x.fillStyle = M; x.font='16px system-ui,sans-serif';
        x.fillText('três lançamentos sem contrapartida na semana de 15/08', 90, 444); },

      () => { moldura('Pendências do cliente');
        ['Enviar extratos de duas contas','Confirmar a nota 4.812 cancelada',
         'Assinar a guia do INSS','Retorno sobre o pró-labore'].forEach((t,i) => {
          x.strokeStyle = A; x.lineWidth = 2; x.strokeRect(42, 118+i*62, 20, 20);
          x.fillStyle = T; x.font='19px system-ui,sans-serif'; x.fillText(t, 80, 136+i*62);
        }); },

      () => { moldura('Próximos passos');
        [['sexta-feira','entrega da apuração'],['segunda','fechamento com o cliente'],
         ['dia 20','envio das guias']].forEach((r,i) => {
          x.fillStyle = A; x.font='600 19px system-ui,sans-serif'; x.fillText(r[0], 40, 150+i*70);
          x.fillStyle = T; x.font='19px system-ui,sans-serif'; x.fillText(r[1], 240, 150+i*70);
          x.fillStyle = L; x.fillRect(40, 172+i*70, 920, 1); }); }
    ];

    let n = 0;
    const pintar = () => { telas[Math.floor(n/90) % telas.length](); n++; };
    pintar(); setInterval(pintar, 100);

    const ac = new AudioContext(); const o = ac.createOscillator(); o.frequency.value = 210;
    const g = ac.createGain(); g.gain.value = .3; const d = ac.createMediaStreamDestination();
    o.connect(g); g.connect(d); o.start();
    const s = c.captureStream(8); s.addTrack(d.stream.getAudioTracks()[0]); return s;
  };
})();`;

/* Transcrição de exemplo. A primeira chamada é o canal do microfone, a segunda
   é o da chamada — é a ordem em que o aplicativo transcreve os dois canais. */
const MODELO_EXEMPLO = { contentType: 'application/javascript', body: `
  export const env={allowLocalModels:1,allowRemoteModels:1,backends:{onnx:{wasm:{}}}};
  let n=0;
  const VOCE=[[2,'Vamos começar pelo fechamento de agosto.'],
              [11,'Consigo entregar a apuração até sexta-feira.'],
              [21,'Te mando hoje a relação dos lançamentos que faltam.']];
  const OUTROS=[[6,'A conciliação ainda está com três lançamentos em aberto.'],
                [15,'Esse valor de imposto ficou diferente do mês passado?'],
                [26,'Perfeito, aí a gente fecha na segunda.']];
  export async function pipeline(){ return async () => { n++;
    const f = n===1 ? VOCE : OUTROS;
    return { chunks: f.map(p => ({ timestamp:[p[0], p[0]+3], text:p[1] })) };
  }; }` };

const nav = await chromium.launch({
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream']
});
const servidor = await servir(8161);
// janela estreita de propósito: numa janela larga a ata fica com meia tela vazia
// à direita, e a captura sai com aquele ar de recorte mal feito
const ctx = await nav.newContext({ permissions: ['microphone'], viewport: { width: 820, height: 900 }, deviceScaleFactor: 2 });
const p = await ctx.newPage();
await p.route('**/@huggingface/transformers@**', r => r.fulfill(MODELO_EXEMPLO));
await p.addInitScript(TELA_EXEMPLO);
await p.goto(servidor.url + '/app');

console.log('gravando 30 s de reunião de exemplo…');
await p.check('#okConsent');
await p.click('#rec');
await p.waitForFunction(() => !document.getElementById('stop').classList.contains('hide'), { timeout: 20000 });
await p.waitForTimeout(11000);

// o primeiro .card é o de recuperação, que está oculto: pega o primeiro visível.
// Os dois parágrafos de explicação e a área de importar arquivo ficam de fora da
// captura: numa imagem de página inicial eles viram parede de texto ilegível, e
// deixavam a moldura terminando no meio de uma frase.
const cartaoGravar = p.locator('.card:not(.hide)').first();
await p.evaluate(() => document.querySelectorAll('.card .note, #solta, .ou')
  .forEach(n => { n.dataset.antes = n.style.display; n.style.display = 'none'; }));
await cartaoGravar.scrollIntoViewIfNeeded();
await p.waitForTimeout(400);
await cartaoGravar.screenshot({ path: path.join(IMG, 'gravando.png') });
await p.evaluate(() => document.querySelectorAll('.card .note, #solta, .ou')
  .forEach(n => { n.style.display = n.dataset.antes || ''; }));

await p.waitForTimeout(19000);
await p.click('#stop');
await p.waitForFunction(() => /pronta|vazia/.test(document.getElementById('recMsg').textContent), { timeout: 60000 });

await p.click('#trans');
await p.waitForFunction(() => /Ata pronta|Não consegui/.test(document.getElementById('trMsg').textContent), { timeout: 120000 });
await p.click('#varrer');
await p.waitForFunction(() => document.querySelector('#telasMsg .ok') || document.querySelector('#telasMsg .err'), { timeout: 240000 });

const quantas = await p.$$eval('.telas figure', e => e.length);
console.log('telas detectadas:', quantas);

await p.evaluate(() => { const a = document.getElementById('ata'); a.style.maxHeight = 'none'; });
await p.waitForTimeout(300);
await p.locator('#ata').screenshot({ path: path.join(IMG, 'ata.png') });
await p.locator('#telasCard').screenshot({ path: path.join(IMG, 'telas.png') });

const dl = p.waitForEvent('download', { timeout: 60000 });
await p.click('#baixarPdf');
const arq = await dl;
await arq.saveAs('/tmp/ata-exemplo.pdf');
console.log('pdf de exemplo salvo');

await nav.close();
await servidor.fechar();

execFileSync('pdftoppm', ['-png', '-r', '110', '-f', '1', '-l', '1', '/tmp/ata-exemplo.pdf', '/tmp/ata-exemplo']);
fs.copyFileSync('/tmp/ata-exemplo-1.png', path.join(IMG, 'pdf.png'));

/* WebP para a página não pesar. As capturas são de texto, então a qualidade
   alta é barata e a diferença visual em tela de retina é grande. */
/* ============================================================
   Proporções.

   Cada captura sai com a altura que calhou de ter o elemento na tela. Jogadas
   direto na página, viram um mosaico de retângulos diferentes — e é isso que dá
   o aspecto desleixado. Aqui cada imagem é recortada (nunca esticada) para a
   proporção exata da moldura em que vai entrar.
   ============================================================ */

const PY = `
from PIL import Image
import sys

def recorte(caminho, saida, prop, topo=0, altura_max=None):
    im = Image.open(caminho).convert("RGB")
    L, A = im.size
    alvo = round(L / prop)
    if altura_max: alvo = min(alvo, altura_max)
    fim = min(A, topo + alvo)
    if fim - topo < alvo:                      # imagem curta demais: sobe o corte
        topo = max(0, fim - alvo)
    im.crop((0, topo, L, fim)).save(saida, "WEBP", quality=86, method=6)
    print(saida.split("/")[-1], im.crop((0, topo, L, fim)).size)

`;

const converter = (origem, saida, prop, topo = 0) => execFileSync('python3', ['-c',
  PY + `recorte(${JSON.stringify(origem)}, ${JSON.stringify(saida)}, ${prop}, ${topo})`]).toString().trim();

const cru = n => path.join(IMG, n + '.png');
const pronto = n => path.join(IMG, n + '.webp');

console.log(converter(cru('gravando'), pronto('gravando'), 16 / 9));
console.log(converter(cru('telas'),    pronto('telas'),    21 / 9));
console.log(converter(cru('pdf'),      pronto('pdf'),      4 / 3));

/* O alto da página começa numa fala, não numa tela: quem chega precisa entender
   em dois segundos que aquilo é a transcrição de uma reunião. O deslocamento foi
   medido na captura — a primeira fala aparece logo depois da primeira tela. */
console.log(converter(cru('ata'), pronto('hero'), 4 / 5, 690));
console.log(converter(cru('ata'), pronto('ata'),  3 / 4, 0));

for (const n of ['gravando', 'telas', 'pdf', 'ata']) fs.rmSync(cru(n));
console.log('imagens em public/img/');
