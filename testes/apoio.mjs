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

/* Microfone mudo: exatamente o caso que produziu a ata com 88 alucinações.
   O navegador de teste entrega um bipe no microfone falso, que é o oposto do
   que precisamos reproduzir aqui — então a trilha é substituída por uma de
   ganho zero. Fica digitalmente silenciosa, como um microfone fechado. */
export function micMudo() {
  return `navigator.mediaDevices.getUserMedia = async () => {
    const ac = new AudioContext();
    const o = ac.createOscillator(); const g = ac.createGain();
    g.gain.value = 0;                       // silêncio, não ausência de trilha
    const d = ac.createMediaStreamDestination();
    o.connect(g); g.connect(d); o.start();
    return d.stream;
  };`;
}

/* Tela sintética: troca de "slide" num intervalo conhecido, para que os
   instantes detectados possam ser comparados com valores golden. */
/* Não há simulacro de janela flutuante aqui, e a história vale a nota.

   O primeiro `'documentPictureInPicture' in window` deu falso, e eu já tinha
   escrito um `iframe` de mentira para pôr no lugar. O falso era o teste: a
   API só existe em contexto seguro, e eu havia perguntado numa página
   `about:blank`. Servida em `127.0.0.1`, que o navegador trata como seguro,
   ela está lá — e o bloco de silêncio abre a janela de verdade.

   Fica o registro porque a tentação de simular estava a um passo, e simular
   teria escondido o recurso funcionando. */

export function telaFalsa(segundosPorSlide) {
  return `(spp => {
    navigator.mediaDevices.getDisplayMedia = async () => {
      const c=document.createElement('canvas'); c.width=640; c.height=360;
      const x=c.getContext('2d');
      const cores=['#c0392b','#27ae60','#2980b9','#f1c40f'];
      let ganho = null;
      // Preto no primeiro segundo e pouco, de propósito: é o que acontece quando
      // a captura começa antes de a janela compartilhada pintar. Sem isso a
      // peneira de tela vazia só era exercitada por sorte de cronometragem, e a
      // sabotagem que a remove passava despercebida.
      const t0 = performance.now();
      x.fillStyle='#000'; x.fillRect(0,0,640,360);
      setInterval(()=>{ const dt = performance.now() - t0;
        /* O volume cai no mesmo instante da troca de slide dos 20 s, e cai aqui
           dentro, na mesma leitura de relógio que decide o slide. Antes era um
           setTimeout separado: com a máquina carregada ele disparava algumas
           centenas de milissegundos depois, os dois eventos se descolavam e o
           teste de alinhamento acusava um desencontro que era do próprio
           instrumento. */
        if (ganho) ganho.gain.value = dt >= 20000 ? .06 : .3;
        if (dt < 1200) { x.fillStyle='#000'; x.fillRect(0,0,640,360); return; }
        const i=Math.floor(dt/1000/spp)%4;
        x.fillStyle=cores[i]; x.fillRect(0,0,640,360);
        x.fillStyle='#fff'; x.font='bold 52px sans-serif'; x.fillText('SLIDE '+(i+1),200,200); },100);
      const ac=new AudioContext(); const o=ac.createOscillator(); o.frequency.value=210;
      const g=ac.createGain(); g.gain.value=.3; ganho = g;
      const d=ac.createMediaStreamDestination();
      o.connect(g); g.connect(d); o.start();
      const s=c.captureStream(8); s.addTrack(d.stream.getAudioTracks()[0]); return s;
    };
  })(${segundosPorSlide});`;
}

/* Modelo de transcrição falso. O modelo real vem de uma CDN e não pode ser
   carregado aqui — o que este teste cobre é a integração (fatiamento, canais,
   linha do tempo), não a qualidade do reconhecimento. Isso está declarado no
   README como não verificado, e continua não verificado.

   Uma coisa ele imita de propósito, porque é o defeito que chegou de uma
   reunião de verdade: **diante de silêncio, o Whisper não devolve silêncio.**
   Devolve texto inventado, em laço — a ata real saiu com "O que é isso?" 88
   vezes no canal do microfone fechado. Se o modelo simulado fosse educado e
   devolvesse vazio no silêncio, a peneira poderia ser removida do produto sem
   nenhum teste ficar vermelho. Aqui ele alucina igual. */
