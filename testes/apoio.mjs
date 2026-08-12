/* Peças compartilhadas pelos testes: servidor, tela falsa, modelo falso e o
   pequeno arcabouço de verificação.

   Regra que originou este arquivo: um dia inteiro foi perdido depurando um
   defeito que não existia, porque o teste rodava contra uma cópia velha do
   aplicativo num diretório de teste. Aqui o servidor aponta para public/ do
   próprio projeto, e o runner constrói antes de subir. Não há como testar o
   que não foi construído agora. */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PUBLICO = path.join(RAIZ, 'public');

const TIPOS = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript',
                '.svg': 'image/svg+xml', '.json': 'application/json', '.txt': 'text/plain' };

export function servir(porta = 8131, raiz = PUBLICO) {
  const s = http.createServer((req, res) => {
    let p = path.join(raiz, decodeURIComponent(req.url.split('?')[0]));
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
    if (!fs.existsSync(p) && fs.existsSync(p + '.html')) p += '.html';
    if (!fs.existsSync(p)) { res.writeHead(404); res.end('nao achei'); return; }
    res.writeHead(200, { 'Content-Type': TIPOS[path.extname(p)] || 'application/octet-stream' });
    fs.createReadStream(p).pipe(res);
  });
  return new Promise(ok => s.listen(porta, '127.0.0.1', () => ok({
    url: `http://127.0.0.1:${porta}`,
    fechar: () => new Promise(r => s.close(r))
  })));
}

/* Tela sintética: troca de "slide" num intervalo conhecido, para que os
   instantes detectados possam ser comparados com valores golden. */
export function telaFalsa(segundosPorSlide) {
  return `(spp => {
    navigator.mediaDevices.getDisplayMedia = async () => {
      const c=document.createElement('canvas'); c.width=640; c.height=360;
      const x=c.getContext('2d');
      const cores=['#c0392b','#27ae60','#2980b9','#f1c40f']; let n=0;
      setInterval(()=>{ const i=Math.floor(n/(spp*10))%4;
        x.fillStyle=cores[i]; x.fillRect(0,0,640,360);
        x.fillStyle='#fff'; x.font='bold 52px sans-serif'; x.fillText('SLIDE '+(i+1),200,200); n++; },100);
      const ac=new AudioContext(); const o=ac.createOscillator(); o.frequency.value=210;
      const g=ac.createGain(); g.gain.value=.3; const d=ac.createMediaStreamDestination();
      // o volume cai aos 20 s: é assim que o teste sabe se a segunda janela de
      // trinta segundos leu mesmo o segundo trecho do áudio, e não de novo o primeiro
      setTimeout(()=>{ g.gain.value=.06; }, 20000);
      o.connect(g); g.connect(d); o.start();
      const s=c.captureStream(8); s.addTrack(d.stream.getAudioTracks()[0]); return s;
    };
  })(${segundosPorSlide});`;
}

/* Modelo de transcrição falso. O modelo real vem de uma CDN e não pode ser
   carregado aqui — o que este teste cobre é a integração (fatiamento, canais,
   linha do tempo), não a qualidade do reconhecimento. Isso está declarado no
   README como não verificado, e continua não verificado. */
export const MODELO_FALSO = {
  contentType: 'application/javascript',
  body: `export const env={allowLocalModels:1,allowRemoteModels:1,backends:{onnx:{wasm:{}}}};
    let n=0;
    export async function pipeline(){ return async (d) => { n++;
      let soma=0; for (let i=0;i<d.length;i++) soma += d[i]<0 ? -d[i] : d[i];
      const amp = (soma/(d.length||1)).toFixed(4);
      return {chunks:[
        {timestamp:[1,5], text:'Trecho '+n+' [amp='+amp+']'},
        {timestamp:[9,13],text:'Segunda parte do trecho '+n+'.'}
      ]}; }; }`
};

export async function paginaLimpa(ctx, erros) {
  const p = await ctx.newPage();
  p.on('pageerror', e => erros.push('pageerror: ' + e.message));
  p.on('console', m => {
    if (m.type() === 'error' && !/TUNNEL|Failed to load resource/.test(m.text())) erros.push('console: ' + m.text());
  });
  await p.route('**/@huggingface/transformers@**', r => r.fulfill(MODELO_FALSO));
  return p;
}

/* Arcabouço mínimo. Cada verificação declara o valor esperado por escrito —
   nunca recalculado pela mesma função que está sendo testada. */
export function bloco(nome) {
  const itens = [];
  return {
    nome, itens,
    conferir(oque, real, esperado) {
      const ok = JSON.stringify(real) === JSON.stringify(esperado);
      itens.push({ oque, ok, real, esperado });
    },
    entre(oque, real, min, max) {
      const ok = typeof real === 'number' && real >= min && real <= max;
      itens.push({ oque, ok, real, esperado: `entre ${min} e ${max}` });
    },
    verdade(oque, real) { itens.push({ oque, ok: !!real, real, esperado: true }); },
    get passou() { return itens.every(i => i.ok); }
  };
}
