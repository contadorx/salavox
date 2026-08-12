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
    const c = document.createElement('canvas'); c.width = 1000; c.height = 562;
    const x = c.getContext('2d');
    const T = '#1f1e1c', M = '#6b6862', A = '#2f6f66', L = '#e5e2dc';

    const moldura = titulo => {
      x.fillStyle = '#ffffff'; x.fillRect(0,0,1000,562);
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
        linha(360, ['Total apurado','','','R$ 22.562,05'], [280,260,180,200], A, '600'); },

      () => { moldura('Conciliação bancária — pendências');
        const barras = [['01/08',150],['08/08',95],['15/08',210],['22/08',60],['29/08',130]];
        barras.forEach((b,i) => {
          const h = b[1]; const px = 90 + i*170;
          x.fillStyle = i===2 ? '#b3402a' : A; x.fillRect(px, 400-h, 96, h);
          x.fillStyle = M; x.font='15px system-ui,sans-serif'; x.fillText(b[0], px+18, 428);
        });
        x.fillStyle = M; x.font='16px system-ui,sans-serif';
        x.fillText('três lançamentos sem contrapartida na semana de 15/08', 90, 480); },

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
const ctx = await nav.newContext({ permissions: ['microphone'], viewport: { width: 1040, height: 900 }, deviceScaleFactor: 2 });
const p = await ctx.newPage();
await p.route('**/@huggingface/transformers@**', r => r.fulfill(MODELO_EXEMPLO));
await p.addInitScript(TELA_EXEMPLO);
await p.goto(servidor.url + '/app');

console.log('gravando 30 s de reunião de exemplo…');
await p.check('#okConsent');
await p.click('#rec');
await p.waitForFunction(() => !document.getElementById('stop').classList.contains('hide'), { timeout: 20000 });
await p.waitForTimeout(11000);

// o primeiro .card é o de recuperação, que está oculto: pega o primeiro visível
const cartaoGravar = p.locator('.card:not(.hide)').first();
await cartaoGravar.scrollIntoViewIfNeeded();
await p.waitForTimeout(400);
await cartaoGravar.screenshot({ path: path.join(IMG, 'gravando.png') });

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
/* o cartão de gravar termina em dois parágrafos de explicação que não cabem
   numa imagem de página inicial: a captura fica no que interessa */
execFileSync('python3', ['-c', `
from PIL import Image
im = Image.open("${path.join(IMG, 'gravando.png')}")
im.crop((0, 0, im.width, round(im.height*0.63))).save("${path.join(IMG, 'gravando.png')}")
print("gravando recortado")`]);

for (const nome of ['gravando', 'ata', 'telas', 'pdf']) {
  const origem = path.join(IMG, nome + '.png');
  execFileSync('python3', ['-c', `
from PIL import Image
im = Image.open("${origem}").convert("RGB")
if im.width > 1600: im = im.resize((1600, round(im.height*1600/im.width)), Image.LANCZOS)
im.save("${path.join(IMG, nome + '.webp')}", "WEBP", quality=86, method=6)
print("${nome}.webp", im.size)`]);
  fs.rmSync(origem);
}
/* Recorte para o alto da página inicial: começa numa fala, não numa tela — quem
   chega precisa entender em dois segundos que aquilo é uma transcrição de reunião. */
execFileSync('python3', ['-c', `
from PIL import Image
im = Image.open("${path.join(IMG, 'ata.webp')}").convert("RGB")
im.crop((0, 578, im.width, 1810)).save("${path.join(IMG, 'ata-topo.webp')}", "WEBP", quality=86, method=6)
print("ata-topo.webp gerado")`]);

console.log('imagens em public/img/');
