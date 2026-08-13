/* ============================================================
   Português e inglês, sem duplicar a ferramenta.

   A saída óbvia seria manter dois `app.html` — um por idioma — e
   é a saída errada: no dia seguinte um dos dois está velho, e o
   defeito só aparece para quem fala a língua que ninguém do
   escritório fala.

   Aqui há um arquivo só, escrito em português, e um dicionário.
   A tradução acontece no navegador, sobre o texto já montado: uma
   varredura dos nós de texto na abertura e um observador para o
   que a ferramenta escreve depois. Como a chave do dicionário é o
   próprio texto em português, não existe "chave que ninguém usa"
   nem marcação espalhada pelo HTML — o que está escrito na tela é
   o que se procura.

   Duas consequências que valem dizer em voz alta:

   1. Trocar de idioma recarrega a página. É mais honesto do que
      tentar desfazer a tradução nó por nó, e recarregar é barato:
      a ferramenta guarda a gravação no disco, não na memória da
      aba. Durante uma gravação o seletor fica desligado.

   2. Nada que a pessoa escreveu é traduzido. A ata, o resumo, o
      e-mail e os campos de nome ficam de fora da varredura por
      `data-usuario` — traduzir a fala de um cliente seria o pior
      defeito possível neste produto.

   O que garante que não fica texto para trás não é a boa vontade:
   é `testes/t-idioma.mjs`, que percorre a ferramenta inteira em
   inglês e reprova a corrida listando cada pedaço de português
   que ainda aparecer na tela.
   ============================================================ */

