(function () {
  const $ = id => document.getElementById(id);
  const pad2 = n => String(n).padStart(2, '0');
  const fmt = t => { t = Math.max(0, t | 0);
    const h = (t/3600)|0, m = ((t%3600)/60)|0, s = t%60;
    return (h ? h + ':' : '') + pad2(m) + ':' + pad2(s); };

  /* ============================================================
     Ideia central: o microfone e o áudio da reunião chegam por
     caminhos diferentes. Em vez de misturar tudo, gravamos cada
     um em um canal do estéreo — você à esquerda, participantes à
     direita. Na hora de transcrever, os canais voltam separados e
     a ata já sai sabendo quem falou.
     ============================================================ */

  let gravador = null, blobGravacao = null, blobPcm = null;
  let depGrav = null, depPcm = null;
  let ctxAudio = null, ctxPcm = null, fluxos = [], relogio = null, segundos = 0;
  let ocupado = false;

  window.addEventListener('beforeunload', e => {
    if (!ocupado) return;
    e.preventDefault();
    e.returnValue = 'A gravação ou a transcrição ainda está em andamento. ' +
      'O que já foi gravado fica salvo, mas o resto se perde.';
    return e.returnValue;
  });

  function formatoSuportado() {
    for (const m of ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'])
      if (window.MediaRecorder && MediaRecorder.isTypeSupported(m)) return m;
    return '';
  }

  /* ============================================================
     Gravação em pedaços.

     Guardar a reunião inteira na memória da aba não escala: uma
     hora de tela mais áudio passa de um giga, e a aba morre antes
     do fim. Aqui cada pedaço que o MediaRecorder entrega vira um
     arquivo numerado no armazenamento privado do navegador (OPFS),
     fechado na hora. A memória fica plana, o disco é que cresce, e
     o que já foi escrito sobrevive se o navegador fechar sozinho.

     No fim os pedaços são costurados num Blob só — a costura não
     copia nada: o Blob referencia os arquivos que já estão no
     disco. Por isso dá para baixar a gravação de duas horas sem
     nunca carregá-la inteira.
     ============================================================ */

  const TEM_OPFS = !!(navigator.storage && navigator.storage.getDirectory);
  const pasta = () => navigator.storage.getDirectory();
  const nomePedaco = (prefixo, i) => prefixo + '-' + String(i).padStart(5, '0');

  async function nomesDe(prefixo) {
    const dir = await pasta();
    const nomes = [];
    for await (const nome of dir.keys()) if (nome.indexOf(prefixo + '-') === 0) nomes.push(nome);
    return nomes.sort();
  }

  async function juntarPrefixo(prefixo) {
    const dir = await pasta();
    const arqs = [];
    for (const nome of await nomesDe(prefixo))
      arqs.push(await (await dir.getFileHandle(nome)).getFile());
    return new Blob(arqs);
  }

  async function limparPrefixo(prefixo) {
    const dir = await pasta();
    for (const nome of await nomesDe(prefixo)) { try { await dir.removeEntry(nome); } catch (e) {} }
  }

  async function limparTudo() {
    if (!TEM_OPFS) return;
    try {
      await limparPrefixo('gravacao'); await limparPrefixo('pcm');
      try { await (await pasta()).removeEntry('meta'); } catch (e) {}
    } catch (e) {}
  }

  /* Um depósito escreve pedaços numerados e devolve tudo junto no fim.
     Se o OPFS não existir ou o disco recusar, cai para a memória e avisa. */
  function deposito(prefixo) {
    let n = 0, bytes = 0, disco = TEM_OPFS, partes = [], fila = Promise.resolve(), falha = null;
    return {
      escrever(dado) {
        const tam = dado.size || dado.byteLength || 0;
        if (!tam) return fila;
        bytes += tam;
        const i = ++n;
        fila = fila.then(async () => {
          if (!disco) { partes.push(dado); return; }
          try {
            const dir = await pasta();
            const h = await dir.getFileHandle(nomePedaco(prefixo, i), { create: true });
            const w = await h.createWritable();
            await w.write(dado);
            await w.close();
          } catch (e) {
            disco = false; falha = e; partes.push(dado);   // segue gravando, agora na memória
          }
        });
        return fila;
      },
      async juntar() {
        await fila;
        const doDisco = TEM_OPFS ? await juntarPrefixo(prefixo) : new Blob([]);
        return new Blob(doDisco.size ? [doDisco].concat(partes) : partes);
      },
      get bytes() { return bytes; },
      get emDisco() { return disco; },
      get falha() { return falha; }
    };
  }

  /* ============================================================
     Captação do áudio em PCM de 16 kHz, contínua.

     A transcrição precisa de amostras a 16 kHz. Decodificar o
     arquivo inteiro no fim para obtê-las é justamente o que
     estoura a memória: uma hora de estéreo decodificado passa de
     um giga. Então gravamos, em paralelo, o áudio cru já no
     formato que o Whisper quer — dois canais Int16 a 16 kHz, 64 KB
     por segundo — direto no disco. Depois a transcrição lê fatias
     de trinta segundos desse arquivo, sem decodificar nada.

     O contador de quadros do worklet garante que nenhum bloco se
     perca: se o navegador pular um, entram zeros no lugar e a
     linha do tempo continua exata.
     ============================================================ */

  const CODIGO_WORKLET = `
class Toca extends AudioWorkletProcessor {
  constructor(){
    super(); this.p=[]; this.n=0; this.esperado=-1; this.fim=false;
    this.port.onmessage = ev => {
      // 'inicio' descarta o que foi captado antes de o gravador começar, para
      // que a amostra zero deste arquivo seja o segundo zero da reunião
      if (ev.data === 'inicio'){ this.p=[]; this.n=0; this.esperado=-1; return; }
      this.despejar(true); this.fim=true;
    };
  }
  despejar(ultimo){
    const j = new Int16Array(this.n*2); let o=0;
    for (const t of this.p){ j.set(t,o); o+=t.length; }
    this.p=[]; this.n=0;
    this.port.postMessage({ d: j.buffer, fim: !!ultimo }, [j.buffer]);
  }
  guardar(q, a, b){
    const s = new Int16Array(q*2);
    if (a) for (let i=0;i<q;i++){
      let x=a[i]; if(x>1)x=1; else if(x<-1)x=-1; s[i*2]=x*32767;
      if (b){ let y=b[i]; if(y>1)y=1; else if(y<-1)y=-1; s[i*2+1]=y*32767; }
    }
    this.p.push(s); this.n+=q;
  }
  process(entradas){
    if (this.fim) return true;
    const e = entradas[0] || [];
    const q = e.length ? e[0].length : 128;
    if (this.esperado < 0) this.esperado = currentFrame;
    const buraco = currentFrame - this.esperado;
    if (buraco > 0 && buraco < 16000*30) this.guardar(buraco, null, null);
    this.esperado = currentFrame + q;
    this.guardar(q, e[0] || null, e.length > 1 ? e[1] : null);
    if (this.n >= 16000*4) this.despejar(false);
    return true;
  }
}
registerProcessor('toca', Toca);`;

  let fecharPcm = async () => {};
  let marcarInicioPcm = () => {};

  async function ligarPcm(micFluxo, telaFluxo, temSistema, aoReceber) {
    ctxPcm = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
    const jp = ctxPcm.createChannelMerger(2);
    if (micFluxo) ctxPcm.createMediaStreamSource(micFluxo).connect(jp, 0, 0);
    if (temSistema) ctxPcm.createMediaStreamSource(new MediaStream(telaFluxo.getAudioTracks())).connect(jp, 0, 1);
    const mudo = ctxPcm.createGain();
    mudo.gain.value = 0;
    mudo.connect(ctxPcm.destination);

    try {
      const url = URL.createObjectURL(new Blob([CODIGO_WORKLET], { type: 'text/javascript' }));
      await ctxPcm.audioWorklet.addModule(url);
      URL.revokeObjectURL(url);
      const no = new AudioWorkletNode(ctxPcm, 'toca', {
        numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1],
        channelCount: 2, channelCountMode: 'explicit', channelInterpretation: 'discrete'
      });
      let acabou;
      const ultimo = new Promise(res => { acabou = res; });
      no.port.onmessage = ev => {
        if (ev.data.d && ev.data.d.byteLength) aoReceber(ev.data.d);
        if (ev.data.fim) acabou();
      };
      jp.connect(no); no.connect(mudo);
      marcarInicioPcm = () => no.port.postMessage('inicio');
      // ao encerrar, o worklet ainda tem alguns segundos no buffer: peça e espere
      fecharPcm = async () => {
        no.port.postMessage('fim');
        await Promise.race([ultimo, new Promise(res => setTimeout(res, 3000))]);
        try { await ctxPcm.close(); } catch (e) {}
      };
      return 'worklet';
    } catch (e) {
      // navegador sem AudioWorklet: o nó antigo ainda dá conta
      const sp = ctxPcm.createScriptProcessor(4096, 2, 2);
      let ligado = false;
      marcarInicioPcm = () => { ligado = true; };
      sp.onaudioprocess = ev => {
        if (!ligado) return;
        const a = ev.inputBuffer.getChannelData(0);
        const b = ev.inputBuffer.numberOfChannels > 1 ? ev.inputBuffer.getChannelData(1) : null;
        const q = a.length, s = new Int16Array(q * 2);
        for (let i = 0; i < q; i++) {
          let x = a[i]; if (x > 1) x = 1; else if (x < -1) x = -1; s[i*2] = x * 32767;
          if (b) { let y = b[i]; if (y > 1) y = 1; else if (y < -1) y = -1; s[i*2+1] = y * 32767; }
        }
        aoReceber(s.buffer);
      };
      jp.connect(sp); sp.connect(mudo);
      fecharPcm = async () => { try { await ctxPcm.close(); } catch (e) {} };
      return 'scriptprocessor';
    }
  }

  /* medidor de nível, só para a pessoa ver que está captando */
  function medidor(ctx, node, alvo) {
    const an = ctx.createAnalyser();
    an.fftSize = 512;
    node.connect(an);
    const buf = new Uint8Array(an.frequencyBinCount);
    return () => {
      an.getByteTimeDomainData(buf);
      let pico = 0;
      for (const v of buf) pico = Math.max(pico, Math.abs(v - 128));
      alvo.style.width = Math.min(100, pico / 60 * 100) + '%';
    };
  }

  /* ============================================================
     Consentimento. A responsabilidade de avisar os participantes é
     de quem grava — a ferramenta não tem como verificar isso, então
     ao menos obriga a confirmação explícita e oferece o texto pronto.
     ============================================================ */
  const AVISO = 'Aviso a todos: estou gravando esta reunião para gerar a ata. ' +
    'A gravação e a transcrição ficam no meu computador e não são enviadas a nenhum serviço externo. ' +
    'Quem preferir que não seja gravado, por favor diga agora.';

  $('okConsent').onchange = () => { $('rec').disabled = !$('okConsent').checked; };

  $('copiarAviso').onclick = async () => {
    try {
      await navigator.clipboard.writeText(AVISO);
      $('avisoMsg').innerHTML = '<span class="ok">aviso copiado</span>';
    } catch (e) {
      $('avisoMsg').textContent = AVISO;
    }
    setTimeout(() => { $('avisoMsg').textContent = ''; }, 4000);
  };

  $('rec').onclick = async () => {
    if (!$('okConsent').checked) return;
    if (!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia && window.MediaRecorder)) {
      $('recMsg').innerHTML = '<span class="err">Este navegador não grava a tela. Use Chrome ou Edge no computador.</span>';
      return;
    }
    $('rec').disabled = true;
    $('recMsg').textContent = 'Escolha a janela da reunião e marque a opção de compartilhar o áudio…';

    let telaFluxo, micFluxo = null;
    try {
      telaFluxo = await navigator.mediaDevices.getDisplayMedia({
        video: $('tela').checked ? { frameRate: 8 } : { frameRate: 2 },
        audio: true
      });
    } catch (e) {
      $('recMsg').innerHTML = '<span class="err">Compartilhamento cancelado ou negado pelo navegador.</span>';
      $('rec').disabled = false;
      return;
    }

    if ($('mic').checked) {
      try {
        micFluxo = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true }
        });
      } catch (e) {
        $('recMsg').innerHTML = '<span class="err">Sem acesso ao microfone: a ata sairá sem as suas falas.</span>';
      }
    }

    const temSistema = telaFluxo.getAudioTracks().length > 0;
    if (!temSistema && !micFluxo) {
      telaFluxo.getTracks().forEach(t => t.stop());
      $('recMsg').innerHTML = '<span class="err">Nenhuma fonte de áudio. Ao compartilhar, marque "compartilhar áudio".</span>';
      $('rec').disabled = false;
      return;
    }

    // espaço em disco: melhor descobrir agora que no minuto quarenta
    let folga = null;
    try {
      const est = await navigator.storage.estimate();
      if (est && est.quota != null && est.usage != null) folga = est.quota - est.usage;
    } catch (e) {}

    await limparTudo();
    esconderRecuperacao();
    depGrav = deposito('gravacao');
    depPcm  = deposito('pcm');
    blobGravacao = blobPcm = null;

    // canal 0 = você, canal 1 = participantes
    ctxAudio = new (window.AudioContext || window.webkitAudioContext)();
    const juntador = ctxAudio.createChannelMerger(2);
    const medidores = [];

    if (micFluxo) {
      const n = ctxAudio.createMediaStreamSource(micFluxo);
      n.connect(juntador, 0, 0);
      medidores.push(medidor(ctxAudio, n, $('vuYou')));
    }
    if (temSistema) {
      const n = ctxAudio.createMediaStreamSource(new MediaStream(telaFluxo.getAudioTracks()));
      n.connect(juntador, 0, 1);
      medidores.push(medidor(ctxAudio, n, $('vuThem')));
    }

    const destino = ctxAudio.createMediaStreamDestination();
    juntador.connect(destino);

    const trilhas = [destino.stream.getAudioTracks()[0]];
    if ($('tela').checked) trilhas.unshift(telaFluxo.getVideoTracks()[0]);
    const fluxoFinal = new MediaStream(trilhas);
    fluxos = [telaFluxo, micFluxo].filter(Boolean);

    const tipo = formatoSuportado();
    gravador = new MediaRecorder(fluxoFinal, tipo ? { mimeType: tipo, audioBitsPerSecond: 96000 } : undefined);
    gravador.ondataavailable = ev => { if (ev.data && ev.data.size) depGrav.escrever(ev.data); };

    const meta = { inicio: Date.now(), mime: tipo || 'video/webm', mic: !!micFluxo,
                   sistema: temSistema, tela: $('tela').checked, segundos: 0 };
    const salvarMeta = async () => {
      if (!TEM_OPFS) return;
      try {
        const h = await (await pasta()).getFileHandle('meta', { create: true });
        const w = await h.createWritable(); await w.write(JSON.stringify(meta)); await w.close();
      } catch (e) {}
    };
    await salvarMeta();

    const modoPcm = await ligarPcm(micFluxo, telaFluxo, temSistema, ab => depPcm.escrever(new Blob([ab])));

    gravador.onstop = async () => {
      clearInterval(relogio);
      cancelAnimationFrame(anima);
      fluxos.forEach(f => f.getTracks().forEach(t => t.stop()));
      try { ctxAudio.close(); } catch (e) {}
      await fecharPcm();
      ocupado = false;
      $('rec').classList.remove('hide'); $('rec').disabled = false;
      $('stop').classList.add('hide'); $('vu').classList.add('hide');
      $('recMsg').textContent = 'Fechando os pedaços gravados…';
      meta.segundos = segundos;
      await salvarMeta();
      blobGravacao = await depGrav.juntar();
      blobPcm = await depPcm.juntar();
      if (!blobGravacao.size && !blobPcm.size) {
        $('recMsg').innerHTML = '<span class="err">A gravação saiu vazia. Tente de novo.</span>';
        return;
      }
      janelas = { voce: !!micFluxo, outros: temSistema };
      const ondeFica = depGrav.emDisco && depPcm.emDisco ? 'em disco' : 'na memória da aba';
      $('recMsg').innerHTML = `<span class="ok">Gravação de ${fmt(segundos)} pronta</span> — ` +
        `${(blobGravacao.size/1048576).toFixed(1)} MB ${ondeFica} ` +
        `(mais ${(blobPcm.size/1048576).toFixed(1)} MB de áudio separado para a transcrição), ` +
        `${temSistema ? 'com' : 'sem'} áudio da reunião, ${micFluxo ? 'com' : 'sem'} microfone.` +
        (depGrav.emDisco ? '' : '<br><span class="err">O disco recusou a escrita, então a gravação ficou na ' +
          'memória: gere a transcrição e baixe os arquivos antes de fechar esta aba.</span>');
      $('trans').disabled = false;
      if ($('tela').checked) $('telasCard').classList.remove('hide');
    };

    telaFluxo.getVideoTracks()[0].addEventListener('ended', () => {
      if (gravador && gravador.state !== 'inactive') gravador.stop();
    });

    let anima;
    const desenhar = () => { medidores.forEach(m => m()); anima = requestAnimationFrame(desenhar); };
    desenhar();

    gravador.start(10000);          // um arquivo a cada dez segundos
    marcarInicioPcm();              // zera o áudio cru no mesmo instante do vídeo
    segundos = 0; ocupado = true;
    $('rec').classList.add('hide');
    $('stop').classList.remove('hide');
    $('tempo').classList.remove('hide'); $('vu').classList.remove('hide');
    $('tempo').textContent = '00:00';

    const ondeVai = depGrav.emDisco ? 'Gravando em pedaços no disco' : 'Gravando na memória da aba';
    const alerta = folga != null && folga < 3 * 1073741824
      ? ` <span class="err">Só há ${(folga/1073741824).toFixed(1)} GB livres para o navegador.</span>` : '';
    const atualizar = () => {
      const mb = (depGrav.bytes + depPcm.bytes) / 1048576;
      $('recMsg').innerHTML = `${ondeVai} — ${mb.toFixed(1)} MB até agora` +
        (modoPcm === 'scriptprocessor' ? ' (áudio pelo caminho antigo)' : '') +
        '. Pode minimizar esta aba, mas não feche.' + alerta;
    };
    atualizar();

    relogio = setInterval(() => {
      segundos++;
      $('tempo').textContent = fmt(segundos);
      if (segundos % 2 === 0) atualizar();
      if (segundos % 15 === 0) { meta.segundos = segundos; salvarMeta(); }
    }, 1000);
  };

  $('stop').onclick = () => { if (gravador && gravador.state !== 'inactive') gravador.stop(); };

  /* ================= transcrição por canal ================= */
  let janelas = { voce: false, outros: false };
  let falas = [];

  const TJS = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0';
  const WASM_BASES = [
    'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.26.0-dev.20260416-b7804b056c/dist/',
    'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.23.0/dist/',
    'https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/'
  ];

  async function acharWasm() {
    for (const b of WASM_BASES) {
      try {
        const r = await fetch(b + 'ort-wasm-simd-threaded.jsep.wasm', { headers: { Range: 'bytes=0-16' } });
        if (r.ok || r.status === 206) return b;
      } catch (e) {}
    }
    return null;
  }

  async function carregarModelo(modelo, aviso) {
    const mod = await import(TJS);
    mod.env.allowLocalModels = false;
    mod.env.allowRemoteModels = true;
    const base = await acharWasm();
    try {
      const w = mod.env.backends && mod.env.backends.onnx && mod.env.backends.onnx.wasm;
      if (w) { w.numThreads = 1; if (base) w.wasmPaths = base; }
    } catch (e) {}
    const visto = {};
    const progress_callback = p => {
      if (p.status === 'progress' && p.file) {
        visto[p.file] = p.progress || 0;
        const v = Object.values(visto);
        const pct = v.reduce((a, b) => a + b, 0) / v.length;
        $('bar').style.width = pct + '%';
        aviso(`Etapa 1 de 2 — baixando o modelo: ${pct.toFixed(0)}% (só na primeira vez)`);
      }
    };
    try {
      return await mod.pipeline('automatic-speech-recognition', modelo,
        { device: 'webgpu', dtype: { encoder_model: 'fp32', decoder_model_merged: 'q4' }, progress_callback });
    } catch (e) {
      aviso('WebGPU indisponível — usando o processador, vai demorar mais.');
      return await mod.pipeline('automatic-speech-recognition', modelo, { dtype: 'q8', progress_callback });
    }
  }

  /* ============================================================
     A transcrição lê o arquivo de PCM em fatias de trinta segundos.
     Cada fatia ocupa menos de dois megabytes, é separada nos dois
     canais na hora e devolvida ao coletor de lixo em seguida. Não
     existe momento em que a reunião inteira esteja na memória —
     por isso o tempo de reunião deixou de ter limite prático.
     ============================================================ */

  const SR = 16000, BYTES_POR_AMOSTRA = 4;   // dois canais Int16

  /* Gravação antiga ou recuperada sem PCM: cai no caminho anterior,
     que decodifica o arquivo inteiro e só serve para reunião curta. */
  async function pcmDoArquivo(blob) {
    const ctx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: SR });
    const dec = await ctx.decodeAudioData(await blob.arrayBuffer());
    ctx.close();
    const a = dec.getChannelData(0);
    const b = dec.numberOfChannels > 1 ? dec.getChannelData(1) : null;
    const s = new Int16Array(a.length * 2);
    for (let i = 0; i < a.length; i++) {
      s[i*2] = Math.max(-1, Math.min(1, a[i])) * 32767;
      if (b) s[i*2+1] = Math.max(-1, Math.min(1, b[i])) * 32767;
    }
    return new Blob([s.buffer]);
  }

  function separar(bruto, q, desl) {
    const dados = new Float32Array(q);
    let pico = 0;
    for (let k = 0; k < q; k++) {
      const v = bruto[k * 2 + desl] / 32768;
      dados[k] = v;
      const abs = v < 0 ? -v : v;
      if (abs > pico) pico = abs;
    }
    return { dados, pico };
  }

  $('trans').onclick = async () => {
    if (!blobPcm && !blobGravacao) return;
    $('trans').disabled = true;
    ocupado = true;
    $('barWrap').classList.remove('hide');
    $('fique').classList.remove('hide');
    const aviso = m => { $('trMsg').innerHTML = m; };
    try {
      if (!blobPcm || !blobPcm.size) {
        aviso('Preparando o áudio…');
        blobPcm = await pcmDoArquivo(blobGravacao);
      }

      const pipe = await carregarModelo($('modelo').value, aviso);

      const JANELA = 30 * SR;
      const totalAmostras = Math.floor(blobPcm.size / BYTES_POR_AMOSTRA);
      const nJanelas = Math.max(1, Math.ceil(totalAmostras / JANELA));
      const quais = [];
      if (janelas.voce) quais.push(['voce', 0]);
      if (janelas.outros) quais.push(['outros', 1]);
      if (!quais.length) quais.push(['voce', 0], ['outros', 1]);

      const totalBlocos = nJanelas * quais.length;
      const inicio = performance.now();
      let feitos = 0;
      const idioma = $('idioma').value;
      falas = [];

      for (let i = 0; i < nJanelas; i++) {
        const ini = i * JANELA, fim = Math.min(ini + JANELA, totalAmostras);
        if (fim <= ini) break;
        const bruto = new Int16Array(
          await blobPcm.slice(ini * BYTES_POR_AMOSTRA, fim * BYTES_POR_AMOSTRA).arrayBuffer());
        const q = fim - ini;

        for (const [quem, desl] of quais) {
          const { dados, pico } = separar(bruto, q, desl);
          // pula blocos silenciosos: economiza muito tempo em reunião real
          if (pico >= 0.012) {
            const opts = { return_timestamps: true, task: 'transcribe' };
            if (idioma) opts.language = idioma;
            const r = await pipe(dados, opts);
            const trechos = (r && r.chunks && r.chunks.length) ? r.chunks
              : [{ timestamp: [0, q / SR], text: (r && r.text) || '' }];
            trechos.forEach(c => {
              const txt = (c.text || '').trim();
              if (txt) falas.push({ quem, a: ini / SR + ((c.timestamp && c.timestamp[0]) || 0), texto: txt });
            });
          }
          feitos++;
          const pct = feitos / totalBlocos * 100;
          $('bar').style.width = pct + '%';
          const resta = (performance.now() - inicio) / feitos * (totalBlocos - feitos) / 1000;
          const falta = feitos >= 2 && resta > 5
            ? ` — faltam ~${resta < 90 ? Math.ceil(resta) + 's' : Math.ceil(resta / 60) + ' min'}` : '';
          aviso(`Etapa 2 de 2 — transcrevendo ${fmt(ini / SR)} de ${fmt(totalAmostras / SR)}: ` +
                `${pct.toFixed(0)}%${falta}`);
        }
      }

      falas.sort((a, b) => a.a - b.a);
      mostrarAta();
      aviso(`<span class="ok">Ata pronta</span> — ${falas.length} trechos.`);
    } catch (e) {
      aviso(`<span class="err">Não consegui transcrever: ${(e && e.message) || e}</span>`);
    } finally {
      $('trans').disabled = false;
      $('fique').classList.add('hide');
      ocupado = false;
    }
  };

  /* junta falas e telas numa linha do tempo só */
  function linhaDoTempo() {
    const itens = falas.map(f => ({ tipo: 'fala', t: f.a, f }))
      .concat(telas.filter(t => t.manter).map(t => ({ tipo: 'tela', t: t.t, tl: t })));
    itens.sort((a, b) => a.t - b.t || (a.tipo === 'tela' ? -1 : 1));   // a tela vem antes da fala
    return itens;
  }

  function mostrarAta() {
    $('ataCard').classList.remove('hide');
    $('ata').innerHTML = linhaDoTempo().map(i => i.tipo === 'fala'
      ? `<div class="fala ${i.f.quem}"><span class="t">${fmt(i.f.a)}</span>` +
        `<b>${i.f.quem === 'voce' ? 'VOCÊ' : 'PARTICIPANTES'}</b> ${i.f.texto}</div>`
      : `<figure class="telaAta"><img src="${i.tl.img.url}">` +
        `<figcaption>tela mostrada em ${fmt(i.tl.t)}</figcaption></figure>`).join('');
  }


  /* ============================================================
     Telas compartilhadas: varre a gravação e guarda os instantes
     em que a imagem muda. É a mesma ideia do ClipContext — uma
     assinatura pequena com os três canais de cor, porque em tons
     de cinza duas telas bem diferentes podem ter o mesmo brilho.
     ============================================================ */
  const vid = $('vid');
  let telas = [], pararVarredura = false;

  function esperar(t) {
    return new Promise(res => {
      let feito = false;
      const ok = () => { if (feito) return; feito = true; vid.removeEventListener('seeked', ok); res(); };
      vid.addEventListener('seeked', ok);
      setTimeout(ok, 8000);
      vid.currentTime = Math.min(t, Math.max(0, vid.duration - 0.05));
    });
  }

  /* MediaRecorder não grava a duração no cabeçalho: o vídeo diz Infinity.
     Buscar um instante muito à frente obriga o navegador a calcular a real. */
  function corrigirDuracao() {
    if (isFinite(vid.duration) && vid.duration > 0) return Promise.resolve();
    return new Promise(res => {
      let feito = false;
      const fim = () => { if (feito) return; feito = true;
        vid.removeEventListener('timeupdate', ao); vid.currentTime = 0; res(); };
      const ao = () => { if (vid.currentTime > 0) fim(); };
      vid.addEventListener('timeupdate', ao);
      vid.currentTime = 1e6;
      setTimeout(fim, 6000);
    });
  }

  const assC = document.createElement('canvas'); assC.width = 32; assC.height = 18;
  const assX = assC.getContext('2d', { willReadFrequently: true });
  function assinatura() {
    assX.drawImage(vid, 0, 0, 32, 18);
    const d = assX.getImageData(0, 0, 32, 18).data, a = new Uint8Array(32*18*3);
    for (let i = 0, j = 0; i < d.length; i += 4) { a[j++] = d[i]; a[j++] = d[i+1]; a[j++] = d[i+2]; }
    return a;
  }
  function diferenca(a, b) {
    if (!a || !b) return 255;
    let s = 0;
    for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]);
    return s / a.length;
  }
  function recortar(largura) {
    const c = document.createElement('canvas');
    c.width = largura;
    c.height = Math.round(largura * vid.videoHeight / vid.videoWidth);
    c.getContext('2d').drawImage(vid, 0, 0, c.width, c.height);
    return { url: c.toDataURL('image/jpeg', 0.82), w: c.width, h: c.height };
  }

  $('pararVarre').onclick = () => { pararVarredura = true; };

  $('varrer').onclick = async () => {
    if (!blobGravacao) return;
    $('varrer').disabled = true;
    $('pararVarre').classList.remove('hide');
    $('tbarWrap').classList.remove('hide');
    pararVarredura = false;
    ocupado = true;
    telas = [];
    try {
      vid.src = URL.createObjectURL(blobGravacao);
      await new Promise((ok, err) => {
        vid.onloadedmetadata = ok;
        vid.onerror = () => err(new Error('não consegui abrir a gravação'));
        setTimeout(() => err(new Error('tempo esgotado ao abrir a gravação')), 25000);
      });
      await corrigirDuracao();
      const dur = vid.duration;
      if (!vid.videoWidth) throw new Error('a gravação não tem imagem — a opção de guardar as telas estava desmarcada?');

      const passo = Math.max(0.6, dur / 900);
      const total = Math.ceil(dur / passo);
      const limiar = 5.5;                       // calibrado no ClipContext com vídeo de slides real
      let anterior = null, guardadas = 0;
      const t0 = performance.now();

      for (let i = 0; i < total && !pararVarredura && guardadas < 80; i++) {
        const t = i * passo;
        await esperar(t);
        await new Promise(r => requestAnimationFrame(r));
        const ass = assinatura();
        if (anterior === null || diferenca(anterior, ass) >= limiar) {
          telas.push({ t: vid.currentTime, img: recortar(900), manter: true, ass });
          anterior = ass;
          guardadas++;
        }
        const pct = (i + 1) / total * 100;
        $('tbar').style.width = pct + '%';
        const resta = (performance.now() - t0) / (i + 1) * (total - i - 1) / 1000;
        const falta = i >= 3 && resta > 4
          ? ` — faltam ~${resta < 90 ? Math.ceil(resta) + 's' : Math.ceil(resta/60) + ' min'}` : '';
        $('telasMsg').textContent = `Procurando telas… ${fmt(t)} de ${fmt(dur)} — ${guardadas} encontrada(s)${falta}`;
      }

      telas.sort((a, b) => a.t - b.t);
      $('telasMsg').innerHTML = `<span class="ok">${telas.length} tela(s) encontrada(s).</span>` +
        (pararVarredura ? ' Interrompido por você.' : '');
      $('telasDica').classList.remove('hide');
      $('todasTelas').classList.remove('hide');
      desenharTelas();
      if (falas.length) mostrarAta();
    } catch (e) {
      $('telasMsg').innerHTML = `<span class="err">${(e && e.message) || e}</span>`;
    } finally {
      $('varrer').disabled = false;
      $('pararVarre').classList.add('hide');
      ocupado = false;
    }
  };

  function desenharTelas() {
    const cx = $('telas');
    cx.innerHTML = '';
    telas.forEach((tl, i) => {
      const fig = document.createElement('figure');
      if (!tl.manter) fig.className = 'off';
      fig.innerHTML = `<img src="${tl.img.url}"><figcaption>${fmt(tl.t)}</figcaption>`;
      fig.onclick = () => {
        telas[i].manter = !telas[i].manter;
        fig.classList.toggle('off', !telas[i].manter);
        contarTelas();
        if (falas.length) mostrarAta();
      };
      cx.appendChild(fig);
    });
    contarTelas();
  }

  function contarTelas() {
    const n = telas.filter(t => t.manter).length;
    $('telasTag').textContent = n + ' de ' + telas.length + ' na ata';
  }

  $('todasTelas').onclick = () => { telas.forEach(t => t.manter = true); desenharTelas(); };

  $('baixarGrav').onclick = () => {
    if (!blobGravacao) return;
    const ext = (blobGravacao.type.indexOf('mp4') >= 0) ? 'mp4' : 'webm';
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blobGravacao);
    a.download = nomeArquivo().replace('ata-', 'gravacao-') + '.' + ext;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 8000);
  };

  /* ================= saídas ================= */
  const nomeArquivo = () => 'ata-' + new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');

  function baixar(texto, ext) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([texto], { type: 'text/plain;charset=utf-8' }));
    a.download = nomeArquivo() + '.' + ext;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  const comoTexto = () => linhaDoTempo().map(i => i.tipo === 'fala'
    ? `[${fmt(i.f.a)}] ${i.f.quem === 'voce' ? 'VOCÊ' : 'PARTICIPANTES'}: ${i.f.texto}`
    : `[${fmt(i.tl.t)}] (nova tela compartilhada)`).join('\n');

  function comoVtt() {
    const t = s => {
      const h = Math.floor(s/3600), m = Math.floor(s%3600/60), sc = s%60;
      return `${pad2(h)}:${pad2(m)}:${sc.toFixed(3).padStart(6,'0')}`;
    };
    return 'WEBVTT\n\n' + falas.map((f, i) => {
      const fim = i + 1 < falas.length ? Math.min(falas[i+1].a, f.a + 12) : f.a + 5;
      return `${t(f.a)} --> ${t(Math.max(fim, f.a + 0.5))}\n` +
             `<v ${f.quem === 'voce' ? 'Você' : 'Participantes'}>${f.texto}`;
    }).join('\n\n') + '\n';
  }

  /* ---- ata em PDF, com cabeçalho e rodapé de página ---- */
  $('baixarPdf').onclick = () => {
    if (!falas.length || !window.jspdf) return;
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
    const PW = 210, PH = 297, M = 18, CW = PW - M * 2;
    const quando = new Date();
    const dataTxt = quando.toLocaleString('pt-BR');
    let pagina = 0;

    const rodape = () => {
      pagina++;
      doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(150);
      doc.text('Gerado pelo Salavox — a gravação não saiu deste computador', M, PH - 10);
      doc.text(String(pagina), PW - M, PH - 10, { align: 'right' });
      doc.setTextColor(30);
    };

    doc.setFont('helvetica', 'bold').setFontSize(19).text('Ata de reunião', M, 30);
    doc.setFont('helvetica', 'normal').setFontSize(10).setTextColor(110);
    const nTelas = telas.filter(t => t.manter).length;
    doc.text(dataTxt + '   |   duração ' + fmt(segundos) + '   |   ' + falas.length +
             (falas.length === 1 ? ' trecho' : ' trechos') +
             (nTelas ? '   |   ' + nTelas + (nTelas === 1 ? ' tela' : ' telas') : ''), M, 38);
    doc.setDrawColor(215).line(M, 44, PW - M, 44);

    doc.setFontSize(8.6).setTextColor(130);
    doc.text(doc.splitTextToSize(
      'Transcrição automática, gerada no próprio computador. "VOCÊ" é a fala captada pelo microfone de ' +
      'quem gravou; "PARTICIPANTES" reúne as demais vozes, captadas pelo áudio da chamada e não ' +
      'separadas individualmente. O texto pode conter erros de reconhecimento.', CW), M, 51);
    doc.setTextColor(30);

    let y = 68;
    doc.setFontSize(9.6);
    linhaDoTempo().forEach(item => {
      if (item.tipo === 'tela') {
        // a tela entra reduzida, com o instante em que apareceu
        const larg = Math.min(CW - 42, 110);
        const alt = larg * item.tl.img.h / item.tl.img.w;
        if (y + alt + 12 > PH - 20) { rodape(); doc.addPage(); y = M + 4; }
        doc.setFont('helvetica', 'normal').setTextColor(140).setFontSize(8.4);
        doc.text(fmt(item.tl.t), M, y);
        doc.setFont('helvetica', 'bold').setTextColor(110).setFontSize(8.4);
        doc.text('TELA', M + 12, y);
        doc.addImage(item.tl.img.url, 'JPEG', M + 42, y - 4, larg, alt);
        y += alt + 8;
        return;
      }
      const f = item.f;
      const quem = f.quem === 'voce' ? 'VOCÊ' : 'PARTICIPANTES';
      const linhas = doc.splitTextToSize(f.texto, CW - 42);
      const alt = Math.max(6, linhas.length * 4.6 + 2.5);
      if (y + alt > PH - 20) { rodape(); doc.addPage(); y = M + 4; }
      doc.setFont('helvetica', 'normal').setTextColor(140).setFontSize(8.4);
      doc.text(fmt(f.a), M, y);
      doc.setFont('helvetica', 'bold').setTextColor(f.quem === 'voce' ? 60 : 110).setFontSize(8.4);
      doc.text(quem, M + 12, y);
      doc.setFont('helvetica', 'normal').setTextColor(35).setFontSize(9.6);
      doc.text(linhas, M + 42, y, { lineHeightFactor: 1.3 });
      y += alt;
    });
    rodape();
    doc.save(nomeArquivo() + '.pdf');
  };

  $('baixarTxt').onclick = () => baixar(comoTexto(), 'txt');
  $('baixarVtt').onclick = () => baixar(comoVtt(), 'vtt');

  $('copiarPrompt').onclick = async () => {
    const prompt =
`Abaixo está a transcrição de uma reunião de ${fmt(segundos)}, gerada automaticamente.

Cada linha traz o instante e quem falou. "VOCÊ" é o dono da gravação, captado pelo microfone.
"PARTICIPANTES" reúne todas as outras pessoas, captadas pelo áudio da chamada — elas não estão
separadas individualmente. As linhas "(nova tela compartilhada)" marcam o instante em que a tela
apresentada mudou; use-as para saber quando o assunto passou de um documento para outro.

Ao responder:
- cite o instante (por exemplo, 12:34) ao mencionar qualquer ponto;
- separe claramente o que foi dito por VOCÊ do que foi dito pelos PARTICIPANTES;
- a transcrição é automática e contém erros: se um trecho parecer incoerente, sinalize em vez de interpretar;
- quando a informação não estiver na transcrição, diga que não é possível saber.

Tarefa: produza uma ata com os assuntos tratados, as decisões, as pendências com responsável
quando houver, e os próximos passos.

---
${comoTexto()}`;
    try {
      await navigator.clipboard.writeText(prompt);
      $('ataMsg').innerHTML = '<span class="ok">prompt copiado</span>';
    } catch (e) {
      $('ataMsg').textContent = 'não consegui copiar automaticamente';
    }
    setTimeout(() => { $('ataMsg').textContent = ''; }, 3000);
  };

  /* ============================================================
     Recuperação. Como cada pedaço é fechado no disco assim que
     chega, uma aba que morre no meio da reunião deixa tudo o que
     já havia sido gravado. Ao abrir a página de novo, oferecemos
     esse material em vez de descartá-lo em silêncio.
     ============================================================ */

  function esconderRecuperacao() { $('recupCard').classList.add('hide'); }

  async function procurarSobras() {
    if (!TEM_OPFS) return;
    let meta = null, bytesGrav = 0, bytesPcm = 0;
    try {
      const dir = await pasta();
      try { meta = JSON.parse(await (await (await dir.getFileHandle('meta')).getFile()).text()); } catch (e) {}
      for (const [prefixo, soma] of [['gravacao', 'g'], ['pcm', 'p']]) {
        for (const nome of await nomesDe(prefixo)) {
          const t = (await (await dir.getFileHandle(nome)).getFile()).size;
          if (soma === 'g') bytesGrav += t; else bytesPcm += t;
        }
      }
    } catch (e) { return; }
    if (!bytesGrav && !bytesPcm) return;

    const dur = bytesPcm ? bytesPcm / BYTES_POR_AMOSTRA / SR : (meta && meta.segundos) || 0;
    const quando = meta && meta.inicio ? new Date(meta.inicio).toLocaleString('pt-BR') : 'sessão anterior';
    $('recupMsg').innerHTML =
      `Encontrei uma gravação que não chegou a ser encerrada: <b>${fmt(dur)}</b>, ` +
      `${((bytesGrav + bytesPcm)/1048576).toFixed(1)} MB, de ${quando}. ` +
      `Ela ficou salva em pedaços no seu computador e ainda dá para transcrever.`;
    $('recupCard').classList.remove('hide');

    $('recupUsar').onclick = async () => {
      $('recupUsar').disabled = true;
      $('recupMsg').textContent = 'Costurando os pedaços…';
      blobGravacao = await juntarPrefixo('gravacao');
      blobPcm = await juntarPrefixo('pcm');
      segundos = Math.round(dur);
      janelas = { voce: !meta || meta.mic !== false, outros: !meta || meta.sistema !== false };
      $('recMsg').innerHTML = `<span class="ok">Gravação recuperada de ${fmt(dur)}</span> — ` +
        `${(blobGravacao.size/1048576).toFixed(1)} MB.`;
      $('trans').disabled = false;
      if (!meta || meta.tela !== false) $('telasCard').classList.remove('hide');
      esconderRecuperacao();
      $('trans').scrollIntoView({ behavior: 'smooth', block: 'center' });
    };
    $('recupApagar').onclick = async () => {
      $('recupApagar').disabled = true;
      await limparTudo();
      esconderRecuperacao();
    };
  }
  procurarSobras();

  window.__salavox = { falas: () => falas, comoTexto, comoVtt,
    gravacao: () => blobGravacao, pcm: () => blobPcm,
    tamanhos: () => ({ grav: depGrav ? depGrav.bytes : 0, pcm: depPcm ? depPcm.bytes : 0,
                       disco: !!(depGrav && depGrav.emDisco) }) };   // usado pelos testes
})();
