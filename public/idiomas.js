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
    ", e não na memória da aba: não há limite prático de duração, e o que já foi gravado sobrevive se o navegador fechar sozinho.": ", not in the tab's memory: there is no practical limit on length, and whatever was already recorded survives if the browser closes on its own.",
    ", que aparece durante a gravação.": ", which appears while recording.",
    ". Ele também não sai daqui.": ". It does not leave here either.",
    ". É só isso.": ". That is all.",
    "A ata inteira vai junto, embaixo do texto do e-mail. Você pode corrigir o texto aqui antes de enviar.": "The full minutes travel with it, below the e-mail text. You can fix the wording here before sending.",
    "A conta serve para o resumo por IA e o envio da ata.": "The account is for the AI summary and for sending the minutes.",
    "A reunião é gravada": "The meeting is recorded",
    "Antes de gravar": "Before you record",
    "Ao começar, o navegador pergunta qual janela compartilhar — escolha a da reunião e": "When you start, the browser asks which window to share — pick the meeting window and",
    "Apagar": "Delete",
    "Arraste aqui um arquivo de áudio ou vídeo — ou": "Drag an audio or video file here — or",
    "Assunto": "Subject",
    "Ata": "Minutes",
    "Ata organizada.": "Minutes organised.",
    "Ata pronta": "Minutes ready",
    "Baixar .txt": "Download .txt",
    "Baixar .vtt": "Download .vtt",
    "Baixar a ata em PDF": "Download the minutes as PDF",
    "Baixar a gravação": "Download the recording",
    "Clique em qualquer tela para tirá-la da ata.": "Click any screen to take it out of the minutes.",
    "Clique no nome em qualquer fala para trocar quem falou. Os nomes entram na ata, no PDF, no texto e na legenda.": "Click the name on any line to change who spoke. The names go into the minutes, the PDF, the text and the subtitles.",
    "Começar a gravar": "Start recording",
    "Como funciona, se você quiser saber": "How it works, if you want to know",
    "Compactar o silêncio": "Compacting the silence",
    "Confirmo que vou avisar os participantes de que a reunião está sendo gravada.": "I confirm that I will tell the participants the meeting is being recorded.",
    "Copiar": "Copy",
    "Copiar o aviso para colar no chat": "Copy the notice to paste in the chat",
    "Copiar o e-mail": "Copy the e-mail",
    "Diagnóstico": "Diagnostics",
    "Diga para quem enviar.": "Say who to send it to.",
    "Do outro lado": "On the other side",
    "Duração:": "Duration:",
    "E-mail para os participantes": "E-mail to the participants",
    "Encerrar": "Stop",
    "Enviando…": "Sending…",
    "Enviar agora": "Send now",
    "Este registro é a declaração de quem gravou, não uma verificação feita pelo Salavox — ele não entra na chamada e não tem como conferir o que foi dito.": "This record is the statement of the person who recorded, not a check made by Salavox — it does not join the call and has no way to verify what was said.",
    "Ficar mudo na reunião não fecha o microfone aqui.": "Muting yourself in the meeting does not close the microphone here.",
    "Gerar a transcrição": "Generate the transcript",
    "Grave a reunião, receba a ata": "Record the meeting, get the minutes",
    "Mais alguém": "Anyone else",
    "Manter todas": "Keep all",
    "Marcar este momento": "Flag this moment",
    "Momentos marcados:": "Flagged moments:",
    "Nenhum robô entra na chamada e nada sai do seu computador — a gravação e a transcrição acontecem aqui, no seu navegador.": "No bot joins the call and nothing leaves your computer — recording and transcription happen right here, in your browser.",
    "Nomes de clientes, siglas e termos que a transcrição costuma errar. Um por linha. Depois de transcrever, o Salavox troca o que ficou parecido pelo termo certo.": "Client names, acronyms and terms the transcript usually gets wrong. One per line. After transcribing, Salavox swaps what came out close for the right term.",
    "O botão de silenciar do Meet, do Teams ou do Zoom cala você para os outros; o Salavox continua ouvindo por conta própria — é até desejável, porque assim a sua fala entra na ata mesmo quando você esquece de reabrir. Para parar mesmo, use o botão": "The mute button in Meet, Teams or Zoom silences you for the others; Salavox keeps listening on its own — which is a good thing, because your words still reach the minutes when you forget to unmute. To really stop, use the button",
    "O modelo é baixado na primeira transcrição e fica guardado no navegador para as próximas.": "The model is downloaded on the first transcription and kept in the browser for the next ones.",
    "O que sai daqui:": "What leaves this page:",
    "Organizar a ata": "Organise the minutes",
    "PARTICIPANTES, VOCÊ": "PARTICIPANTS, YOU",
    "Para": "To",
    "Participantes": "Participants",
    "Participantes:": "Participants:",
    "Perguntar": "Ask",
    "Perguntar à ata: em quanto ficou o imposto?": "Ask the minutes: how much was the tax in the end?",
    "Preciso — 5 por mês": "Precise — 5 per month",
    "Preparando o modelo para transcrever durante a reunião…": "Getting the model ready to transcribe during the meeting…",
    "Quando:": "When:",
    "Quem gravou confirmou às": "The person recording confirmed at",
    "Registro de consentimento": "Consent record",
    "Resumo, decisões e pendências": "Summary, decisions and open items",
    "Resumo, decisões, pendências e próximos passos entram no PDF e no texto — e o e-mail já está pronto abaixo.": "Summary, decisions, open items and next steps go into the PDF and the text — and the e-mail is ready below.",
    "Resumo, decisões, pendências e próximos passos entram no PDF e no texto.": "Summary, decisions, open items and next steps go into the PDF and the text.",
    "Reunião on-line": "Online meeting",
    "Reunião presencial": "In-person meeting",
    "Rápido — 30 por mês": "Fast — 30 per month",
    "Salavox versão": "Salavox version",
    "Seu microfone entra por um caminho separado do áudio da chamada, e é isso que permite saber depois quem falou o quê — sem robô, sem nuvem, sem separação de voz por inteligência artificial.": "Your microphone comes in on a separate path from the call audio, and that is what makes it possible to tell afterwards who said what — no bot, no cloud, no AI voice separation.",
    "Simples Nacional DIRF Construtora Andrade pró-labore": "Acme Holdings\nEBITDA\nquarterly close",
    "Só há 0.4 GB livres para o navegador.": "Only 0.4 GB free for the browser.",
    "Telas compartilhadas": "Shared screens",
    "Telas:": "Screens:",
    "Texto do aviso oferecido:": "Text of the notice offered:",
    "Tirar": "Remove",
    "Transcrever durante a reunião": "Transcribing during the meeting",
    "Trechos:": "Passages:",
    "Título da reunião": "Meeting title",
    "Uma passada só, e sai tudo:": "One pass, and out comes everything:",
    "Usar": "Use",
    "Use uma gravação que você já tem": "Use a recording you already have",
    "VOCÊ, PARTICIPANTES": "YOU, PARTICIPANTS",
    "Vocabulário do escritório": "Your practice's vocabulary",
    "Você": "You",
    "Você não está em nenhuma conta —": "You are not signed in to any account —",
    "Você tem": "You have",
    "Você é": "You are",
    "adianta o trabalho: a cada trinta segundos gravados, aquele trecho já vira texto. Ao encerrar, quase tudo está pronto. O modelo roda numa linha separada do navegador, para não atrapalhar a gravação. Se o computador for modesto, desmarque.": "gets the work done ahead: every thirty seconds recorded, that stretch already becomes text. By the time you stop, almost everything is ready. The model runs on a separate browser thread so it does not disturb the recording. On a modest computer, untick it.",
    "com conta": "with an account",
    "comece aqui": "start here",
    "compactar o silêncio antes de transcrever": "compact the silence before transcribing",
    "compartilha a tela e capta o áudio da chamada": "shares the screen and captures the call audio",
    "copiado": "copied",
    "costura a fala de cada lado, tirando os vãos, e manda ao modelo conversa em vez de espera. O Whisper processa sempre trinta segundos, com ou sem fala dentro — então numa reunião normal isso corta o tempo pela metade ou mais. O corte só acontece em silêncio de pelo menos 0,4 s, com folga em volta das palavras, e os instantes voltam para o minuto certo da reunião. Se algum trecho sair no lugar errado, desmarque e refaça: a ata sai igual, só demora mais.": "stitches each side's speech together, dropping the gaps, and sends the model conversation instead of waiting. Whisper always processes thirty seconds, with or without speech inside — so in a normal meeting this cuts the time in half or better. Cuts happen only in silences of at least 0.4 s, with slack around the words, and the timestamps go back to the right minute of the meeting. If any stretch lands in the wrong place, untick it and run again: the minutes come out the same, it just takes longer.",
    "decisões": "decisions",
    "disponível": "available",
    "e o": "and the",
    "e-mail pronto": "e-mail ready to send",
    "em pedaços, direto no disco": "in chunks, straight to disk",
    "entra no PDF e no texto da ata": "goes into the PDF and the text of the minutes",
    "entrar": "sign in",
    "escolha do computador": "pick one from your computer",
    "gravação pronta": "recording ready",
    "marque a opção de compartilhar o áudio": "tick the option to share the audio",
    "nome e Enter": "name, then Enter",
    "o Whisper traduz para inglês sem custo extra de tempo": "Whisper translates to English at no extra time cost",
    "o texto da ata, e só quando você clica. O áudio e o vídeo continuam no seu computador, sempre. O texto é usado para gerar o resumo e descartado — não fica guardado em servidor nenhum, nem no nosso.": "the text of the minutes, and only when you click. The audio and the video stay on your computer, always. The text is used to produce the summary and then discarded — it is not kept on any server, not even ours.",
    "para experimentar a IA do Salavox. Depois, o plano profissional tem 30 por mês por R$ 19,90.": "to try out the Salavox AI. After that, the professional plan has 30 a month for R$ 19.90.",
    "para os participantes. Conta como um resumo, não como quatro.": "to the participants. It counts as one summary, not four.",
    "participantes (áudio da reunião)": "participants (meeting audio)",
    "pendências com responsável e prazo": "open items with owner and due date",
    "placa de vídeo": "graphics card",
    "privacidade": "privacy",
    "próximos passos": "next steps",
    "que avisaria os participantes e iniciou a gravação às": "that they would tell the participants, and started recording at",
    "resumo da reunião": "a meeting summary",
    "resumo de cortesia": "complimentary summary",
    "resumos de cortesia": "complimentary summaries",
    "sai pronta": "comes out ready",
    "site": "site",
    "sua conta": "your account",
    "sua vez": "your turn",
    "só o microfone — é o modo que funciona no celular": "microphone only — this is the mode that works on a phone",
    "termos": "terms",
    "transcrever durante a reunião": "transcribe during the meeting",
    "tudo funciona assim mesmo": "everything works anyway",
    "você (microfone)": "you (microphone)",
    "voltar ao site": "back to the site",
    "— tudo roda neste computador.": "— everything runs on this computer.",
    "“Aviso a todos: estou gravando esta reunião para gerar a ata. A gravação e a transcrição ficam no meu computador e não são enviadas a nenhum serviço externo. Quem preferir que não seja gravado, por favor diga agora.”": "“A note to everyone: I am recording this meeting to produce the minutes. The recording and the transcript stay on my computer and are not sent to any outside service. If you would rather not be recorded, please say so now.”",
    "← voltar ao site": "← back to the site"
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
