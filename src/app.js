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

  let gravador = null, pedacos = [], blobGravacao = null;
  let ctxAudio = null, fluxos = [], relogio = null, segundos = 0;
  let ocupado = false;

  window.addEventListener('beforeunload', e => {
    if (!ocupado) return;
    e.preventDefault();
    e.returnValue = 'A gravação ou a transcrição ainda está em andamento.';
    return e.returnValue;
  });

  function formatoSuportado() {
    for (const m of ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'])
      if (window.MediaRecorder && MediaRecorder.isTypeSupported(m)) return m;
    return '';
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

  $('rec').onclick = async () => {
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

    pedacos = [];
    const tipo = formatoSuportado();
    gravador = new MediaRecorder(fluxoFinal, tipo ? { mimeType: tipo, audioBitsPerSecond: 96000 } : undefined);
    gravador.ondataavailable = ev => { if (ev.data && ev.data.size) pedacos.push(ev.data); };

    gravador.onstop = () => {
      clearInterval(relogio);
      cancelAnimationFrame(anima);
      fluxos.forEach(f => f.getTracks().forEach(t => t.stop()));
      try { ctxAudio.close(); } catch (e) {}
      ocupado = false;
      $('rec').classList.remove('hide'); $('rec').disabled = false;
      $('stop').classList.add('hide'); $('vu').classList.add('hide');
      blobGravacao = new Blob(pedacos, { type: pedacos[0] ? pedacos[0].type : 'video/webm' });
      if (!blobGravacao.size) {
        $('recMsg').innerHTML = '<span class="err">A gravação saiu vazia. Tente de novo.</span>';
        return;
      }
      $('recMsg').innerHTML = `<span class="ok">Gravação de ${fmt(segundos)} pronta</span> — ` +
        `${(blobGravacao.size/1048576).toFixed(1)} MB, ${temSistema ? 'com' : 'sem'} áudio da reunião, ` +
        `${micFluxo ? 'com' : 'sem'} microfone.`;
      $('trans').disabled = false;
      janelas = { voce: !!micFluxo, outros: temSistema };
    };

    telaFluxo.getVideoTracks()[0].addEventListener('ended', () => {
      if (gravador && gravador.state !== 'inactive') gravador.stop();
    });

    let anima;
    const desenhar = () => { medidores.forEach(m => m()); anima = requestAnimationFrame(desenhar); };
    desenhar();

    gravador.start(2000);
    segundos = 0; ocupado = true;
    $('rec').classList.add('hide');
    $('stop').classList.remove('hide');
    $('tempo').classList.remove('hide'); $('vu').classList.remove('hide');
    $('tempo').textContent = '00:00';
    $('recMsg').textContent = 'Gravando. Pode minimizar esta aba, mas não feche.';
    relogio = setInterval(() => { segundos++; $('tempo').textContent = fmt(segundos); }, 1000);
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

  /* separa os dois canais gravados: 0 = você, 1 = participantes */
  async function canais(blob) {
    const buf = await blob.arrayBuffer();
    const ctx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
    const dec = await ctx.decodeAudioData(buf);
    ctx.close();
    const n = dec.numberOfChannels;
    return {
      voce: n > 1 ? dec.getChannelData(0) : (janelas.voce && !janelas.outros ? dec.getChannelData(0) : null),
      outros: n > 1 ? dec.getChannelData(1) : (janelas.outros && !janelas.voce ? dec.getChannelData(0) : null)
    };
  }

  async function transcreverCanal(pipe, dados, quem, idioma, prog) {
    if (!dados || !dados.length) return [];
    const SR = 16000, WIN = 30 * SR, total = Math.ceil(dados.length / WIN);
    const saida = [];
    for (let i = 0; i < total; i++) {
      const off = i * WIN;
      const seg = dados.slice(off, Math.min(off + WIN, dados.length));
      // pula blocos silenciosos: economiza muito tempo em reunião real
      let pico = 0;
      for (let k = 0; k < seg.length; k += 40) pico = Math.max(pico, Math.abs(seg[k]));
      if (pico < 0.012) { prog(i + 1, total); continue; }
      const opts = { return_timestamps: true, task: 'transcribe' };
      if (idioma) opts.language = idioma;
      const r = await pipe(seg, opts);
      const chunks = (r && r.chunks && r.chunks.length) ? r.chunks
        : [{ timestamp: [0, seg.length / SR], text: (r && r.text) || '' }];
      chunks.forEach(c => {
        const txt = (c.text || '').trim();
        if (txt) saida.push({ quem, a: off / SR + (c.timestamp[0] ?? 0), texto: txt });
      });
      prog(i + 1, total);
    }
    return saida;
  }

  $('trans').onclick = async () => {
    if (!blobGravacao) return;
    $('trans').disabled = true;
    ocupado = true;
    $('barWrap').classList.remove('hide');
    $('fique').classList.remove('hide');
    const aviso = m => { $('trMsg').innerHTML = m; };
    try {
      aviso('Separando os canais de áudio…');
      const c = await canais(blobGravacao);
      const pipe = await carregarModelo($('modelo').value, aviso);

      const tarefas = [];
      if (c.voce) tarefas.push(['voce', c.voce]);
      if (c.outros) tarefas.push(['outros', c.outros]);

      const inicio = performance.now();
      let feitos = 0;
      const totalBlocos = tarefas.reduce((s, [, d]) => s + Math.ceil(d.length / (30 * 16000)), 0);

      falas = [];
      for (const [quem, dados] of tarefas) {
        const r = await transcreverCanal(pipe, dados, quem, $('idioma').value, () => {
          feitos++;
          const pct = feitos / totalBlocos * 100;
          $('bar').style.width = pct + '%';
          const resta = (performance.now() - inicio) / feitos * (totalBlocos - feitos) / 1000;
          const falta = feitos >= 2 && resta > 5
            ? ` — faltam ~${resta < 90 ? Math.ceil(resta) + 's' : Math.ceil(resta / 60) + ' min'}` : '';
          aviso(`Etapa 2 de 2 — transcrevendo ${quem === 'voce' ? 'você' : 'os participantes'}: ` +
                `${pct.toFixed(0)}%${falta}`);
        });
        falas = falas.concat(r);
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

  function mostrarAta() {
    $('ataCard').classList.remove('hide');
    $('ata').innerHTML = falas.map(f =>
      `<div class="fala ${f.quem}"><span class="t">${fmt(f.a)}</span>` +
      `<b>${f.quem === 'voce' ? 'VOCÊ' : 'PARTICIPANTES'}</b> ${f.texto}</div>`).join('');
  }

  /* ================= saídas ================= */
  const nomeArquivo = () => 'ata-' + new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');

  function baixar(texto, ext) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([texto], { type: 'text/plain;charset=utf-8' }));
    a.download = nomeArquivo() + '.' + ext;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  const comoTexto = () => falas.map(f =>
    `[${fmt(f.a)}] ${f.quem === 'voce' ? 'VOCÊ' : 'PARTICIPANTES'}: ${f.texto}`).join('\n');

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

  $('baixarTxt').onclick = () => baixar(comoTexto(), 'txt');
  $('baixarVtt').onclick = () => baixar(comoVtt(), 'vtt');

  $('copiarPrompt').onclick = async () => {
    const prompt =
`Abaixo está a transcrição de uma reunião de ${fmt(segundos)}, gerada automaticamente.

Cada linha traz o instante e quem falou. "VOCÊ" é o dono da gravação, captado pelo microfone.
"PARTICIPANTES" reúne todas as outras pessoas, captadas pelo áudio da chamada — elas não estão
separadas individualmente.

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

  window.__salavox = { falas: () => falas, comoTexto, comoVtt,
    gravacao: () => blobGravacao, canais };   // usado pelos testes
})();
