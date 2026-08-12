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
  let marcoInicio = 0, marcoFim = 0;          // instantes reais de início e fim, para conferência
  let momentos = [], nomes = [], importado = false, presencial = false;

  /* Registro de consentimento. Para contador e advogado isto vale mais que
     qualquer resumo por IA: não é o consentimento em si — que é dado na
     conversa, entre pessoas — é a prova de que o aviso foi dado, com hora,
     anexada ao mesmo documento que vai para o cliente. */
  let consentimento = null;
  const agora = () => new Date().toLocaleString('pt-BR');
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

  function formatoSuportado(comVideo) {
    // sem imagem o contêiner é de áudio; o Safari não faz webm, só mp4
    const lista = comVideo
      ? ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4']
      : ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
    for (const m of lista)
      if (window.MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(m)) return m;
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

  /* No celular não existe compartilhamento de tela em navegador nenhum: o modo
     presencial já vem escolhido, e o outro fica explicado em vez de quebrado. */
  (function ajustarModos() {
    const temTela = !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia);
    if (!temTela) {
      $('modoMic').checked = true;
      $('modoTela').disabled = true;
      $('modoTela').closest('.modo').style.opacity = '.5';
      $('modoTela').closest('.modo').querySelector('i').textContent =
        'este navegador não compartilha tela — use o computador';
    }
    const trocou = () => {
      const so = $('modoMic').checked;
      $('labelMic').classList.toggle('hide', so);
      $('labelTela').classList.toggle('hide', so);
    };
    $('modoTela').onchange = $('modoMic').onchange = trocou;
    trocou();
  })();

  $('okConsent').onchange = () => {
    $('rec').disabled = !$('okConsent').checked;
    if ($('okConsent').checked) {
      consentimento = { confirmado: agora(), copiado: null, iniciado: null, texto: AVISO };
    } else {
      consentimento = null;
    }
    mostrarConsentimento();
  };

  function mostrarConsentimento() {
    const c = $('consentReg');
    if (!consentimento || !consentimento.iniciado) { c.classList.add('hide'); return; }
    c.classList.remove('hide');
    c.innerHTML = '<b>Registro de consentimento.</b> ' +
      `Quem gravou confirmou às <b>${consentimento.confirmado}</b> que avisaria os participantes` +
      (consentimento.copiado ? `, copiou o texto do aviso às <b>${consentimento.copiado}</b>` : '') +
      ` e iniciou a gravação às <b>${consentimento.iniciado}</b>.` +
      '<br>Texto do aviso oferecido: <i>“' + consentimento.texto + '”</i>' +
      '<br>Este registro é a declaração de quem gravou, não uma verificação feita pelo Salavox — ' +
      'ele não entra na chamada e não tem como conferir o que foi dito.';
  }

  $('copiarAviso').onclick = async () => {
    try {
      await navigator.clipboard.writeText(AVISO);
      if (consentimento) consentimento.copiado = agora();
      $('avisoMsg').innerHTML = '<span class="ok">aviso copiado</span>';
    } catch (e) {
      // navegador sem área de transferência: o texto aparece para copiar à mão,
      // e para o registro isso conta igual — o aviso foi obtido
      if (consentimento) consentimento.copiado = agora();
      $('avisoMsg').textContent = AVISO;
    }
    setTimeout(() => { $('avisoMsg').textContent = ''; }, 4000);
  };

  /* Modo de gravação. O de sempre é tela + áudio da chamada + microfone; o
     outro é só microfone, para reunião presencial — e é o único que funciona no
     celular, porque navegador de celular não compartilha tela. */
  const soMicrofone = () => $('modoMic').checked;

  $('rec').onclick = async () => {
    if (!$('okConsent').checked) return;
    if (!(navigator.mediaDevices && window.MediaRecorder)) {
      $('recMsg').innerHTML = '<span class="err">Este navegador não grava áudio. Tente o Chrome, o Edge, ' +
        'o Firefox ou o Safari atualizados.</span>';
      return;
    }
    if (!soMicrofone() && !navigator.mediaDevices.getDisplayMedia) {
      $('recMsg').innerHTML = '<span class="err">Este navegador não compartilha tela — no celular nenhum ' +
        'compartilha. Marque <b>só o microfone</b> acima para gravar uma reunião presencial.</span>';
      return;
    }
    $('rec').disabled = true;

    /* O microfone é pedido ANTES da tela, de propósito.
       Ao contrário, o navegador troca de tela para o seletor de janela e o
       pedido de microfone fica para depois; em algumas máquinas ele nunca
       aparece, e a gravação sai muda sem ninguém entender por quê. */
    let telaFluxo = null, micFluxo = null;
    if ($('mic').checked || soMicrofone()) {
      $('recMsg').textContent = 'Autorize o microfone…';
      try {
        micFluxo = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true }
        });
      } catch (e) {
        if (soMicrofone()) {
          $('recMsg').innerHTML = '<span class="err">Sem microfone não há o que gravar neste modo.</span>';
          $('rec').disabled = false;
          return;
        }
        $('recMsg').innerHTML = '<span class="err">Sem acesso ao microfone: a ata sairá sem as suas falas.</span>';
      }
    }

    if (!soMicrofone()) {
      $('recMsg').textContent = 'Agora escolha a janela da reunião e marque a opção de compartilhar o áudio…';
      try {
        telaFluxo = await navigator.mediaDevices.getDisplayMedia({
          video: $('tela').checked ? { frameRate: 8 } : { frameRate: 2 },
          audio: true
        });
      } catch (e) {
        if (micFluxo) micFluxo.getTracks().forEach(t => t.stop());   // não deixa o microfone aberto à toa
        $('recMsg').innerHTML = '<span class="err">Compartilhamento cancelado ou negado pelo navegador.</span>';
        $('rec').disabled = false;
        return;
      }
    }

    const temSistema = !!(telaFluxo && telaFluxo.getAudioTracks().length);
    if (!temSistema && !micFluxo) {
      if (telaFluxo) telaFluxo.getTracks().forEach(t => t.stop());
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
    momentos = []; importado = false;
    presencial = soMicrofone();
    $('marcasMsg').textContent = '';

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
    const gravaVideo = !soMicrofone() && $('tela').checked && telaFluxo.getVideoTracks().length;
    if (gravaVideo) trilhas.unshift(telaFluxo.getVideoTracks()[0]);
    const fluxoFinal = new MediaStream(trilhas);
    fluxos = [telaFluxo, micFluxo].filter(Boolean);

    const tipo = formatoSuportado(gravaVideo);
    gravador = new MediaRecorder(fluxoFinal, tipo ? { mimeType: tipo, audioBitsPerSecond: 96000 } : undefined);
    gravador.ondataavailable = ev => { if (ev.data && ev.data.size) depGrav.escrever(ev.data); };

    const meta = { inicio: Date.now(), mime: tipo || 'video/webm', mic: !!micFluxo,
                   sistema: temSistema, tela: gravaVideo, segundos: 0, consentimento };
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
      marcoFim = performance.now();
      clearInterval(relogio);
      cancelAnimationFrame(anima);
      fluxos.forEach(f => f.getTracks().forEach(t => t.stop()));
      try { ctxAudio.close(); } catch (e) {}
      await fecharPcm();
      ocupado = false;
      $('rec').classList.remove('hide'); $('rec').disabled = false;
      $('stop').classList.add('hide'); $('vu').classList.add('hide');
      $('marcar').classList.add('hide');
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
      if (gravaVideo) $('telasCard').classList.remove('hide'); else $('telasCard').classList.add('hide');
    };

    if (telaFluxo && telaFluxo.getVideoTracks().length) {
      telaFluxo.getVideoTracks()[0].addEventListener('ended', () => {
        if (gravador && gravador.state !== 'inactive') gravador.stop();
      });
    }

    let anima;
    const desenhar = () => { medidores.forEach(m => m()); anima = requestAnimationFrame(desenhar); };
    desenhar();

    gravador.start(10000);          // um arquivo a cada dez segundos
    marcarInicioPcm();              // zera o áudio cru no mesmo instante do vídeo
    marcoInicio = performance.now();
    if (consentimento) consentimento.iniciado = agora();
    segundos = 0; ocupado = true;
    $('rec').classList.add('hide');
    $('stop').classList.remove('hide');
    $('marcar').classList.remove('hide');
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

  /* ============================================================
     Marcar um momento durante a reunião.

     É a coisa mais barata de implementar e a que mais economiza
     tempo depois: quem está na conversa sabe na hora o que
     importa, e não vai querer reouvir quarenta minutos para achar
     de novo. A tecla M funciona sem tirar o olho da chamada.
     ============================================================ */
  function marcarMomento() {
    if (!gravador || gravador.state === 'inactive') return;
    const t = marcoInicio ? (performance.now() - marcoInicio) / 1000 : segundos;
    if (momentos.some(m => Math.abs(m - t) < 1.5)) return;      // evita marcar duas vezes sem querer
    momentos.push(t);
    $('marcasMsg').innerHTML = `<span class="ok">momento marcado em ${fmt(t)}</span> — ` +
      `${momentos.length} ${momentos.length === 1 ? 'marca' : 'marcas'} nesta reunião`;
  }
  $('marcar').onclick = marcarMomento;
  document.addEventListener('keydown', ev => {
    if (ev.key !== 'm' && ev.key !== 'M' || ev.ctrlKey || ev.metaKey || ev.altKey) return;
    const t = (ev.target && ev.target.tagName) || '';
    if (t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT') return;
    marcarMomento();
  });

  /* ============================================================
     Usar uma gravação que já existe.

     Aqui o áudio precisa ser decodificado de uma vez — não há como
     decodificar um pedaço do meio de um arquivo comprimido. É a
     única etapa do produto que ainda depende de memória, e por
     isso está avisada na tela. Logo depois de decodificar, o áudio
     vira PCM em disco, em blocos de trinta segundos, e a
     transcrição volta a ser tão leve quanto a da gravação própria.

     Arquivo de fora não segue a convenção de canais (você à
     esquerda, os outros à direita), então tudo entra como um
     interlocutor só — que pode ser renomeado na ata.
     ============================================================ */

  $('escolher').onclick = () => $('arquivo').click();
  $('arquivo').onchange = ev => { if (ev.target.files && ev.target.files[0]) importar(ev.target.files[0]); };

  ['dragenter', 'dragover'].forEach(e => $('solta').addEventListener(e, ev => {
    ev.preventDefault(); $('solta').classList.add('sobre');
  }));
  ['dragleave', 'drop'].forEach(e => $('solta').addEventListener(e, ev => {
    ev.preventDefault(); $('solta').classList.remove('sobre');
  }));
  $('solta').addEventListener('drop', ev => {
    const f = ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files[0];
    if (f) importar(f);
  });

  async function importar(arquivo) {
    if (ocupado) return;
    ocupado = true;
    const aviso = m => { $('arqMsg').innerHTML = m; };
    $('impWrap').classList.remove('hide');
    $('impBar').style.width = '0%';
    $('trans').disabled = true;
    try {
      aviso(`Lendo <b>${arquivo.name}</b> (${(arquivo.size/1048576).toFixed(1)} MB)…`);
      await limparTudo();
      esconderRecuperacao();
      momentos = []; telas = []; falas = [];
      $('telasCard').classList.add('hide'); $('ataCard').classList.add('hide');
      $('marcasMsg').textContent = ''; $('recMsg').textContent = '';

      const ctx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: SR });
      let dec;
      try {
        dec = await ctx.decodeAudioData(await arquivo.arrayBuffer());
      } catch (e) {
        throw new Error('não consegui ler o áudio deste arquivo. ' +
          'Formatos que costumam funcionar: mp3, m4a, wav, ogg, webm e mp4.');
      }
      try { ctx.close(); } catch (e) {}
      if (!dec.length) throw new Error('este arquivo não tem áudio.');

      const a = dec.getChannelData(0);
      const b = dec.numberOfChannels > 1 ? dec.getChannelData(1) : null;
      const dep = deposito('pcm');
      const BLOCO = 30 * SR;
      for (let off = 0; off < dec.length; off += BLOCO) {
        const q = Math.min(BLOCO, dec.length - off);
        const bloco = new Int16Array(q * 2);
        for (let i = 0; i < q; i++) {
          let v = b ? (a[off+i] + b[off+i]) / 2 : a[off+i];
          if (v > 1) v = 1; else if (v < -1) v = -1;
          bloco[i*2+1] = v * 32767;        // canal dos participantes
        }
        await dep.escrever(new Blob([bloco.buffer]));
        const pct = (off + q) / dec.length * 100;
        $('impBar').style.width = pct.toFixed(1) + '%';
        aviso(`Preparando o áudio: ${pct.toFixed(0)}%`);
        await new Promise(r => setTimeout(r, 0));   // devolve a vez ao navegador
      }

      blobPcm = await dep.juntar();
      blobGravacao = arquivo;
      segundos = Math.round(dec.length / SR);
      marcoInicio = 0; marcoFim = segundos * 1000;
      janelas = { voce: false, outros: true };
      importado = true;
      consentimento = null; mostrarConsentimento();

      const temVideo = /^video\//.test(arquivo.type) || /\.(mp4|webm|mkv|mov|m4v|avi)$/i.test(arquivo.name);
      if (temVideo) $('telasCard').classList.remove('hide');

      aviso(`<span class="ok">${arquivo.name} pronto</span> — ${fmt(segundos)} de áudio` +
            (temVideo ? ', com vídeo para procurar telas' : '') +
            '. Agora gere a transcrição no passo 2.');
      $('trans').disabled = false;
    } catch (e) {
      $('impBar').style.width = '0%';
      aviso(`<span class="err">${(e && e.message) || e}</span>`);
    } finally {
      ocupado = false;
    }
  }

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

  /* O modelo só deveria ser baixado uma vez: a transformers.js guarda os pesos
     no Cache Storage do navegador. Quando alguém diz que ele baixa toda vez, a
     causa costuma ser o cache desligado ou limpo — então aqui ele é ligado
     explicitamente, e a tela passa a dizer se o modelo já está guardado. */
  async function modeloGuardado() {
    try {
      if (!window.caches) return null;
      const nomes = await caches.keys();
      let bytes = 0, arquivos = 0;
      for (const n of nomes) {
        if (!/transformers|onnx|huggingface/i.test(n)) continue;
        const c = await caches.open(n);
        for (const req of await c.keys()) {
          arquivos++;
          const r = await c.match(req);
          const b = r && r.headers.get('content-length');
          if (b) bytes += Number(b);
        }
      }
      return arquivos ? { arquivos, bytes } : null;
    } catch (e) { return null; }
  }

  async function mostrarModeloGuardado() {
    const g = await modeloGuardado();
    $('modeloMsg').innerHTML = g
      ? `<span class="ok">Modelo já guardado neste navegador</span> — ` +
        `${g.arquivos} ${g.arquivos === 1 ? 'arquivo' : 'arquivos'}` +
        (g.bytes ? `, ${(g.bytes/1048576).toFixed(0)} MB` : '') +
        `. Não será baixado de novo. <button class="ghost sm" id="apagarModelo">apagar</button>`
      : 'O modelo é baixado na primeira transcrição e fica guardado no navegador para as próximas.';
    const b = $('apagarModelo');
    if (b) b.onclick = async () => {
      for (const n of await caches.keys()) if (/transformers|onnx|huggingface/i.test(n)) await caches.delete(n);
      mostrarModeloGuardado();
    };
  }
  mostrarModeloGuardado();

  /* De onde vem o modelo.

     A primeira escolha é o nosso próprio domínio: rede de escritório costuma
     bloquear CDN de terceiro, e o primeiro uso é justamente onde a pessoa
     desiste. O arquivo /modelos/pronto.json é escrito por
     ferramentas/baixar-modelo.mjs e lista o que foi espelhado; se ele não
     existir, ou não tiver o modelo escolhido, cai na CDN pública como antes.

     Em nenhum dos dois casos o áudio sai daqui: o que trafega é o modelo, no
     sentido contrário. */
  let origemModelo = 'CDN pública';

  async function espelhoLocal(modelo) {
    try {
      const r = await fetch('/modelos/pronto.json', { cache: 'no-cache' });
      if (!r.ok) return null;
      const d = await r.json();
      if (!d || !Array.isArray(d.modelos) || d.modelos.indexOf(modelo) < 0) return null;
      return location.origin + '/modelos/';
    } catch (e) { return null; }
  }

  async function carregarModelo(modelo, aviso) {
    const mod = await import(TJS);
    const espelho = await espelhoLocal(modelo);
    if (espelho) {
      mod.env.remoteHost = espelho;
      mod.env.remotePathTemplate = '{model}';
      origemModelo = 'servidor do Salavox';
    } else {
      origemModelo = 'CDN pública';
    }
    mod.env.allowLocalModels = false;
    mod.env.allowRemoteModels = true;
    mod.env.useBrowserCache = true;      // sem isto, alguns navegadores baixam de novo toda vez
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
        // a primeira etapa ocupa os primeiros 20% da barra; os 80% restantes são
        // da transcrição, que é a parte demorada
        $('bar').style.width = (pct * 0.2).toFixed(1) + '%';
        aviso(`Etapa 1 de 2 — baixando o modelo do ${origemModelo}: ${pct.toFixed(0)}% (só na primeira vez)`);
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

  /* ============================================================
     Vocabulário do escritório.

     O modelo não conhece o nome dos seus clientes nem as siglas da
     profissão, e erra sempre nos mesmos. Em vez de tentar ensinar
     o modelo — caminho que depende de recurso que a biblioteca
     pode não expor —, a correção é feita no texto que sai: cada
     palavra é comparada com a lista do escritório e trocada
     quando a diferença é pequena o bastante para ser erro de
     reconhecimento, não outra palavra.

     A régua é apertada de propósito. Trocar "concordata" por
     "conta" seria pior do que deixar o erro: o limite de
     diferença cresce devagar com o tamanho do termo, e termo
     curto quase não é corrigido.
     ============================================================ */

  const semAcento = t => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

  function distancia(a, b) {
    if (a === b) return 0;
    const m = a.length, n = b.length;
    if (Math.abs(m - n) > 3) return 99;
    let linha = Array.from({ length: n + 1 }, (_, i) => i);
    for (let i = 1; i <= m; i++) {
      let ante = linha[0]; linha[0] = i;
      for (let j = 1; j <= n; j++) {
        const tmp = linha[j];
        linha[j] = Math.min(linha[j] + 1, linha[j-1] + 1, ante + (a[i-1] === b[j-1] ? 0 : 1));
        ante = tmp;
      }
    }
    return linha[n];
  }

  const folga = termo => termo.length <= 5 ? 0 : termo.length <= 8 ? 1 : termo.length <= 13 ? 2 : 3;

  function lerVocabulario() {
    return ($('vocab').value || '').split('\n')
      .map(t => t.trim()).filter(t => t.length > 2).slice(0, 200);
  }

  /* devolve o texto corrigido e quantas trocas fez */
  function aplicarVocabulario(texto, termos) {
    if (!termos.length) return { texto, trocas: 0 };
    const pedacos = texto.split(/(\s+)/);          // guarda os espaços para remontar igual
    const palavras = [];
    pedacos.forEach((p, i) => { if (i % 2 === 0) palavras.push(i); });
    let trocas = 0;

    for (const termo of termos) {
      const alvo = semAcento(termo);
      const nPalavras = termo.split(/\s+/).length;
      for (let k = 0; k + nPalavras <= palavras.length; k++) {
        const idx = palavras.slice(k, k + nPalavras);
        const bruto = idx.map(i => pedacos[i]).join(' ');
        const limpo = semAcento(bruto).replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, '');
        // compara sem acento para achar o erro, mas só desiste quando o texto já
        // está idêntico ao termo: "pro-labore" e "pró-labore" são iguais sem
        // acento, e é justamente o acento que precisa ser consertado
        const cru = bruto.replace(/^[^0-9A-Za-zÀ-ÿ]+|[^0-9A-Za-zÀ-ÿ]+$/g, '');
        if (!limpo || cru === termo) continue;
        if (distancia(limpo, alvo) > folga(alvo)) continue;
        const sufixo = bruto.match(/[.,;:!?)\]]+$/);         // preserva a pontuação do fim
        pedacos[idx[0]] = termo + (sufixo ? sufixo[0] : '');
        for (let j = 1; j < idx.length; j++) { pedacos[idx[j]] = ''; pedacos[idx[j] - 1] = ''; }
        trocas++;
      }
    }
    return { texto: pedacos.join('').replace(/\s{2,}/g, ' ').trim(), trocas };
  }

  function corrigirComVocabulario() {
    const termos = lerVocabulario();
    if (!termos.length) return 0;
    let total = 0;
    falas.forEach(f => {
      const r = aplicarVocabulario(f.texto, termos);
      if (r.trocas) { f.texto = r.texto; total += r.trocas; }
    });
    return total;
  }

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
    // apaga o resultado anterior na hora: deixar "Ata pronta" na tela enquanto
    // uma transcrição nova roda faz parecer que já acabou
    aviso('Etapa 1 de 2 — preparando o modelo…');
    $('bar').style.width = '2%';
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
        // A última janela costuma ser um resto de fração de segundo. Mandar isso
        // ao modelo produz texto inventado, com instante além do fim da reunião:
        // um teste com 60,05 s gerou fala datada em 01:09. Resto curto não entra.
        if (fim - ini < SR) break;
        const bruto = new Int16Array(
          await blobPcm.slice(ini * BYTES_POR_AMOSTRA, fim * BYTES_POR_AMOSTRA).arrayBuffer());
        const q = fim - ini;

        for (const [quem, desl] of quais) {
          const { dados, pico } = separar(bruto, q, desl);
          // pula blocos silenciosos: economiza muito tempo em reunião real
          if (pico >= 0.012) {
            const opts = { return_timestamps: true, task: $('saida').value };
            if (idioma) opts.language = idioma;
            const r = await pipe(dados, opts);
            const trechos = (r && r.chunks && r.chunks.length) ? r.chunks
              : [{ timestamp: [0, q / SR], text: (r && r.text) || '' }];
            trechos.forEach(c => {
              const txt = (c.text || '').trim();
              // o instante devolvido pelo modelo é preso ao tamanho da janela:
              // sem isso, um trecho mal datado joga a fala para depois do fim
              const dentro = Math.min(Math.max((c.timestamp && c.timestamp[0]) || 0, 0), q / SR);
              if (txt) falas.push({ quem, a: ini / SR + dentro, texto: txt });
            });
          }
          feitos++;
          const pct = feitos / totalBlocos * 100;
          $('bar').style.width = (20 + pct * 0.8).toFixed(1) + '%';
          const resta = (performance.now() - inicio) / feitos * (totalBlocos - feitos) / 1000;
          const falta = feitos >= 2 && resta > 5
            ? ` — faltam ~${resta < 90 ? Math.ceil(resta) + 's' : Math.ceil(resta / 60) + ' min'}` : '';
          aviso(`Etapa 2 de 2 — transcrevendo ${fmt(ini / SR)} de ${fmt(totalAmostras / SR)}: ` +
                `${pct.toFixed(0)}%${falta}`);
        }
      }

      mostrarModeloGuardado();
      falas.sort((a, b) => a.a - b.a);
      const trocas = corrigirComVocabulario();
      mostrarAta();
      aviso(`<span class="ok">Ata pronta</span> — ${falas.length} trechos` +
            (trocas ? `, ${trocas} ${trocas === 1 ? 'termo corrigido' : 'termos corrigidos'} pelo vocabulário` : '') +
            '.');
    } catch (e) {
      aviso(`<span class="err">Não consegui transcrever: ${(e && e.message) || e}</span>`);
    } finally {
      $('trans').disabled = false;
      $('fique').classList.add('hide');
      ocupado = false;
    }
  };

  /* ============================================================
     Quem falou, com nome.

     A separação por canal diz "você" e "os outros"; ela não sabe
     que os outros são a Maria e o João. Quem sabe é quem estava na
     reunião — então o nome se digita aqui e vale para a ata, o
     PDF, o texto e a legenda. Clicar no nome de uma fala percorre
     a lista, que é o suficiente para uma reunião com duas ou três
     pessoas do outro lado.
     ============================================================ */

  const rotuloPadrao = f => f.quem === 'voce'
    ? ($('nomeVoce').value.trim() || (presencial ? 'SALA' : 'VOCÊ'))
    : ($('nomeGrupo').value.trim() || (importado ? 'TRANSCRIÇÃO' : 'PARTICIPANTES'));
  const rotulo = f => f.nome || rotuloPadrao(f);

  function desenharChips() {
    $('chips').innerHTML = nomes.map((n, i) =>
      `<span class="chip">${escapar(n)}<button data-i="${i}" title="remover">×</button></span>`).join('');
  }

  const escapar = t => String(t).replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  $('chips').onclick = ev => {
    const b = ev.target.closest('button');
    if (!b) return;
    const fora = nomes.splice(+b.dataset.i, 1)[0];
    falas.forEach(f => { if (f.nome === fora) f.nome = null; });
    desenharChips(); mostrarAta();
  };

  $('nomeNovo').onkeydown = ev => {
    if (ev.key !== 'Enter') return;
    const n = $('nomeNovo').value.trim();
    if (n && nomes.indexOf(n) < 0 && nomes.length < 8) { nomes.push(n); desenharChips(); }
    $('nomeNovo').value = '';
  };
  $('nomeVoce').oninput = $('nomeGrupo').oninput = () => { if (falas.length) mostrarAta(); };

  /* A transcrição erra, e ata com o nome do cliente escrito errado é
     constrangimento. O texto é editável no lugar: sai daqui direto para o PDF,
     o texto e a legenda. Só grava ao sair do campo — atualizar a cada tecla
     redesenharia a ata e tiraria o cursor do lugar. */
  $('ata').addEventListener('focusout', ev => {
    const t = ev.target.closest && ev.target.closest('.txt');
    if (!t) return;
    const f = falas[+t.dataset.i];
    if (!f) return;
    const novo = t.textContent.replace(/\s+/g, ' ').trim();
    if (novo && novo !== f.texto) { f.texto = novo; f.corrigida = true; }
    else if (!novo) t.textContent = f.texto;
  });

  $('ata').onclick = ev => {
    const q = ev.target.closest('.quem');
    if (q) {
      const f = falas[+q.dataset.i];
      if (!f) return;
      const lista = [null].concat(nomes);
      f.nome = lista[(lista.indexOf(f.nome || null) + 1) % lista.length];
      mostrarAta();
      return;
    }
    if (ev.target.closest('.txt')) return;
    const m = ev.target.closest('.momento');
    if (m) { momentos.splice(+m.dataset.i, 1); mostrarAta(); }
  };

  /* junta falas, telas e momentos marcados numa linha do tempo só */
  function linhaDoTempo() {
    const ordem = { tela: 0, momento: 1, fala: 2 };   // no mesmo segundo, a imagem vem antes da fala
    const itens = falas.map((f, i) => ({ tipo: 'fala', t: f.a, f, i }))
      .concat(telas.filter(t => t.manter).map(t => ({ tipo: 'tela', t: t.t, tl: t })))
      .concat(momentos.map((m, i) => ({ tipo: 'momento', t: m, i })));
    itens.sort((a, b) => a.t - b.t || ordem[a.tipo] - ordem[b.tipo]);
    return itens;
  }

  function mostrarAta() {
    $('ataCard').classList.remove('hide');
    $('iaCard').classList.remove('hide');
    mostrarConsentimento();
    $('ata').innerHTML = linhaDoTempo().map(i => {
      if (i.tipo === 'fala')
        return `<div class="fala ${i.f.quem}"><span class="t">${fmt(i.f.a)}</span>` +
               `<button class="quem" data-i="${i.i}" title="clique para trocar quem falou">` +
               `${escapar(rotulo(i.f))}</button> ` +
               `<span class="txt" contenteditable="true" spellcheck="true" data-i="${i.i}" ` +
               `title="clique para corrigir o texto">${escapar(i.f.texto)}</span></div>`;
      if (i.tipo === 'momento')
        return `<div class="momento" data-i="${i.i}" title="clique para remover esta marca">` +
               `<b>★ ${fmt(i.t)}</b> momento marcado durante a reunião</div>`;
      return `<figure class="telaAta"><img src="${i.tl.img.url}">` +
             `<figcaption>tela mostrada em ${fmt(i.tl.t)}</figcaption></figure>`;
    }).join('');
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
  /* Tela sem informação: preta, branca ou de uma cor só. Os primeiros instantes
     de um compartilhamento costumam ser assim — a captura começa antes de a
     janela pintar —, e sem esta peneira a ata abria com um retângulo preto
     apresentado como "tela mostrada em 00:00". */
  function semConteudo(ass) {
    let min = 255, max = 0;
    for (let i = 0; i < ass.length; i++) {
      if (ass[i] < min) min = ass[i];
      if (ass[i] > max) max = ass[i];
    }
    return max - min < 12;
  }

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
      if (!vid.videoWidth) {
        // não é erro: é uma gravação só de áudio. O cartão some e a ata segue.
        $('telasCard').classList.add('hide');
        $('telasMsg').textContent = '';
        $('varrer').disabled = false;
        $('pararVarre').classList.add('hide');
        ocupado = false;
        return;
      }

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
        const mudou = anterior === null || diferenca(anterior, ass) >= limiar;
        // o intervalo mínimo evita guardar duas vezes a mesma tela durante uma
        // transição, quando o quadro do meio já difere do anterior e do seguinte
        const cedoDemais = telas.length && vid.currentTime - telas[telas.length - 1].t < 1.2;
        if (mudou && !semConteudo(ass) && !cedoDemais) {
          telas.push({ t: vid.currentTime, img: recortar(900), manter: true, ass });
          guardadas++;
        }
        if (mudou) anterior = ass;
        const pct = (i + 1) / total * 100;
        $('tbar').style.width = pct + '%';
        const resta = (performance.now() - t0) / (i + 1) * (total - i - 1) / 1000;
        const falta = i >= 3 && resta > 4
          ? ` — faltam ~${resta < 90 ? Math.ceil(resta) + 's' : Math.ceil(resta/60) + ' min'}` : '';
        $('telasMsg').textContent = `Procurando telas… ${fmt(t)} de ${fmt(dur)} — ` +
          `${guardadas} ${guardadas === 1 ? 'encontrada' : 'encontradas'}${falta}`;
      }

      telas.sort((a, b) => a.t - b.t);
      $('telasMsg').innerHTML = `<span class="ok">${telas.length === 1 ? '1 tela encontrada' : telas.length + ' telas encontradas'}.</span>` +
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
  /* A marca viaja com o arquivo. A ata é encaminhada para gente que nunca ouviu
     falar do produto, e o nome do arquivo é a primeira coisa que ela lê. */
  const nomeArquivo = () => 'salavox-ata-' + new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');

  function baixar(texto, ext) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([texto], { type: 'text/plain;charset=utf-8' }));
    a.download = nomeArquivo() + '.' + ext;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  const cabecalhoConsentimento = () => (consentimento && consentimento.iniciado)
    ? `REGISTRO DE CONSENTIMENTO\nConfirmado às ${consentimento.confirmado}` +
      (consentimento.copiado ? `, aviso copiado às ${consentimento.copiado}` : '') +
      `, gravação iniciada às ${consentimento.iniciado}.\nTexto oferecido: "${consentimento.texto}"\n` +
      'Declaração de quem gravou, não verificação feita pelo Salavox.\n\n'
    : '';

  const blocosResumo = () => resumos.filter(r => r.noPdf)
    .map(r => r.titulo.toUpperCase() + '\n' + r.texto + '\n').join('\n');

  const RODAPE_MARCA = '\n---\nAta gerada pelo Salavox (salavox.com) — a gravação e a transcrição ' +
    'aconteceram no computador de quem gravou, sem passar por servidor nenhum.\n';

  const comoTexto = () => cabecalhoConsentimento() +
    (blocosResumo() ? blocosResumo() + '\n---\n\n' : '') + linhaDoTempo().map(i =>
    i.tipo === 'fala'    ? `[${fmt(i.f.a)}] ${rotulo(i.f)}: ${i.f.texto}` :
    i.tipo === 'momento' ? `[${fmt(i.t)}] *** momento marcado durante a reunião ***`
                         : `[${fmt(i.tl.t)}] (nova tela compartilhada)`).join('\n');

  function comoVtt() {
    const t = s => {
      const h = Math.floor(s/3600), m = Math.floor(s%3600/60), sc = s%60;
      return `${pad2(h)}:${pad2(m)}:${sc.toFixed(3).padStart(6,'0')}`;
    };
    return 'WEBVTT\nNOTE gerado pelo Salavox — salavox.com\n\n' + falas.map((f, i) => {
      const fim = i + 1 < falas.length ? Math.min(falas[i+1].a, f.a + 12) : f.a + 5;
      return `${t(f.a)} --> ${t(Math.max(fim, f.a + 0.5))}\n` +
             `<v ${rotulo(f)}>${f.texto}`;
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
             (nTelas ? '   |   ' + nTelas + (nTelas === 1 ? ' tela' : ' telas') : '') +
             (momentos.length ? '   |   ' + momentos.length +
               (momentos.length === 1 ? ' momento marcado' : ' momentos marcados') : ''), M, 38);
    doc.setDrawColor(215).line(M, 44, PW - M, 44);

    doc.setFontSize(8.6).setTextColor(130);
    doc.text(doc.splitTextToSize(importado
      ? 'Transcrição automática de um arquivo já existente, gerada no próprio computador. Como o áudio ' +
        'não foi captado em canais separados, as falas não são atribuídas a pessoas diferentes. O texto ' +
        'pode conter erros de reconhecimento.'
      : 'Transcrição automática, gerada no próprio computador. A primeira coluna diz quem falou: o ' +
        'microfone de quem gravou de um lado, e as demais vozes, captadas pelo áudio da chamada, do ' +
        'outro — estas não são separadas individualmente. O texto pode conter erros de reconhecimento.',
      CW), M, 51);
    doc.setTextColor(30);

    let y = 68;
    if (consentimento && consentimento.iniciado) {
      const linhas = doc.setFontSize(8.4).splitTextToSize(
        'REGISTRO DE CONSENTIMENTO — quem gravou confirmou às ' + consentimento.confirmado +
        ' que avisaria os participantes' +
        (consentimento.copiado ? ', copiou o texto do aviso às ' + consentimento.copiado : '') +
        ' e iniciou a gravação às ' + consentimento.iniciado + '. Texto oferecido: "' +
        consentimento.texto + '" Este registro é a declaração de quem gravou, não uma verificação ' +
        'feita pelo Salavox.', CW - 12);
      const alt = linhas.length * 3.6 + 8;
      doc.setFillColor(244, 246, 246).setDrawColor(200);
      doc.roundedRect(M, y - 4, CW, alt, 2, 2, 'FD');
      doc.setTextColor(90).text(linhas, M + 6, y + 2, { lineHeightFactor: 1.28 });
      doc.setTextColor(30);
      y += alt + 8;
    }
    /* Resumo e pendências vêm antes da transcrição: é o que o cliente lê.
       O texto pode ter vindo de um modelo, então sai marcado como tal — a ata
       não pode dar a entender que alguém revisou o que a máquina escreveu. */
    resumos.filter(r => r.noPdf).forEach(r => {
      const titulo = r.titulo.toUpperCase();
      const corpo = doc.setFont('helvetica', 'normal').setFontSize(9.6)
        .splitTextToSize(r.texto, CW - 6);
      if (y + 16 > PH - 20) { rodape(); doc.addPage(); y = M + 4; }
      doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(47, 111, 102);
      doc.text(titulo, M, y);
      y += 6;
      doc.setFont('helvetica', 'normal').setFontSize(9.6).setTextColor(35);
      corpo.forEach(linha => {
        if (y > PH - 22) { rodape(); doc.addPage(); y = M + 4; }
        doc.text(linha, M + 3, y);
        y += 4.7;
      });
      y += 6;
    });
    if (resumos.some(r => r.noPdf)) {
      doc.setFont('helvetica', 'normal').setFontSize(7.6).setTextColor(150);
      doc.text('Texto acima gerado por modelo de linguagem a partir da transcrição, sem revisão humana.', M, y);
      doc.setDrawColor(225).line(M, y + 4, PW - M, y + 4);
      doc.setTextColor(30);
      y += 12;
    }

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
      if (item.tipo === 'momento') {
        if (y + 9 > PH - 20) { rodape(); doc.addPage(); y = M + 4; }
        doc.setFont('helvetica', 'normal').setTextColor(140).setFontSize(8.4);
        doc.text(fmt(item.t), M, y);
        doc.setFont('helvetica', 'bold').setTextColor(150, 110, 40).setFontSize(8.4);
        doc.text('MOMENTO', M + 12, y);
        doc.setFont('helvetica', 'normal').setTextColor(120).setFontSize(9);
        doc.text('marcado durante a reunião', M + 42, y);
        doc.setTextColor(30);
        y += 8;
        return;
      }
      const f = item.f;
      // o rótulo é aparado para não invadir a coluna do texto
      let quem = rotulo(f);
      doc.setFont('helvetica', 'bold').setFontSize(8.4);
      while (quem.length > 4 && doc.getTextWidth(quem) > 28) quem = quem.slice(0, -1);
      if (quem !== rotulo(f)) quem = quem.slice(0, -1) + '.';
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

  $('baixarTxt').onclick = () => baixar(comoTexto() + '\n' + RODAPE_MARCA, 'txt');
  $('baixarVtt').onclick = () => baixar(comoVtt(), 'vtt');

  $('copiarPrompt').onclick = async () => {
    const prompt =
`Abaixo está a transcrição de uma reunião de ${fmt(segundos)}, gerada automaticamente.

Cada linha traz o instante e quem falou. As linhas "(nova tela compartilhada)" marcam o instante em
que a tela apresentada mudou; use-as para saber quando o assunto passou de um documento para outro.
As linhas "*** momento marcado ***" foram marcadas à mão por quem estava na reunião: trate o que
está em volta delas como importante.

Ao responder:
- cite o instante (por exemplo, 12:34) ao mencionar qualquer ponto;
- separe claramente o que cada interlocutor disse, usando os nomes que aparecem na transcrição;
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
     Resumo, decisões e pendências — com IA, mas sem trair a promessa.

     Os concorrentes vendem resumo por IA como funcionalidade
     principal, e não dá para competir sem ter. O problema é que a
     forma óbvia — mandar a transcrição para um servidor nosso —
     destruiria a única vantagem que este produto tem.

     Então são três motores, escolhidos por quem usa, e o padrão
     não envia nada:

     1. PROMPT   — monta o texto pronto com a ata dentro. Você cola
                   na IA que já usa. Nada sai daqui por conta nossa.
     2. OLLAMA   — modelo rodando no computador de quem usa. Sai da
                   aba e não sai da máquina.
     3. CHAVE    — serviço externo, com a chave do próprio usuário,
                   desligado por padrão e atrás de uma confirmação
                   explícita, porque aqui o texto realmente sai.

     A chave nunca é gravada: vive numa variável desta aba e morre
     com ela. Guardar em localStorage seria conveniente e seria a
     forma mais fácil de vazar a chave de alguém.
     ============================================================ */

  const OLLAMA = 'http://127.0.0.1:11434';
  let resumos = [];

  const TAREFAS = {
    resumo: {
      titulo: 'Resumo executivo',
      instrucao: 'Escreva um resumo executivo da reunião em até 12 linhas, em português, citando o ' +
        'instante (mm:ss) de cada ponto relevante. Não invente nada que não esteja na transcrição.'
    },
    pendencias: {
      titulo: 'Decisões e pendências',
      instrucao: 'Liste, em português: 1) as decisões tomadas; 2) as pendências, com responsável e prazo ' +
        'quando aparecerem; 3) os próximos passos. Cite o instante (mm:ss) de cada item. Se algo não ' +
        'estiver claro na transcrição, escreva "não ficou claro na reunião" em vez de deduzir.'
    },
    email: {
      titulo: 'E-mail de acompanhamento',
      instrucao: 'Escreva um e-mail curto e cordial de acompanhamento para os participantes, em ' +
        'português, confirmando o que ficou combinado e o que cada lado vai entregar. Sem saudação ' +
        'genérica de mais de uma linha e sem inventar prazo que não foi dito.'
    },
    pergunta: {
      titulo: 'Pergunta à ata',
      instrucao: ''   // preenchida com a pergunta de quem usa
    }
  };

  const CONTEXTO =
    'Abaixo está a transcrição automática de uma reunião, gerada no computador de quem participou.\n' +
    'Cada linha traz o instante e quem falou. As linhas "(nova tela compartilhada)" marcam quando a tela\n' +
    'apresentada mudou. As linhas "*** momento marcado ***" foram marcadas à mão por quem estava lá:\n' +
    'trate o que está em volta delas como importante.\n' +
    'A transcrição é automática e contém erros: se um trecho parecer incoerente, sinalize em vez de\n' +
    'interpretar. Quando a informação não estiver na transcrição, diga que não é possível saber.\n';

  function montarPrompt(chave, pergunta) {
    const t = TAREFAS[chave];
    const tarefa = chave === 'pergunta'
      ? 'Responda à pergunta abaixo usando apenas a transcrição, citando os instantes que sustentam a ' +
        'resposta.\n\nPergunta: ' + pergunta
      : t.instrucao;
    return CONTEXTO + '\n' + tarefa + '\n\n---\n' + comoTexto();
  }

  /* ---------- motores ---------- */

  $('iaMotor').onchange = () => {
    const m = $('iaMotor').value;
    $('iaChave').classList.toggle('hide', m !== 'chave');
    $('iaProcurar').classList.toggle('hide', m !== 'ollama');
    $('iaModeloSalavox').classList.toggle('hide', m !== 'salavox');
    $('iaModelo').classList.add('hide');
    $('iaMotorMsg').textContent = m === 'ollama'
      ? 'O Ollama precisa estar aberto e aceitar esta página. Clique em procurar.'
      : '';
  };

  $('iaProcurar').onclick = async () => {
    $('iaMotorMsg').textContent = 'Procurando o Ollama neste computador…';
    try {
      const r = await fetch(OLLAMA + '/api/tags');
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const dados = await r.json();
      const nomes = (dados.models || []).map(m => m.name || m.model).filter(Boolean);
      if (!nomes.length) throw new Error('nenhum modelo instalado');
      $('iaModelo').innerHTML = nomes.map(n => `<option>${escapar(n)}</option>`).join('');
      $('iaModelo').classList.remove('hide');
      $('iaMotorMsg').innerHTML = `<span class="ok">Ollama encontrado</span> — ${nomes.length} ` +
        (nomes.length === 1 ? 'modelo' : 'modelos') + ' disponíveis.';
    } catch (e) {
      // o motivo mais comum não é o Ollama estar fechado: é ele recusar a página
      $('iaMotorMsg').innerHTML = '<span class="err">Não achei o Ollama.</span> Ele precisa estar aberto e ' +
        'permitir esta página — inicie com <code>OLLAMA_ORIGINS=' + location.origin + ' ollama serve</code>.';
    }
  };

  async function pedirOllama(prompt, aviso) {
    const modelo = $('iaModelo').value;
    if (!modelo) throw new Error('escolha um modelo do Ollama (clique em procurar).');
    aviso('Pensando no seu computador, com ' + modelo + '…');
    const r = await fetch(OLLAMA + '/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: modelo, prompt, stream: false })
    });
    if (!r.ok) throw new Error('o Ollama respondeu HTTP ' + r.status);
    const d = await r.json();
    return (d.response || '').trim();
  }

  async function pedirServico(prompt, aviso) {
    if (!$('iaOk').checked) throw new Error('marque a confirmação: neste modo o texto da ata sai daqui.');
    const base = ($('iaBase').value || '').trim().replace(/\/+$/, '');
    const modelo = ($('iaNome').value || '').trim();
    const segredo = $('iaSegredo').value;
    if (!base || !modelo || !segredo) throw new Error('preencha endereço, modelo e chave.');
    aviso('Enviando o texto da ata para ' + base + '…');
    const r = await fetch(base + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + segredo },
      body: JSON.stringify({ model: modelo, messages: [{ role: 'user', content: prompt }] })
    });
    if (!r.ok) throw new Error('o serviço respondeu HTTP ' + r.status);
    const d = await r.json();
    const t = d && d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content;
    if (!t) throw new Error('resposta do serviço veio vazia.');
    return t.trim();
  }

  /* ---------- execução ---------- */

  async function rodarTarefa(chave, pergunta) {
    if (!falas.length) return;
    const aviso = m => { $('iaMsg').innerHTML = m; };
    const motor = $('iaMotor').value;
    const prompt = montarPrompt(chave, pergunta);
    const titulo = chave === 'pergunta' ? 'Pergunta: ' + pergunta : TAREFAS[chave].titulo;

    if (motor === 'prompt') {
      try {
        await navigator.clipboard.writeText(prompt);
        aviso('<span class="ok">Prompt copiado</span> — cole na IA que você usa. Nada saiu daqui.');
      } catch (e) {
        aviso('Copie o texto abaixo e cole na IA que você usa. Nada saiu daqui.');
      }
      guardarResumo('prompt:' + chave, 'Prompt pronto — ' + titulo, prompt);
      return;
    }

    ocupado = true;
    $('iaBarWrap').classList.remove('hide');
    $('iaBar').style.width = '35%';
    try {
      const texto = motor === 'salavox' ? await pedirSalavox(prompt, aviso)
                  : motor === 'ollama'  ? await pedirOllama(prompt, aviso)
                                        : await pedirServico(prompt, aviso);
      $('iaBar').style.width = '100%';
      guardarResumo(chave, titulo, texto);
      aviso(`<span class="ok">${titulo} pronto.</span> Ele entra no PDF e no texto da ata.`);
    } catch (e) {
      aviso(`<span class="err">Não consegui: ${(e && e.message) || e}</span>`);
    } finally {
      ocupado = false;
      setTimeout(() => { $('iaBarWrap').classList.add('hide'); $('iaBar').style.width = '0%'; }, 600);
    }
  }

  function guardarResumo(chave, titulo, texto) {
    const i = resumos.findIndex(r => r.chave === chave);
    const item = { chave, titulo, texto, noPdf: chave.indexOf('prompt:') !== 0 };
    if (i >= 0) resumos[i] = item; else resumos.push(item);
    desenharResumos();
  }

  function desenharResumos() {
    $('iaSaida').innerHTML = resumos.map((r, i) =>
      `<div class="resumo"><h3>${escapar(r.titulo)}</h3>` +
      `<div class="corpo" contenteditable="true" data-i="${i}">${escapar(r.texto)}</div>` +
      `<div class="pe"><button class="ghost sm" data-copiar="${i}">Copiar</button>` +
      `<button class="ghost sm" data-tirar="${i}">Tirar</button>` +
      `<span class="status">${r.noPdf ? 'entra no PDF e no texto da ata' : 'não entra na ata: é o prompt'}</span>` +
      `</div></div>`).join('');
  }

  $('iaSaida').addEventListener('focusout', ev => {
    const c = ev.target.closest && ev.target.closest('.corpo');
    if (!c) return;
    const r = resumos[+c.dataset.i];
    if (r) r.texto = c.textContent.trim();
  });

  $('iaSaida').onclick = async ev => {
    const b = ev.target.closest('button');
    if (!b) return;
    if (b.dataset.copiar != null) {
      try { await navigator.clipboard.writeText(resumos[+b.dataset.copiar].texto); } catch (e) {}
      $('iaMsg').innerHTML = '<span class="ok">copiado</span>';
    }
    if (b.dataset.tirar != null) { resumos.splice(+b.dataset.tirar, 1); desenharResumos(); }
  };

  $('iaResumo').onclick = () => rodarTarefa('resumo');
  $('iaPendencias').onclick = () => rodarTarefa('pendencias');
  $('iaEmail').onclick = () => rodarTarefa('email');
  $('iaPerguntar').onclick = () => {
    const q = $('iaPergunta').value.trim();
    if (q) rodarTarefa('pergunta', q);
  };
  $('iaPergunta').onkeydown = ev => { if (ev.key === 'Enter') $('iaPerguntar').click(); };


  /* ============================================================
     Conta, plano e a IA do Salavox.

     Esta é a única parte do produto que fala com servidor nosso, e
     ela só existe se /config.json existir. Sem esse arquivo — que é
     o caso de quem baixa o código e serve sozinho — a ferramenta
     continua inteira, local e sem cadastro nenhum.

     O que sai daqui quando alguém usa a IA do Salavox: o texto da
     ata. Não o áudio, não o vídeo. E sai por ordem de quem clicou,
     com a tela dizendo isso antes.

     A sessão fica no localStorage, como em qualquer site com login.
     O texto da reunião, não: ele nunca é gravado em lugar nenhum.
     ============================================================ */

  let cfg = null, sessao = null, perfil = null;
  const CHAVE_SESSAO = 'salavox.sessao';

  const temPlano = () => !!(perfil && perfil.plano !== 'gratis' &&
                            perfil.assinante_ate && new Date(perfil.assinante_ate) > new Date());

  async function iniciarConta() {
    try {
      const r = await fetch('/config.json', { cache: 'no-cache' });
      if (!r.ok) return;
      cfg = await r.json();
      if (!cfg || !cfg.supabaseUrl || !cfg.supabaseAnonKey) { cfg = null; return; }
    } catch (e) { return; }

    $('contaCard').classList.remove('hide');
    $('iaMotor').insertAdjacentHTML('afterbegin',
      '<option value="salavox">IA do Salavox — resumo pronto, sem instalar nada</option>');

    if (!pegarTokens()) {
      try { sessao = JSON.parse(localStorage.getItem(CHAVE_SESSAO) || 'null'); } catch (e) {}
    }

    /* O link do e-mail pode cair numa aba que já está aberta no aplicativo. Aí o
       navegador só troca o pedaço depois do #, sem recarregar nada, e o código
       que lê os tokens nunca roda de novo: a pessoa clica no link, volta para a
       aba e continua deslogada, sem entender por quê. */
    window.addEventListener('hashchange', () => { if (pegarTokens()) carregarPerfil(); });

    await carregarPerfil();
  }

  /* volta do link do e-mail: os tokens chegam no pedaço depois do # */
  function pegarTokens() {
    if (location.hash.indexOf('access_token=') < 0) return false;
    const h = new URLSearchParams(location.hash.slice(1));
    guardarSessao({ access_token: h.get('access_token'), refresh_token: h.get('refresh_token') });
    history.replaceState(null, '', location.pathname);
    return true;
  }

  function guardarSessao(s) {
    sessao = s && s.access_token ? s : null;
    try {
      if (sessao) localStorage.setItem(CHAVE_SESSAO, JSON.stringify(sessao));
      else localStorage.removeItem(CHAVE_SESSAO);
    } catch (e) {}
  }

  async function carregarPerfil() {
    if (!cfg || !sessao) { desenharConta(); return; }
    try {
      const r = await fetch(cfg.supabaseUrl + '/rest/v1/perfis?select=email,plano,assinante_ate', {
        headers: { apikey: cfg.supabaseAnonKey, Authorization: 'Bearer ' + sessao.access_token }
      });
      if (r.status === 401) { guardarSessao(null); perfil = null; desenharConta(); return; }
      const d = await r.json();
      perfil = Array.isArray(d) ? d[0] : null;
    } catch (e) { perfil = null; }
    desenharConta();
  }

  function desenharConta() {
    if (!cfg) return;
    if (!sessao || !perfil) {
      $('contaEstado').innerHTML = 'Entre para usar a <b>IA do Salavox</b> e o envio da ata por e-mail. ' +
        'Gravar, transcrever e gerar a ata continua funcionando sem conta.';
      $('contaEntrar').classList.remove('hide');
      $('contaSair').classList.add('hide');
      $('enviarEmail').classList.add('hide');
      return;
    }
    const pago = temPlano();
    $('contaEstado').innerHTML = `<b>${escapar(perfil.email)}</b> — plano ` +
      (pago ? `<span class="ok">${escapar(perfil.plano)}</span>, ativo até ` +
              new Date(perfil.assinante_ate).toLocaleDateString('pt-BR')
            : 'grátis. A IA do Salavox e o envio por e-mail são do plano profissional.');
    $('contaEntrar').classList.add('hide');
    $('contaSair').classList.remove('hide');
    $('enviarEmail').classList.toggle('hide', !pago);
  }

  $('contaEntrar').onclick = async () => {
    const email = ($('contaEmail').value || '').trim();
    if (!/.+@.+\..+/.test(email)) { $('contaMsg').innerHTML = '<span class="err">e-mail inválido</span>'; return; }
    $('contaMsg').textContent = 'Enviando o link…';
    try {
      const r = await fetch(cfg.supabaseUrl + '/auth/v1/otp', {
        method: 'POST',
        headers: { apikey: cfg.supabaseAnonKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, create_user: true })
      });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      $('contaMsg').innerHTML = '<span class="ok">Link enviado</span> — abra o e-mail e clique. ' +
        'Não há senha para lembrar.';
    } catch (e) {
      $('contaMsg').innerHTML = '<span class="err">não consegui enviar o link agora</span>';
    }
  };

  $('contaSair').onclick = () => { guardarSessao(null); perfil = null; desenharConta(); $('contaMsg').textContent = ''; };

  async function pedirSalavox(prompt, aviso) {
    if (!sessao) throw new Error('entre na sua conta para usar a IA do Salavox.');
    const modelo = $('iaModeloSalavox') ? $('iaModeloSalavox').value : 'rapido';
    aviso('Resumindo com a IA do Salavox…');
    const r = await fetch('/api/resumo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + sessao.access_token },
      body: JSON.stringify({ prompt, modelo })
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.erro || ('o servidor respondeu ' + r.status));
    if (typeof d.restante === 'number') {
      $('iaMotorMsg').innerHTML = `restam <b>${d.restante}</b> resumos neste mês`;
    }
    return (d.texto || '').trim();
  }

  /* ---- enviar a ata por e-mail, com a marca junto ---- */
  $('enviarEmail').onclick = async () => {
    const para = prompt('Enviar a ata para quais e-mails? (separe por vírgula)');
    if (!para) return;
    $('ataMsg').textContent = 'Enviando…';
    try {
      const r = await fetch('/api/enviar-ata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + sessao.access_token },
        body: JSON.stringify({
          para,
          assunto: 'Ata da reunião — ' + new Date().toLocaleDateString('pt-BR'),
          corpo: comoTexto(),
          assinatura: perfil && perfil.email
        })
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.erro || ('erro ' + r.status));
      $('ataMsg').innerHTML = `<span class="ok">enviada para ${d.enviados} ` +
        `${d.enviados === 1 ? 'endereço' : 'endereços'}</span>`;
    } catch (e) {
      $('ataMsg').innerHTML = `<span class="err">${(e && e.message) || e}</span>`;
    }
  };

  iniciarConta();

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
      if (meta && meta.consentimento) { consentimento = meta.consentimento; mostrarConsentimento(); }
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
    momentos: () => momentos, nomes: () => nomes, importado: () => importado,
    origemModelo: () => origemModelo, espelhoLocal,
    consentimento: () => consentimento, aplicarVocabulario, corrigirComVocabulario,
    resumos: () => resumos, montarPrompt, perfil: () => perfil, temPlano, cfg: () => cfg,
    gravacao: () => blobGravacao, pcm: () => blobPcm,
    tamanhos: () => ({ grav: depGrav ? depGrav.bytes : 0, pcm: depPcm ? depPcm.bytes : 0,
                       disco: !!(depGrav && depGrav.emDisco) }),
    duracaoReal: () => (marcoFim - marcoInicio) / 1000 };   // usado pelos testes
})();