(function () {
  'use strict';

  const CHAVE = 'salavox.idioma';
  const IDIOMAS = ['pt', 'en'];

  /* ---------- o dicionário ----------
     Chave: o texto exato em português, com os espaços já normalizados.
     Valor: o texto em inglês. */
  const DIC = {
    /*__DICIONARIO__*/
  };

  /* ---------- o que carrega número no meio ----------
     "Gravação de 00:11 pronta" não cabe num dicionário de texto exato: o
     relógio muda a cada reunião. Estes são os poucos casos em que a frase é
     um molde, e por isso vêm como padrão em vez de chave. A ordem importa:
     o primeiro que casar vence. */
  const PADROES = [
    [/^Gravando em pedaços no disco — ([\d.,]+) MB até agora\. Pode minimizar esta aba, mas não feche\.$/,
     'Recording to disk in chunks — $1 MB so far. You can minimise this tab, but do not close it.'],
    [/^Gravação de ([\d:]+) pronta$/, 'Recording of $1 ready'],
    [/^Gravação recuperada de ([\d:]+)$/, 'Recovered recording of $1'],
    [/^— ([\d.,]+) MB em disco \(mais ([\d.,]+) MB de áudio separado para a transcrição\), com áudio da reunião, com microfone\.$/,
     '— $1 MB on disk (plus $2 MB of separate audio for the transcript), with meeting audio, with microphone.'],
    [/^— ([\d.,]+) MB em disco \(mais ([\d.,]+) MB de áudio separado para a transcrição\), com áudio da reunião\.$/,
     '— $1 MB on disk (plus $2 MB of separate audio for the transcript), with meeting audio.'],
    [/^— ([\d.,]+) MB em disco \(mais ([\d.,]+) MB de áudio separado para a transcrição\), com microfone\.$/,
     '— $1 MB on disk (plus $2 MB of separate audio for the transcript), with microphone.'],
    [/^— (\d+) marcas? nesta reunião$/, '— $1 flagged moment(s) in this meeting'],
    [/^Só há ([\d.,]+) GB livres para o navegador\.$/, 'Only $1 GB free for the browser.'],
    [/^: ([\d.,]+) s de áudio em ([\d.,]+) s —$/, ': $1 s of audio in $2 s —'],
    [/^(\d+) de (\d+) na ata$/, '$1 of $2 in the minutes'],
    [/^Reunião de (.+)$/, 'Meeting of $1'],
    [/^restam <b>(\d+)<\/b>/, 'left: <b>$1</b>'],
    [/^(\d+) trechos?$/, '$1 passages'],
    [/^Transcrito na (.+)$/, 'Transcribed on the $1'],
    [/^Perguntar à ata: (.+)$/, 'Ask the minutes: $1']
  ];

  function porPadrao(n) {
    for (const [re, en] of PADROES) if (re.test(n)) return n.replace(re, en);
    return null;
  }

  /* Palavras e sinais que denunciam português na tela. Serve ao teste,
     não ao produto — mas mora aqui porque é aqui que a regra vive. */
  const SINAIS = /[ãõçáàâéêíóôúÁÀÂÃÉÊÍÓÔÕÚÇ]/;
  const PALAVRAS = new RegExp('\\b(' + [
    'não', 'nao', 'você', 'voce', 'sua', 'seu', 'suas', 'seus', 'com', 'sem',
    'para', 'pelo', 'pela', 'uma', 'como', 'quando', 'que', 'dos', 'das', 'aqui',
    'reunião', 'gravação', 'arquivo', 'ata', 'texto', 'nome', 'conta', 'plano',
    'já', 'ele', 'ela', 'isso', 'todos', 'todas', 'este', 'esta', 'aparece',
    'entre', 'digite', 'clique', 'salvar', 'baixar', 'enviar', 'agora'
  ].join('|') + ')\\b', 'i');

  const norma = s => String(s).replace(/\s+/g, ' ').trim();

  /* Endereço de e-mail, URL e nome de arquivo não são texto de interface — e
     "example.com" tem um "com" dentro que faria o detector gritar português
     para sempre. Some com eles antes de procurar. */
  const semEnderecos = s => s
    .replace(/[\w.+-]+@[\w.-]+/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/\b[\w-]+\.(com|br|co|io|json|js|html|svg|txt|pdf|webm|mp4|vtt)\b/gi, ' ');

  function guardado() {
    try { return localStorage.getItem(CHAVE); } catch (e) { return null; }
  }

  /* Sem escolha guardada, vale o idioma do navegador — e só o inglês tem
     tradução, então qualquer outra língua cai no português, que é o
     original e não uma tradução de segunda mão. */
  function idiomaAtual() {
    const g = guardado();
    if (IDIOMAS.indexOf(g) >= 0) return g;
    const nav = (navigator.language || 'pt').toLowerCase();
    return nav.indexOf('pt') === 0 ? 'pt' : 'en';
  }

  const FORA = 'script,style,textarea,code,[data-usuario],[contenteditable="true"]';

  function podeMexer(no) {
    const p = no.parentElement;
    return !!p && !p.closest(FORA);
  }

  function traduzirNo(no) {
    const bruto = no.data;
    const n = norma(bruto);
    if (!n) return;
    const en = DIC[n] != null ? DIC[n] : porPadrao(n);
    if (en == null || en === n) return;
    const antes = /^\s*/.exec(bruto)[0];
    const depois = /\s*$/.exec(bruto)[0];
    no.data = antes + en + depois;
  }

  const ATRIBUTOS = ['placeholder', 'title', 'aria-label', 'alt'];

  function traduzirAtributos(el) {
    if (el.closest && el.closest('[data-usuario]')) return;
    for (const a of ATRIBUTOS) {
      if (!el.hasAttribute || !el.hasAttribute(a)) continue;
      const alvo = norma(el.getAttribute(a));
      const en = DIC[alvo] != null ? DIC[alvo] : porPadrao(alvo);
      if (en != null) el.setAttribute(a, en);
    }
  }

  function varrer(raiz) {
    if (raiz.nodeType === 3) { if (podeMexer(raiz)) traduzirNo(raiz); return; }
    if (raiz.nodeType !== 1) return;
    if (raiz.closest && raiz.closest(FORA)) return;
    const cam = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT, {
      acceptNode: no => podeMexer(no) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT
    });
    const achados = [];
    for (let no = cam.nextNode(); no; no = cam.nextNode()) achados.push(no);
    achados.forEach(traduzirNo);
    traduzirAtributos(raiz);
    if (raiz.querySelectorAll) raiz.querySelectorAll('*').forEach(traduzirAtributos);
  }

  /* O que a ferramenta escreve depois da abertura — mensagens de estado,
     avisos, contadores — passa por aqui pelo mesmo caminho. Não há laço:
     o texto já traduzido não está no dicionário, então a segunda passada
     não muda nada e o observador silencia. */
  function observar() {
    const obs = new MutationObserver(lista => {
      for (const m of lista) {
        if (m.type === 'characterData') { if (podeMexer(m.target)) traduzirNo(m.target); }
        else m.addedNodes.forEach(varrer);
      }
    });
    obs.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  /* ---------- o que o teste usa ---------- */
  function vazamentos() {
    const fora = [];
    const cam = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: no => podeMexer(no) && no.parentElement.offsetParent !== null
        ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT
    });
    for (let no = cam.nextNode(); no; no = cam.nextNode()) {
      const t = norma(no.data);
      const alvo = semEnderecos(t);
      if (t && (SINAIS.test(alvo) || PALAVRAS.test(alvo))) fora.push(t);
    }
    document.querySelectorAll('[placeholder],[title],[aria-label]').forEach(el => {
      if (el.closest('[data-usuario]')) return;
      for (const a of ATRIBUTOS) {
        const v = el.hasAttribute(a) ? norma(el.getAttribute(a)) : '';
        const alvoA = semEnderecos(v);
        if (v && (SINAIS.test(alvoA) || PALAVRAS.test(alvoA))) fora.push(v);
      }
    });
    return Array.from(new Set(fora));
  }

  /* `lingua`, e não `idioma`: a ferramenta já tinha um `#idioma` — o do
     Whisper, que escolhe a língua da transcrição. Dois seletores com o mesmo
     id fizeram o teste de arquivo importado escolher a opção errada, num
     campo que nem sabia da existência do outro. */
  function ligarSeletor() {
    const s = document.getElementById('lingua');
    if (!s) return;
    s.value = idiomaAtual();
    s.onchange = () => {
      try { localStorage.setItem(CHAVE, s.value); } catch (e) {}
      location.reload();
    };
  }

  function iniciar() {
    const id = idiomaAtual();
    document.documentElement.lang = id === 'en' ? 'en' : 'pt-BR';
    ligarSeletor();
    if (id === 'en') { varrer(document.body); observar(); }
  }

  window.SalavoxIdioma = {
    atual: idiomaAtual,
    texto: s => (idiomaAtual() === 'en' && (DIC[norma(s)] || porPadrao(norma(s)))) || s,
    vazamentos,
    dicionario: () => DIC
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