export const MODELO_FALSO = {
  contentType: 'application/javascript',
  body: `export const env={allowLocalModels:1,allowRemoteModels:1,backends:{onnx:{wasm:{}}}};
    let n=0;
    export async function pipeline(){ return async (d, opts) => { n++;
      globalThis.__opcoes = opts;      // o teste confere o que o idioma mandou para o modelo
      let soma=0; for (let i=0;i<d.length;i++) soma += d[i]<0 ? -d[i] : d[i];
      const amp = (soma/(d.length||1)).toFixed(4);
      globalThis.__amps = (globalThis.__amps||[]); globalThis.__amps.push(+amp);
      /* silêncio entra, alucinação em laço sai — como no modelo de verdade */
      if (+amp < 0.004) {
        globalThis.__alucinou = (globalThis.__alucinou||0) + 1;
        return {chunks: Array.from({length: 14}, (_, k) =>
          ({timestamp:[k*2, k*2+2], text:'O que é isso?'}))};
      }
      /* instante, dentro desta janela, em que o áudio fica baixo e continua baixo.
         A tela sintética abaixa o volume no mesmo segundo em que troca de slide,
         então este número tem de bater com o instante da tela detectada no vídeo —
         é assim que o teste compara as duas linhas do tempo sem depender de
         cronômetro nenhum. */
      let q = -1;
      for (let i = 5*16000; i + 1600 < d.length; i += 160) {
        let alto = false;
        for (let k = i; k < i + 1600; k += 8) if ((d[k] < 0 ? -d[k] : d[k]) > 0.12) { alto = true; break; }
        if (!alto) { q = i / 16000; break; }
      }
      return {chunks:[
        {timestamp:[1,5], text:'Trecho '+n+' [amp='+amp+'] [quieto='+q.toFixed(2)+']'},
        {timestamp:[9,13],text:'Segunda parte do trecho '+n+'.'}
      ]}; }; }`
};

/* O config.json que vai publicado agora tem os dados do projeto de verdade —
   e eles são públicos por natureza, então isso é correto. Mas quase todos os
   blocos de teste descrevem a **instalação local**: quem baixa o código e serve
   sozinho, sem camada paga. Por isso a página de teste recebe, por padrão, um
   config em branco.

   Quem quiser o outro mundo — conta, plano, painel — registra a própria rota
   depois desta, e a mais recente é a que vale. Assim cada bloco diz por escrito
   em que mundo ele está, em vez de herdar o que estiver no arquivo naquele dia. */
const CONFIG_EM_BRANCO = {
  contentType: 'application/json',
  body: JSON.stringify({ supabaseUrl: '', supabaseAnonKey: '' })
};

export async function paginaLimpa(ctx, erros) {
  const p = await ctx.newPage();
  /* O Chromium do robô se declara `en-US`, e desde que a ferramenta ganhou
     inglês isso passou a mudar o produto embaixo dos testes: a mesma mensagem
     saía traduzida e as esperas por texto em português morriam de tempo. Os
     blocos foram escritos para o produto em português — quem quiser o outro
     idioma pede explicitamente, como faz `t-idioma.mjs`. */
  await p.addInitScript(() => {
    try { localStorage.setItem('salavox.idioma', 'pt'); } catch (e) {}
  });
  await p.route('**/config.json', r => r.fulfill(CONFIG_EM_BRANCO));
  p.on('pageerror', e => erros.push('pageerror: ' + e.message));
  p.on('console', m => {
    // a CDN do runtime de transcrição não é alcançável daqui: o aplicativo tenta,
    // falha e segue com o modelo simulado. É ruído do ambiente, não defeito.
    const ruido = /TUNNEL|Failed to load resource|cdn\.jsdelivr\.net|huggingface\.co/;
    if (m.type() === 'error' && !ruido.test(m.text())) erros.push('console: ' + m.text());
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

/* Clicar em transcrever e esperar o fim.

   Existe porque a armadilha já pegou: esperar por "Ata pronta" logo depois de
   uma transcrição anterior devolve na hora, com a ata velha ainda na tela, e o
   teste passa a conferir o resultado errado. Aqui a mensagem é apagada antes. */
export async function transcrever(p, timeout = 180000) {
  await p.evaluate(() => { document.getElementById('trMsg').textContent = ''; });
  await p.click('#trans');
  await p.waitForFunction(
    /* Em inglês a mesma mensagem sai traduzida — esperar só pelo português
       transformaria o bloco de idioma numa espera de três minutos. */
    () => /Ata pronta|Não consegui|Minutes ready|Could not/.test(
      document.getElementById('trMsg').textContent), null, { timeout });
  return p.textContent('#trMsg');
}
