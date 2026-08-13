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

   2. Nada que a pessoa escreveu é traduzido. O que ela escreve é
      editável na tela — a fala da ata, o corpo do resumo, o texto
      do e-mail — e `contenteditable` já marca isso melhor do que
      qualquer atributo nosso. O que não é editável mas também é
      dela, como os nomes digitados e o assunto do e-mail, leva
      `data-usuario`. Traduzir a fala de um cliente seria o pior
      defeito possível neste produto.

      A primeira versão marcava a ata inteira como da pessoa, e
      com isso a legenda "tela mostrada em 00:09" — que é
      interface, não fala de ninguém — ficava em português dentro
      da ata em inglês.

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
    ", a empresa que processa a cobrança e emite os documentos fiscais. Do nosso lado ficam apenas o identificador que ela devolve e a data de validade do plano. Não vemos nem guardamos número de cartão.": ", the company that processes the charge and issues the tax documents. On our side only the identifier it returns and the plan's expiry date remain. We neither see nor keep card numbers.",
    ", com conta, que acrescenta duas funções: o resumo da ata por inteligência artificial e o envio da ata por e-mail. Só essas duas usam servidor nosso, e o que trafega nelas é o": ", with an account, which adds two functions: the AI summary of the minutes and sending the minutes by e-mail. Only those two use a server of ours, and what travels in them is the",
    ", com ou sem conta.": ", with or without an account.",
    ", criando a conta": ", by creating an account",
    ", e cabe a você informar os participantes, obter o consentimento ou outra base legal adequada, guardar o material com segurança, defini-lo por quanto tempo o mantém e atender pedidos de acesso ou exclusão.": ", and it falls to you to inform the participants, obtain consent or another adequate legal basis, keep the material securely, decide how long you keep it and respond to access or deletion requests.",
    ", e não na memória da aba: não há limite prático de duração, e o que já foi gravado sobrevive se o navegador fechar sozinho.": ", not in the tab's memory: there is no practical limit on length, and whatever was already recorded survives if the browser closes on its own.",
    ", e pode conter erros, omissões e afirmações que não correspondem ao que foi dito. Ele sai marcado como tal na ata. Confira antes de usar.": ", and may contain errors, omissions and statements that do not correspond to what was said. It comes out marked as such in the minutes. Check it before using it.",
    ", faz um número reduzido de conexões, e nenhuma delas transporta o conteúdo da sua reunião:": ", makes a small number of connections, and none of them carries the content of your meeting:",
    ", informada na página de preços e na própria ferramenta. A cota não é acumulável de um mês para o outro. Uso automatizado, revenda ou compartilhamento da conta podem levar à suspensão.": ", stated on the pricing page and in the tool itself. The quota does not carry over from one month to the next. Automated use, resale or account sharing may lead to suspension.",
    ", para reabrir a gravação com as falas sincronizadas.": ", to reopen the recording with the lines in sync.",
    ", que aparece durante a gravação.": ", which appears while recording.",
    ", que oferece Pix, boleto e cartão. Para emitir a cobrança é necessário informar nome e CPF/CNPJ, que são enviados a ela; não guardamos dados de cartão. O acesso é liberado quando o pagamento é confirmado, e é": ", which offers Pix, bank slip and card. To issue the charge it is necessary to give a name and a tax ID, which are sent to it; we do not keep card data. Access is released when payment is confirmed, and it is",
    ", que roda inteira no seu computador e não tem cadastro; e o": ", which runs entirely on your computer and has no sign-up; and the",
    ", que tem conta, servidor nosso e um resumo por inteligência artificial. Esta política descreve as duas.": ", which has an account, a server of ours and a summary by artificial intelligence. This policy describes both.",
    ", sem cadastro": ", no sign-up",
    ", sem cadastro.": ", no sign-up.",
    ", sem cartão. Depois é o plano de R$ 19,90. Você clica e sai o resumo executivo, as decisões e pendências, o e-mail de acompanhamento, ou a resposta a uma pergunta sua sobre a reunião. A diferença está no que sobe: só o": ", no card. After that it is the R$ 19.90 plan. You click and out come the summary, the decisions, the open items with owner and due date, the next steps and the follow-up e-mail — or the answer to a question of yours about the meeting. The difference is in what goes up: only the",
    ", somando todo mundo": ", counting everybody",
    ". Ele também não sai daqui.": ". It does not leave here either.",
    ". Há ferramentas que dispensam o robô; nenhuma delas dispensa o servidor. O Salavox grava, transcreve e monta a ata dentro do seu navegador.": ". There are tools that do without the bot; none of them does without the server. Salavox records, transcribes and assembles the minutes inside your browser.",
    ". É só isso.": ". That is all.",
    "/ mês": "/ month",
    "/ para sempre": "/ forever",
    "/app": "/app",
    "1. O que é o serviço": "1. What the service is",
    "10. Serviços de terceiros": "10. Third-party services",
    "11. Alterações": "11. Changes",
    "12. Lei aplicável": "12. Governing law",
    "2-A. Conta, assinatura e cota": "2-A. Account, subscription and quota",
    "2-B. O resumo por inteligência artificial": "2-B. The artificial intelligence summary",
    "2-C. Envio da ata por e-mail": "2-C. Sending the minutes by e-mail",
    "2. Aceitação": "2. Acceptance",
    "3. Consentimento para gravação — sua obrigação": "3. Consent to record — your obligation",
    "4. Responsabilidade pelo conteúdo gravado": "4. Responsibility for the recorded content",
    "5 resumos no modelo preciso": "5 summaries on the precise model",
    "5. Uso proibido": "5. Prohibited use",
    "6 resumos de cortesia": "6 complimentary summaries",
    "6. Propriedade do seu conteúdo": "6. Ownership of your content",
    "7 de cortesia, sem cartão": "7 complimentary, no card",
    "7 resumos de cortesia": "7 complimentary summaries",
    "7 resumos por IA de cortesia": "7 complimentary AI summaries",
    "7. Ausência de garantia": "7. No warranty",
    "8. Limitação de responsabilidade": "8. Limitation of liability",
    "9. Disponibilidade": "9. Availability",
    ": 30 resumos por mês, sem instalar nada": ": 30 summaries a month, nothing to install",
    ": todo esse processamento ocorre no dispositivo do usuário, e nenhuma gravação chega até nós.": ": all that processing happens on the user's device, and no recording ever reaches us.",
    "A assinatura existe porque duas funções precisam de servidor: o resumo por IA e o envio da ata por e-mail. É o que muda:": "The subscription exists because two functions need a server: the AI summary and sending the minutes by e-mail. Here is what changes:",
    "A assinatura é mensal, com renovação automática enquanto não for cancelada, e pode ser cancelada a qualquer momento pela própria ferramenta — o plano segue ativo até o fim do período já pago, e não há nova cobrança.": "The subscription is monthly, renewing automatically until cancelled, and can be cancelled at any time from the tool itself — the plan stays active until the end of the period already paid for, and there is no further charge.",
    "A ata da reunião sem": "Meeting minutes without",
    "A ata gerada não substitui documento assinado, registro oficial, gravação original nem laudo pericial. Decisões relevantes não devem se apoiar exclusivamente nela sem conferência no áudio original.": "The minutes produced do not replace a signed document, an official record, the original recording or an expert report. Important decisions should not rest on them alone without checking against the original audio.",
    "A ata inteira vai junto, embaixo do texto do e-mail. Você pode corrigir o texto aqui antes de enviar.": "The full minutes travel with it, below the e-mail text. You can fix the wording here before sending.",
    "A ata sai com a": "The minutes come with",
    "A confirmação marcada na interface é registro da sua declaração, não uma verificação feita por nós. Não temos acesso à reunião, aos participantes ou ao conteúdo gravado, e portanto não podemos conferir, supervisionar ou intermediar esse consentimento.": "The confirmation ticked in the interface is a record of your declaration, not a check made by us. We have no access to the meeting, to the participants or to the recorded content, and therefore cannot verify, supervise or mediate that consent.",
    "A conta serve para o resumo por IA e o envio da ata.": "The account is for the AI summary and for sending the minutes.",
    "A conta é criada por link enviado ao seu e-mail, sem senha. Você é responsável por manter o acesso a esse e-mail e pela guarda da sessão no seu navegador.": "The account is created by a link sent to your e-mail, without a password. You are responsible for keeping access to that e-mail and for the safekeeping of the session in your browser.",
    "A distinção entre \"você\" e \"participantes\" decorre da separação das fontes de áudio, não do reconhecimento de vozes: os participantes remotos não são separados entre si, e o uso de alto-falante pode fazer a sua voz aparecer no canal deles.": "The distinction between \"you\" and \"participants\" comes from the separation of the audio sources, not from voice recognition: remote participants are not separated from one another, and using a loudspeaker may make your voice appear on their channel.",
    "A ferramenta carrega bibliotecas e o modelo de transcrição pela internet, a partir de redes públicas de distribuição. O plano pago se apoia ainda em serviços contratados de autenticação, de modelo de linguagem, de envio de e-mail e de pagamento. Não respondemos pela disponibilidade nem pelo conteúdo desses serviços.": "The tool loads libraries and the transcription model over the internet, from public distribution networks. The paid plan also relies on contracted services for authentication, language model, e-mail sending and payment. We are not answerable for the availability or the content of those services.",
    "A ferramenta em si, no endereço": "The tool itself, at",
    "A ferramenta funciona inteira e local em": "The tool works whole and locally at",
    "A ferramenta no navegador não nos custa nada, porque não há servidor processando as suas reuniões — e por isso ela é grátis de verdade, sem limite de minutos, de reuniões ou de duração. O que se paga é o que precisa de servidor: a IA pronta e o envio da ata por e-mail.": "The tool in the browser costs us nothing, because there is no server processing your meetings — and that is why it is genuinely free, with no limit on minutes, meetings or length. What you pay for is what needs a server: the ready-made AI and sending the minutes by e-mail.",
    "A gravação": "The recording",
    "A gravação e a transcrição acontecem": "The recording and the transcript happen",
    "A ideia": "The idea",
    "A legislação de proteção de dados garante direitos como acesso, correção e exclusão dos seus dados pessoais. Sem conta, não tratamos dado pessoal seu nenhum, e não há o que acessar, corrigir ou excluir. Com conta, o que temos é o seu e-mail, o plano e a contagem de resumos do mês: basta pedir por e-mail para receber essas informações, corrigi-las ou apagá-las junto com a conta.": "Data protection law guarantees rights such as access, correction and deletion of your personal data. Without an account, we process no personal data of yours, and there is nothing to access, correct or delete. With an account, what we have is your e-mail, the plan and the month's summary count: just ask by e-mail to receive that information, correct it or delete it along with the account.",
    "A reunião é gravada": "The meeting is recorded",
    "A reunião é gravada em pedaços, no disco. Ao reabrir a página, o que já tinha sido gravado está lá esperando.": "The meeting is recorded in chunks, on disk. When you reopen the page, whatever had already been recorded is there waiting.",
    "A transcrição erra?": "Does the transcript make mistakes?",
    "Abrir": "Open",
    "Abrir o Salavox": "Open Salavox",
    "Abrir o Salavox — é grátis": "Open Salavox — it's free",
    "Aguenta uma reunião de duas horas?": "Does it hold up in a two-hour meeting?",
    "Alterações": "Changes",
    "Antes de gravar": "Before you record",
    "Ao clicar em gerar um resumo, você autoriza o envio do": "By clicking to generate a summary, you authorise sending the",
    "Ao começar, o navegador pergunta qual janela compartilhar — escolha a da reunião e": "When you start, the browser asks which window to share — pick the meeting window and",
    "Ao gravar uma reunião, você passa a tratar dados pessoais de outras pessoas — a voz delas, o que dizem e eventualmente sua imagem. Perante a legislação de proteção de dados,": "By recording a meeting, you begin processing other people's personal data — their voice, what they say and possibly their image. Under data protection law,",
    "Ao usar o envio por e-mail você declara ter autorização para enviar aquele conteúdo aos endereços informados. A mensagem sai identificada como enviada pelo Salavox, com a sua conta como remetente para resposta. É proibido usar essa função para mensagem não solicitada em massa.": "By using the e-mail sending function you declare that you are authorised to send that content to the addresses given. The message goes out identified as sent by Salavox, with your account as the address for replies. Using this function for unsolicited bulk messaging is prohibited.",
    "Ao usar o serviço, você concorda com estes termos. Se não concordar, não o utilize.": "By using the service, you agree to these terms. If you do not agree, do not use it.",
    "Apagar": "Delete",
    "Aparece com a ata na tela: resumo da reunião, decisões, pendências com responsável e prazo, e o e-mail pronto para os participantes.": "Appears once the minutes are on screen: meeting summary, decisions, open items with owner and due date, and the e-mail ready for the participants.",
    "Aparece depois de gravar com a tela compartilhada — é aqui que as telas mostradas na reunião viram parte da ata.": "Appears after you record with the screen shared — this is where the screens shown in the meeting become part of the minutes.",
    "Aparece quando a transcrição terminar: cada fala com o instante e quem falou, para baixar em PDF, texto ou legenda.": "Appears when the transcription finishes: every line with its timestamp and who spoke, to download as PDF, text or subtitles.",
    "Aplicativo de celular": "Phone app",
    "Armazenamento no seu navegador": "Storage in your browser",
    "Arquivo": "File",
    "Arraste aqui um arquivo de áudio ou vídeo — ou": "Drag an audio or video file here — or",
    "As ferramentas de ata que existem hoje colocam um participante robô na chamada, visível para todo mundo, e enviam o áudio da conversa para servidores de outra empresa, quase sempre em outro país.": "The meeting-notes tools that exist today put a bot participant in the call, visible to everyone, and send the audio of the conversation to another company's servers, almost always in another country.",
    "As ferramentas de nuvem identificam o locutor com um modelo caro, que por isso fica nos planos pagos. Aqui o problema se resolve por outro caminho: seu microfone é você, o áudio da chamada são os outros. O Salavox grava cada um em um canal e transcreve os dois isoladamente.": "Cloud tools identify the speaker with an expensive model, which is why it sits on the paid plans. Here the problem is solved another way: your microphone is you, the call audio is everyone else. Salavox records each on its own channel and transcribes the two in isolation.",
    "As gravações, transcrições e atas geradas são suas, inclusive os resumos produzidos pela ferramenta. Não reivindicamos direito nenhum sobre esse material. As gravações não passam por nós em hipótese alguma; o texto enviado para gerar um resumo passa e é descartado, e não o usamos para nenhuma outra finalidade.": "The recordings, transcripts and minutes produced are yours, including the summaries the tool produces. We claim no right over that material. The recordings never pass through us under any circumstances; the text sent to produce a summary does pass and is discarded, and we use it for no other purpose.",
    "As telas compartilhadas viram parte da ata": "The shared screens become part of the minutes",
    "Asaas": "Asaas",
    "Assinar no aplicativo": "Subscribe in the tool",
    "Assunto": "Subject",
    "Ata": "Minutes",
    "Ata organizada.": "Minutes organised.",
    "Ata pronta": "Minutes ready",
    "Avisar os participantes é obrigação de quem grava": "Telling the participants is the duty of whoever records",
    "Avise os participantes, compartilhe a janela da reunião e clique em gravar. O áudio da chamada e o seu microfone entram por caminhos separados.": "Tell the participants, share the meeting window and click record. The call audio and your microphone come in on separate paths.",
    "Aviso de consentimento pronto, com registro da hora": "Consent notice ready to use, with the time recorded",
    "Baixar .txt": "Download .txt",
    "Baixar .vtt": "Download .vtt",
    "Baixar a ata em PDF": "Download the minutes as PDF",
    "Baixar a gravação": "Download the recording",
    "Baixar gravação e transcrição": "Download recording and transcript",
    "Boa parte do que importa numa reunião de escritório não é dita, é mostrada — a planilha, o extrato, o contrato na tela. O Salavox procura os instantes em que a tela mudou, guarda uma imagem de cada um e você escolhe quais entram.": "Much of what matters in an office meeting is not said, it is shown — the spreadsheet, the statement, the contract on screen. Salavox looks for the moments when the screen changed, keeps an image of each one and you choose which go in.",
    "CPF ou CNPJ": "Tax ID (CPF or CNPJ)",
    "Cada canal é transcrito sozinho": "Each channel is transcribed on its own",
    "Cada fala com o instante e o nome de quem falou, pronto para colar em qualquer lugar.": "Every line with its timestamp and the name of who spoke, ready to paste anywhere.",
    "Cadastro": "Registration",
    "Cancela quando quiser, sem falar com ninguém": "Cancel whenever you like, without talking to anyone",
    "Carimba o instante sem tirar o olho da chamada. As marcas entram na ata, no PDF e no texto, junto das falas daquele momento.": "Stamps the moment without taking your eyes off the call. The marks go into the minutes, the PDF and the text, next to the lines from that moment.",
    "Celular (opcional)": "Mobile (optional)",
    "Chrome e Edge": "Chrome and Edge",
    "Clique em qualquer fala e conserte o texto. A correção vai para o PDF, o texto e a legenda — ata com o nome do cliente errado é constrangimento, não detalhe.": "Click any line and fix the text. The correction goes into the PDF, the text and the subtitles — minutes with the client's name spelled wrong are an embarrassment, not a detail.",
    "Clique em qualquer tela para tirá-la da ata.": "Click any screen to take it out of the minutes.",
    "Clique no nome em qualquer fala para trocar quem falou. Os nomes entram na ata, no PDF, no texto e na legenda.": "Click the name on any line to change who spoke. The names go into the minutes, the PDF, the text and the subtitles.",
    "Coisas pequenas que aparecem no segundo uso e mudam o trabalho de quem faz ata toda semana.": "Small things that show up on the second use and change the work of anyone writing minutes every week.",
    "Com carimbo de hora, no mesmo documento que vai para o cliente. Não é verificação nossa — nós não entramos na chamada e não temos como conferir. É o seu registro, guardado onde ele importa.": "Time-stamped, in the same document that goes to the client. It is not a check by us — we do not join the call and have no way to verify. It is your record, kept where it matters.",
    "Com conta e plano pago": "With an account and a paid plan",
    "Com qualquer reunião que apareça na sua tela. No Windows dá para capturar o áudio do sistema inteiro, o que cobre também os aplicativos instalados. No macOS o navegador só captura áudio de aba, então funciona com Meet e Teams pelo navegador, mas não com o Zoom em aplicativo.": "With any meeting that appears on your screen. On Windows you can capture the audio of the whole system, which also covers installed applications. On macOS the browser only captures tab audio, so it works with Meet and Teams in the browser, but not with the Zoom app.",
    "Começar a gravar": "Start recording",
    "Como cuidamos da privacidade": "How we handle privacy",
    "Como funciona": "How it works",
    "Como funciona, se você quiser saber": "How it works, if you want to know",
    "Como não recebemos esse conteúdo, não somos controladores nem operadores em relação a ele, e não temos como atender pedidos sobre gravações que nunca chegaram até nós.": "Since we do not receive that content, we are neither controller nor processor in relation to it, and we have no way to respond to requests about recordings that never reached us.",
    "Como o serviço funciona": "How the service works",
    "Como você assina": "How you pay",
    "Compactar o silêncio": "Compacting the silence",
    "Comparação": "Comparison",
    "Comparação honesta": "An honest comparison",
    "Condições de uso do Salavox, incluindo a responsabilidade do usuário por obter o consentimento dos participantes antes de gravar.": "Terms of use for Salavox, including the user's responsibility for obtaining the participants' consent before recording.",
    "Conexões externas": "External connections",
    "Confirmo que vou avisar os participantes de que a reunião está sendo gravada.": "I confirm that I will tell the participants the meeting is being recorded.",
    "Contrato e nota fiscal": "Contract and invoice",
    "Cookies": "Cookies",
    "Copiar": "Copy",
    "Copiar o aviso para colar no chat": "Copy the notice to paste in the chat",
    "Copiar o e-mail": "Copy the e-mail",
    "Crie a conta e experimente com": "Create the account and try it with",
    "Dados que não coletamos, em nenhum plano": "Data we do not collect, on any plan",
    "Decisions": "Decisions",
    "Depende do seu computador e do modelo escolhido. Blocos sem fala são pulados, o que ajuda bastante em reunião real. A tela mostra percentual e previsão enquanto roda.": "It depends on your computer and the model you choose. Blocks with no speech are skipped, which helps a lot in a real meeting. The screen shows a percentage and an estimate while it runs.",
    "Depois da primeira vez, sem internet": "After the first time, no internet needed",
    "Detalhes nos": "Details in the",
    "Diagnóstico": "Diagnostics",
    "Diagrama: o microfone entra no canal esquerdo e o áudio da chamada no canal direito; a gravação e a transcrição acontecem no seu computador e nada é enviado para fora.": "Diagram: the microphone comes in on the left channel and the call audio on the right channel; the recording and the transcription happen on your computer and nothing is sent outside.",
    "Diga para quem enviar.": "Say who to send it to.",
    "Do outro lado": "On the other side",
    "Documentação de conformidade para auditoria": "Compliance documentation for audit",
    "Duas fontes, dois caminhos": "Two sources, two paths",
    "Durante a reunião: dois medidores separados, um para você e outro para a chamada. É dessa separação que sai a marcação de quem falou — sem modelo de separação de locutor, sem nuvem.": "During the meeting: two separate meters, one for you and one for the call. That separation is where the speaker labelling comes from — no speaker-separation model, no cloud.",
    "Duration:": "Duration:",
    "Duração de cada gravação": "Length of each recording",
    "Duração:": "Duration:",
    "E mais quatro arquivos, sempre": "And four more files, always",
    "E o registro de que eu avisei os participantes?": "And the record that I told the participants?",
    "E os slides e telas que foram compartilhados?": "What about the slides and screens that were shared?",
    "E vale ler a letra miúda dos planos grátis antes de comparar. Eles costumam ter": "And it is worth reading the small print of the free plans before comparing. They usually have",
    "E-mail para os participantes": "E-mail to the participants",
    "Ele sabe quem falou porque as vozes": "It knows who spoke because the voices",
    "Encerrar": "Stop",
    "Entrar": "Sign in",
    "Enviando…": "Sending…",
    "Enviar a ata por e-mail, com a sua assinatura": "Send the minutes by e-mail, with your signature",
    "Enviar agora": "Send now",
    "Envio da ata por e-mail": "Sending the minutes by e-mail",
    "Erra, como toda transcrição automática, principalmente com áudio ruim, sotaques e várias pessoas falando ao mesmo tempo. Por isso duas coisas: o vocabulário do escritório conserta sozinho os termos que ele sempre erra, e qualquer fala pode ser corrigida com um clique antes de gerar o PDF. A ata sai marcada como automática, e decisões importantes devem ser conferidas na gravação.": "It does, like every automatic transcript, especially with poor audio, accents and several people speaking at once. Hence two things: your practice's vocabulary fixes on its own the terms it always gets wrong, and any line can be corrected with a click before the PDF is produced. The minutes come out marked as automatic, and important decisions should be checked against the recording.",
    "Errou? Corrija na hora": "Got it wrong? Fix it on the spot",
    "Escreva quem é você e quem está do outro lado. Clicar no nome de uma fala troca quem falou, e o nome vai para todos os arquivos.": "Write who you are and who is on the other side. Clicking the name on a line changes who spoke, and the name goes into every file.",
    "Escritório": "Practice",
    "Esses terceiros possuem políticas próprias e podem registrar dados técnicos da conexão, como endereço de IP, da mesma forma que ocorre ao visitar qualquer site.": "These third parties have their own policies and may log technical connection data, such as an IP address, in the same way as happens when visiting any site.",
    "Esta instalação não tem conta.": "This installation has no account.",
    "Esta página — a de apresentação, com textos e imagens — não faz nenhuma conexão a serviços de terceiros.": "This page — the presentation one, with text and images — makes no connection to third-party services.",
    "Este registro é a declaração de quem gravou, não uma verificação feita pelo Salavox — ele não entra na chamada e não tem como conferir o que foi dito.": "This record is the statement of the person who recorded, not a check made by Salavox — it does not join the call and has no way to verify what was said.",
    "Estes termos podem ser atualizados. A data no topo indica a última revisão, e o uso continuado após mudanças significa concordância com a nova versão.": "These terms may be updated. The date at the top indicates the last revision, and continued use after changes means agreement with the new version.",
    "Estes termos são regidos pela lei brasileira, eleito o foro do domicílio do usuário para dirimir controvérsias, quando aplicável a legislação consumerista.": "These terms are governed by Brazilian law, with the courts of the user's domicile chosen to settle disputes where consumer legislation applies.",
    "Falar sobre o escritório": "Talk about the practice",
    "Fechar meu microfone": "Close my microphone",
    "Ferramentas de nuvem": "Cloud tools",
    "Fica na própria ata. O Salavox anota a hora em que você confirmou que avisaria, a hora em que pegou o texto do aviso e a hora em que a gravação começou, junto com o texto exato oferecido — e leva tudo isso para o PDF e para o arquivo de texto. É a sua declaração, com carimbo de hora, guardada no mesmo documento que vai para o cliente.": "It stays in the minutes themselves. Salavox notes the time you confirmed that you would give notice, the time you took the text of the notice and the time the recording started, together with the exact text offered — and carries all of it into the PDF and the text file. It is your statement, time-stamped, kept in the same document that goes to the client.",
    "Ficar mudo na reunião não fecha o microfone aqui.": "Muting yourself in the meeting does not close the microphone here.",
    "Flagged moments:": "Flagged moments:",
    "Funciona com Zoom, Teams e Google Meet?": "Does it work with Zoom, Teams and Google Meet?",
    "Funciona sem internet": "Works offline",
    "Gerar a transcrição": "Generate the transcript",
    "Grava a reunião, transcreve e entrega a ata. Sem robô entrando na chamada e sem nada sair do seu computador.": "Records the meeting, transcribes it and delivers the minutes. No bot joining the call and nothing leaving your computer.",
    "Gravar": "Record",
    "Gravar conversas de terceiros das quais você não participe": "Recording conversations of third parties in which you do not take part",
    "Gravar o vídeo da tela": "Record the screen video",
    "Gravar pessoas sem o consentimento exigido pela lei aplicável": "Recording people without the consent required by applicable law",
    "Gravar reunião de cliente exige avisar os participantes, e quem responde por isso é quem gravou. O Salavox registra na própria ata": "Recording a client meeting requires telling the participants, and the person who recorded answers for it. Salavox writes into the minutes themselves",
    "Gravar uma conversa sem que as pessoas saibam pode ser ilegal, e as regras mudam conforme o país e o estado. O Salavox exige que você confirme que vai avisar, e oferece o texto pronto para colar no chat da reunião. Ele não entra na chamada e não tem como verificar isso por você.": "Recording a conversation without people knowing may be illegal, and the rules change from country to country and state to state. Salavox requires you to confirm that you will give notice, and offers ready-made text to paste into the meeting chat. It does not join the call and has no way to verify this for you.",
    "Gravar uma conversa sem que os participantes saibam pode ser ilegal, e as regras variam conforme o país, o estado e o tipo de conversa.": "Recording a conversation without the participants knowing may be illegal, and the rules vary by country, by state and by the type of conversation.",
    "Gravar uma reunião": "Record a meeting",
    "Gravar, transcrever e gerar a ata": "Recording, transcribing and producing the minutes",
    "Gravação com prazo de retenção, transcrição que só baixa no plano pago, material que some se a assinatura vencer. Aqui o resultado é um arquivo no seu computador desde o primeiro segundo.": "Recordings with a retention deadline, a transcript you can only download on a paid plan, material that disappears if the subscription lapses. Here the result is a file on your computer from the first second.",
    "Gravação com áudio da chamada e microfone": "Recording with call audio and microphone",
    "Gravações de tela, áudio e vídeo das suas reuniões": "Screen, audio and video recordings of your meetings",
    "Grave": "Record",
    "Grave a reunião, receba a ata": "Record the meeting, get the minutes",
    "Grave a reunião, transcreva e receba a ata com quem falou o quê. Nenhum robô entra na chamada e nenhum áudio é enviado para servidor. Feito para quem trata de assunto confidencial.": "Record the meeting, transcribe it and get minutes showing who said what. No bot joins the call and no audio is sent to a server. Made for people who handle confidential matters.",
    "Grátis de verdade": "Genuinely free",
    "Grátis e sem limite de duração.": "Free and with no limit on length.",
    "Hospedagem": "Hosting",
    "Hugging Face": "Hugging Face",
    "Há também um": "There is also a",
    "IA do Salavox": "IA do Salavox",
    "Identidade dos participantes das suas reuniões": "The identity of the participants in your meetings",
    "Identificadores de rastreamento, perfis de comportamento ou dados para publicidade": "Tracking identifiers, behavioural profiles or advertising data",
    "Individual": "Individual",
    "Integra com agenda e CRM": "Integrates with calendar and CRM",
    "Janelinha flutuante": "Floating window",
    "Já tem a gravação? Arraste": "Already have the recording? Drag it in",
    "Legenda": "Subtitles",
    "Leia isto antes de gravar": "Read this before recording",
    "Leva menos tempo que ler esta página. Sem cadastro, sem instalação, sem cartão.": "It takes less time than reading this page. No sign-up, no install, no card.",
    "Licença para toda a equipe": "Licence for the whole team",
    "Mais alguém": "Anyone else",
    "Manter todas": "Keep all",
    "Marcar este momento": "Flag this moment",
    "Marcar momentos e nomear quem falou": "Flag moments and name who spoke",
    "Meeting of 13 August 2026": "Meeting of 13 August 2026",
    "Meeting summary": "Meeting summary",
    "Menores de idade": "Minors",
    "Minutes organised.": "Minutes organised.",
    "Modelo de aviso e política de retenção": "Notice template and retention policy",
    "Momentos marcados:": "Flagged moments:",
    "Na máxima extensão permitida pela lei, não nos responsabilizamos por perdas ou danos decorrentes do uso ou da impossibilidade de uso do serviço, incluindo gravação perdida, transcrição incorreta, resumo impreciso, perda de dados, lucros cessantes, danos reputacionais ou responsabilização de terceiros. Na parte gratuita, o uso se dá por conta e risco do usuário. Na parte paga, e onde a lei não permitir exclusão, nossa responsabilidade fica limitada ao valor pago pelo usuário nos doze meses anteriores ao evento.": "To the fullest extent permitted by law, we are not liable for losses or damages arising from the use or the impossibility of use of the service, including a lost recording, an incorrect transcript, an inaccurate summary, data loss, lost profits, reputational harm or liability towards third parties. In the free part, use is at the user's own risk. In the paid part, and where the law does not permit exclusion, our liability is limited to the amount paid by the user in the twelve months before the event.",
    "Nada sai": "Nothing leaves",
    "Nada. Sem cadastro, o Salavox não guarda seu nome, e-mail ou telefone, não registra quantas reuniões você gravou e não usa cookies. Gravar, transcrever, varrer as telas compartilhadas e exportar em PDF, texto e legenda funcionam assim, de graça e sem limite de duração.": "Nothing. Without sign-up, Salavox does not keep your name, e-mail or phone number, does not record how many meetings you recorded and does not use cookies. Recording, transcribing, sweeping the shared screens and exporting to PDF, text and subtitles work like that, free and with no limit on length.",
    "Nenhum robô": "No bot",
    "Nenhum robô entra na chamada e nada sai do seu computador — a gravação e a transcrição acontecem aqui, no seu navegador.": "No bot joins the call and nothing leaves your computer — recording and transcription happen right here, in your browser.",
    "Nenhum robô entra na chamada — e, mais importante,": "No bot joins the call — and, more to the point,",
    "Nenhuma ferramenta de nuvem faz isso": "No cloud tool does this",
    "Next steps": "Next steps",
    "No seu computador, e só. A gravação, a transcrição e a ata nascem e ficam aí — não há para onde elas subirem. Se você assinar o plano pago existe conta e existe servidor, mas o que ele vê é o seu e-mail, o seu plano e quantos resumos você pediu no mês; gravação, ele nunca vê. Esta página, aliás, não faz uma única chamada a servidor de terceiro: nem fonte, nem rastreador, nem estatística.": "On your computer, and nowhere else. The recording, the transcript and the minutes are born and stay there — there is nowhere for them to go up to. If you subscribe to the paid plan there is an account and there is a server, but what it sees is your e-mail, your plan and how many summaries you asked for this month; the recording, it never sees. This page, incidentally, does not make a single call to any third-party server: no font, no tracker, no analytics.",
    "Nome de cliente, sigla e termo técnico que a transcrição sempre erra: escreva uma vez e ele corrige em todas as atas. Em português — o que nem os pagos oferecem.": "Client names, acronyms and technical terms the transcript always gets wrong: write them once and it fixes them in every set of minutes.",
    "Nome ou razão social": "Name or company name",
    "Nomes de clientes, siglas e termos que a transcrição costuma errar. Um por linha. Depois de transcrever, o Salavox troca o que ficou parecido pelo termo certo.": "Client names, acronyms and terms the transcript usually gets wrong. One per line. After transcribing, Salavox swaps what came out close for the right term.",
    "Nomes de verdade": "Real names",
    "Nunca recebemos gravação, áudio ou vídeo — em plano nenhum.": "We never receive recordings, audio or video — on any plan.",
    "Não garantimos funcionamento ininterrupto. O serviço pode ser alterado, suspenso ou encerrado a qualquer momento.": "We do not warrant uninterrupted operation. The service may be changed, suspended or discontinued at any time.",
    "Não há caminho no produto para esse material sair do seu computador. Sem conta, também não recebemos absolutamente nada: não há login, não há cookies e não há registro de uso. Se você assinar o plano pago, passamos a guardar o seu e-mail e a contagem de resumos do mês, e o": "There is no path in the product for that material to leave your computer. Without an account, we also receive absolutely nothing: there is no login, there are no cookies and there is no usage record. If you subscribe to the paid plan, we start keeping your e-mail and the month's summary count, and the",
    "Não utilizamos cookies próprios nem de terceiros para rastreamento, publicidade ou análise.": "We use no cookies of our own or of third parties for tracking, advertising or analytics.",
    "Não é recurso de plano pago. Quem grava reunião de cliente precisa disso na primeira reunião, não na trigésima.": "It is not a paid-plan feature. Anyone recording a client meeting needs this at the first meeting, not the thirtieth.",
    "Não, e vale entender por quê. Certificado de segurança atesta como uma empresa cuida do dado que recebe. O Salavox quase não recebe dado: a gravação, a transcrição e a ata nascem e ficam no seu computador, e não existe caminho para elas subirem. O que chega ao nosso servidor, e só de quem assina e só quando clica, é o texto da ata para gerar um resumo — usado e descartado na mesma requisição. Não há gravação para vazar e não há funcionário nosso com acesso a reunião nenhuma. O resto do que há para auditar é o seu próprio computador, e disso a política de segurança do seu escritório já cuida.": "No, and it is worth understanding why. A security certificate attests to how a company looks after the data it receives. Salavox receives almost no data: the recording, the transcript and the minutes are born and stay on your computer, and there is no path for them to go up. What reaches our server, and only from subscribers and only when they click, is the text of the minutes to produce a summary — used and discarded in the same request. There is no recording to leak and no employee of ours with access to any meeting. The rest of what there is to audit is your own computer, and your practice's security policy already covers that.",
    "Não. Nenhum robô entra na chamada e nada aparece na lista de participantes. Justamente por isso avisar é obrigação sua — e o Salavox insiste nisso antes de deixar você gravar.": "No. No bot joins the call and nothing appears in the participant list. That is exactly why giving notice is your duty — and Salavox insists on it before letting you record.",
    "O PDF sai com as telas embutidas no minuto em que apareceram, pronto para anexar ao e-mail do cliente.": "The PDF comes out with the screens embedded at the minute they appeared, ready to attach to the client's e-mail.",
    "O Salavox não entra na chamada, não se anuncia aos participantes e não tem como verificar se você avisou. Ele exige a sua confirmação expressa antes de iniciar a gravação e oferece um texto de aviso pronto — mas a decisão, o aviso e as consequências são inteiramente suas.": "Salavox does not join the call, does not announce itself to the participants and has no way to verify that you gave notice. It requires your express confirmation before starting a recording and offers a ready-made notice text — but the decision, the notice and the consequences are entirely yours.",
    "O Salavox não recebe suas gravações, não coleta dados pessoais e não usa cookies. Todo o processamento acontece no seu computador.": "Salavox does not receive your recordings, does not collect personal data and does not use cookies. All processing happens on your computer.",
    "O Salavox tem duas partes, e elas tratam dados de formas diferentes: a": "Salavox has two parts, and they handle data differently: the",
    "O Salavox varre a gravação procurando os momentos em que a tela mudou e guarda uma imagem de cada um. Você escolhe quais entram, e elas aparecem na ata no instante exato em que foram mostradas — no PDF, junto com a fala daquele momento.": "Salavox sweeps the recording looking for the moments when the screen changed and keeps an image of each one. You choose which go in, and they appear in the minutes at the exact moment they were shown — in the PDF, alongside the words from that moment.",
    "O Salavox é uma ferramenta executada no navegador que grava a tela e o áudio de uma reunião, transcreve a fala e monta um documento com a transcrição. Gravar, transcrever, identificar as telas compartilhadas e exportar são": "Salavox is a tool that runs in the browser, records the screen and audio of a meeting, transcribes the speech and assembles a document with the transcript. Recording, transcribing, identifying the shared screens and exporting are",
    "O Salavox é uma página estática. A captura da tela e do áudio é feita pelo navegador, no seu dispositivo. A gravação é escrita em pedaços num armazenamento privado do próprio navegador, no seu disco, a transcrição é executada localmente e os arquivos gerados são salvos por você, onde você escolher. Nada disso trafega para nós.": "Salavox is a static page. Screen and audio capture is done by the browser, on your device. The recording is written in chunks to the browser's own private storage, on your disk, transcription runs locally and the files produced are saved by you, wherever you choose. None of this travels to us.",
    "O botão de silenciar do Meet, do Teams ou do Zoom cala você para os outros; o Salavox continua ouvindo por conta própria — é até desejável, porque assim a sua fala entra na ata mesmo quando você esquece de reabrir. Para parar mesmo, use o botão": "The mute button in Meet, Teams or Zoom silences you for the others; Salavox keeps listening on its own — which is a good thing, because your words still reach the minutes when you forget to unmute. To really stop, use the button",
    "O microfone entra pelo canal esquerdo; o áudio da reunião, pelo direito.": "The microphone comes in on the left channel; the meeting audio, on the right.",
    "O modelo de transcrição baixado fica em cache no seu navegador para não precisar ser baixado de novo. A gravação é escrita em pedaços num armazenamento privado do navegador enquanto acontece — é o que permite recuperar a reunião se a aba fechar no meio —, e o botão de apagar remove tudo. Esses arquivos permanecem no seu dispositivo, sob seu controle, e somem ao limpar os dados de navegação.": "The downloaded transcription model is cached in your browser so it does not need downloading again. The recording is written in chunks to the browser's private storage while it happens — that is what makes it possible to recover the meeting if the tab closes halfway — and the delete button removes everything. These files stay on your device, under your control, and disappear when you clear browsing data.",
    "O modelo de transcrição fica guardado no seu navegador. Reunião no avião, no cliente, sem rede: funciona igual.": "The transcription model stays in your browser. A meeting on a plane, at the client's, with no network: it works the same.",
    "O modelo é baixado na primeira transcrição e fica guardado no navegador para as próximas.": "The model is downloaded on the first transcription and kept in the browser for the next ones.",
    "O navegador fechou? Nada se perde": "Browser closed? Nothing is lost",
    "O navegador solicitará sua autorização para capturar a tela e, se você marcar a opção, para usar o microfone. Essas permissões são concedidas ao navegador, não a nós, e podem ser revogadas nas configurações dele a qualquer momento.": "The browser will ask your permission to capture the screen and, if you tick the option, to use the microphone. Those permissions are granted to the browser, not to us, and can be revoked in its settings at any time.",
    "O pagamento é processado pela": "Payment is processed by",
    "O plano pago inclui uma": "The paid plan includes a",
    "O problema": "The problem",
    "O que costumam perguntar": "What people usually ask",
    "O que mais ele faz": "What else it does",
    "O que sai daqui:": "What leaves this page:",
    "O que sai de cada lado já vem etiquetado, sem precisar reconhecer voz nenhuma.": "What comes out of each side arrives already labelled, without recognising any voice.",
    "O que você leva embora": "What you take away",
    "O que é compactar o silêncio": "What compacting the silence means",
    "O que é seu deixa de ser seu": "What is yours stops being yours",
    "O reconhecimento de voz roda no seu próprio computador, usando a placa de vídeo. Em português, inglês, espanhol — ou deixe que ele descubra o idioma.": "Speech recognition runs on your own computer, using the graphics card. In Portuguese, English, Spanish — or let it work out the language.",
    "O registro do consentimento": "The consent record",
    "O resumo entra no PDF e no texto da ata, marcado como gerado por modelo e sem revisão humana — porque é isso que ele é. E qualquer linha pode ser corrigida antes de gerar o documento.": "The summary goes into the PDF and into the text of the minutes, marked as model-generated and not human-reviewed — because that is what it is. And any line can be corrected before the document is produced.",
    "O serviço não é direcionado a menores de 18 anos. Gravar reunião com participação de menores exige cuidado adicional e, em regra, consentimento de quem detém a responsabilidade legal.": "The service is not directed at people under 18. Recording a meeting with minors taking part requires additional care and, as a rule, the consent of whoever holds legal responsibility.",
    "O serviço é fornecido \"como está\". Não garantimos que a gravação será concluída, que o áudio será captado, que a transcrição estará correta ou completa, nem que o resultado sirva a qualquer finalidade específica. A transcrição é gerada por modelo estatístico e contém erros.": "The service is provided \"as is\". We do not warrant that the recording will complete, that the audio will be captured, that the transcript will be correct or complete, nor that the result will serve any particular purpose. The transcript is produced by a statistical model and contains errors.",
    "O texto produzido é gerado por modelo estatístico,": "The text produced is generated by a statistical model,",
    "O texto é usado para gerar aquele resumo e jogado fora na mesma requisição. Não fica em banco, não vira histórico, não treina modelo nenhum. Não guardamos o que não precisamos guardar.": "The text is used to produce that summary and thrown away in the same request. It is not stored in a database, does not become history, and trains no model. We do not keep what we do not need to keep.",
    "O vídeo com o áudio, para guardar onde e por quanto tempo você quiser.": "The video with the audio, to keep wherever and for however long you want.",
    "O áudio e o vídeo": "The audio and the video",
    "O áudio sai do computador": "The audio leaves the computer",
    "O único resumo por IA que": "The only AI summary that",
    "Obter o consentimento de todos os participantes é responsabilidade exclusiva de quem usa o Salavox.": "Obtaining the consent of every participant is the sole responsibility of whoever uses Salavox.",
    "Onde ele ganha e onde ele perde": "Where it wins and where it loses",
    "Onde ficam as gravações?": "Where are the recordings kept?",
    "Onde o áudio é processado": "Where the audio is processed",
    "Open items": "Open items",
    "Organised minutes": "Organised minutes",
    "Organizar a ata": "Organise the minutes",
    "Os dados dos participantes são de sua responsabilidade": "The participants' data are your responsibility",
    "Os nomes são seus": "The names are yours",
    "Os outros participantes veem alguma coisa?": "Do the other participants see anything?",
    "Os preços podem mudar; qualquer alteração será avisada com antecedência e valerá a partir do ciclo seguinte.": "Prices may change; any change will be announced in advance and will apply from the following cycle.",
    "Ou detecção automática, quando a reunião muda de idioma no meio e ninguém quer escolher antes.": "Or automatic detection, for when the meeting switches language halfway and nobody wants to choose in advance.",
    "PARTICIPANTES": "PARTICIPANTS",
    "PARTICIPANTES, VOCÊ": "PARTICIPANTS, YOU",
    "PARTICIPANTS": "PARTICIPANTS",
    "PARTICIPANTS, YOU": "PARTICIPANTS, YOU",
    "PDF, texto ou legenda, com o instante de cada fala, quem falou e as telas compartilhadas. Com o resumo e as pendências junto, se você assinar.": "PDF, text or subtitles, with the timestamp of every line, who spoke and the screens that were shared. With the summary and the open items alongside, if you subscribe.",
    "PDF, texto, legenda e a gravação": "PDF, text, subtitles and the recording",
    "Pagamento": "Payment",
    "Para": "To",
    "Para elas a gravação é o produto e fica no servidor delas; o registro do aviso não teria a quem servir. Aqui a gravação é sua, e a prova de que ela foi consentida também.": "For them the recording is the product and it lives on their server; a record of the notice would have no one to serve. Here the recording is yours, and so is the proof that it was consented to.",
    "Para o cliente regulado": "For the regulated client",
    "Participantes": "Participants",
    "Participantes:": "Participants:",
    "Participants:": "Participants:",
    "Passages:": "Passages:",
    "Perante a legislação de proteção de dados, quem grava é o controlador dos dados pessoais contidos na reunião. Como não recebemos nem tratamos esse conteúdo, não atuamos como controlador nem como operador em relação a ele.": "Under data protection law, whoever records is the controller of the personal data contained in the meeting. As we neither receive nor process that content, we act neither as controller nor as processor in relation to it.",
    "Perguntar": "Ask",
    "Perguntar à ata: em quanto ficou o imposto?": "Ask the minutes: how much was the tax in the end?",
    "Perguntas frequentes": "Frequently asked questions",
    "Permissões que pedimos": "Permissions we ask for",
    "Pix, boleto ou cartão": "Pix, bank slip or card",
    "Política de Privacidade": "Privacy Policy",
    "Política de Privacidade — Salavox": "Privacy Policy — Salavox",
    "Por quanto tempo guarda": "How long it keeps things",
    "Porque não é a mesma coisa sendo vendida. Nelas, o resumo sai de uma reunião que já está no servidor delas — o áudio inteiro, o vídeo, a transcrição. O resumo é grátis porque a reunião é o pagamento. Aqui o áudio nunca sai do seu computador; sobe só o": "Because it is not the same thing being sold. In theirs, the summary comes from a meeting that is already on their server — the whole audio, the video, the transcript. The summary is free because the meeting is the payment. Here the audio never leaves your computer; what goes up is only the",
    "Português, inglês, espanhol": "Portuguese, English, Spanish",
    "Precisa de conta": "Account required",
    "Preciso — 5 por mês": "Precise — 5 per month",
    "Preparando o modelo para transcrever durante a reunião…": "Getting the model ready to transcribe during the meeting…",
    "Preço": "Price",
    "Preços": "Pricing",
    "Privacidade": "Privacy",
    "Procurar as telas mostradas": "Look for the screens that were shown",
    "Profissional": "Professional",
    "Quando você confirmou, o texto do aviso e a hora em que a gravação começou.": "When you confirmed, the text of the notice and the time the recording started.",
    "Quando:": "When:",
    "Quanto cabe no plano grátis": "How much fits in the free plan",
    "Quanto tempo demora a transcrição?": "How long does transcription take?",
    "Quem entra na conta tem, além disso, a sessão guardada no navegador, como em qualquer site com login. Sair da conta a apaga. O texto da reunião nunca é guardado ali.": "Anyone who signs in also has the session kept in the browser, as on any site with a login. Signing out deletes it. The text of the meeting is never kept there.",
    "Quem gravou confirmou às": "The person recording confirmed at",
    "Quem trata de assunto confidencial não pode": "Anyone handling confidential matters cannot",
    "Quem você é, qual é o seu plano e quanto você já usou.": "Who you are, which plan you are on and how much you have used.",
    "R$ 0": "R$ 0",
    "R$ 19,90": "R$ 19.90",
    "R$ 19,90 — sem entregar a reunião": "R$ 19.90 — without handing over the meeting",
    "ROOM": "ROOM",
    "Receba a ata": "Get the minutes",
    "Receber o link": "Get the link",
    "Recupera a reunião se o navegador fechar no meio": "Recovers the meeting if the browser closes halfway",
    "Recursos": "Features",
    "Registro de consentimento": "Consent record",
    "Registro de consentimento na ata": "Consent record in the minutes",
    "Registro de consentimento.": "Consent record.",
    "Resumo": "Summary",
    "Resumo e pendências": "Summary and open items",
    "Resumo por IA": "AI summary",
    "Resumo por IA existe em toda ferramenta de ata, e em várias ele é de graça. A diferença não está em": "AI summaries exist in every meeting-notes tool, and in several of them they are free. The difference is not in",
    "Resumo por IA no grátis": "AI summary on the free plan",
    "Resumo, decisões e pendências": "Summary, decisions and open items",
    "Resumo, decisões, pendências e próximos passos entram no PDF e no texto — e o e-mail já está pronto abaixo.": "Summary, decisions, open items and next steps go into the PDF and the text — and the e-mail is ready below.",
    "Resumo, decisões, pendências e próximos passos entram no PDF e no texto.": "Summary, decisions, open items and next steps go into the PDF and the text.",
    "Reunião de contador com cliente, de advogado com parte, de médico com paciente, de RH com funcionário. O conteúdo é sigiloso por dever de ofício — e sai da sua sala no instante em que o áudio sobe para a nuvem de terceiro.": "An accountant with a client, a lawyer with a party, a doctor with a patient, HR with an employee. The content is confidential by professional duty — and it leaves your room the moment the audio goes up to a third party's cloud.",
    "Reunião gravada pelo Zoom, áudio do WhatsApp, entrevista no gravador do celular — arraste o arquivo e ele vira ata do mesmo jeito.": "A meeting recorded by Zoom, a WhatsApp voice note, an interview on a phone recorder — drag the file in and it becomes minutes just the same.",
    "Reunião on-line": "Online meeting",
    "Reunião presencial": "In-person meeting",
    "Reunião → transcrição → ata": "Meeting → transcript → minutes",
    "Robô visível na chamada": "Visible bot in the call",
    "Rápido — 30 por mês": "Fast — 30 per month",
    "SEU COMPUTADOR": "YOUR COMPUTER",
    "Sala": "Sala",
    "Salavox": "Salavox",
    "Salavox versão": "Salavox version",
    "Salavox — a ata da reunião sem nada sair do seu computador": "Salavox — meeting minutes without anything leaving your computer",
    "Salavox — a reunião fica na sala.": "Salavox — the meeting stays in the room.",
    "Salavox — grave a reunião, receba a ata": "Salavox — record the meeting, get the minutes",
    "Se esta política mudar, a data no topo será atualizada. Mudanças relevantes — especialmente qualquer passagem a coletar dados — serão anunciadas com destaque na página.": "If this policy changes, the date at the top will be updated. Relevant changes — especially any move to collect data — will be announced prominently on the page.",
    "Se o que você precisa é integração com calendário, aplicativo de celular e identificação individual de cada participante, as ferramentas de nuvem fazem isso melhor. O Salavox é para quem não pode mandar o áudio para fora. A coluna da direita descreve o que os": "If what you need is calendar integration, a phone app and individual identification of each participant, the cloud tools do that better. Salavox is for people who cannot send the audio outside. The right-hand column describes what the",
    "Sem cadastro": "No sign-up",
    "Sem cartão para experimentar: 7 de cortesia antes": "No card to try it: 7 complimentary first",
    "Sem conta: o que sai daqui": "Without an account: what leaves here",
    "Sem fonte hospedada fora, sem rastreador, sem ferramenta de estatística. Tudo o que ela carrega vem do próprio endereço do Salavox.": "No externally hosted font, no tracker, no analytics tool. Everything it loads comes from Salavox's own address.",
    "Sem instalar nada, sem chave de ninguém, sem colar texto em lugar nenhum. Quatro botões: resumo executivo, decisões e pendências, e-mail de acompanhamento e pergunta livre à ata.": "Nothing to install, nobody's API key, no text to paste anywhere. One button: summary, decisions, open items with owner and due date, next steps and the follow-up e-mail, ready to send.",
    "Sem limite": "No limit",
    "Sem robô na chamada, sem áudio na nuvem. A gravação e a transcrição acontecem no seu navegador.": "No bot in the call, no audio in the cloud. Recording and transcription happen in your browser.",
    "Sem senha: você recebe um link no e-mail e clica. Gravar, transcrever e exportar funcionam sem conta nenhuma — a conta serve para o resumo por IA e para o envio da ata.": "No password: you get a link by e-mail and click it. Recording, transcribing and exporting work with no account at all — the account is for the AI summary and for sending the minutes.",
    "Sendo exato:": "To be exact:",
    "Separa cada participante": "Separates each participant",
    "Seu microfone": "Your microphone",
    "Seu microfone entra por um caminho separado do áudio da chamada, e é isso que permite saber depois quem falou o quê — sem robô, sem nuvem, sem separação de voz por inteligência artificial.": "Your microphone comes in on a separate path from the call audio, and that is what makes it possible to tell afterwards who said what — no bot, no cloud, no AI voice separation.",
    "Seus direitos": "Your rights",
    "Sigilo profissional não é detalhe técnico": "Professional confidentiality is not a technical detail",
    "Sim. A reunião é gravada em pedaços, escritos no disco à medida que acontecem, e a transcrição lê o áudio em fatias de trinta segundos — em nenhum momento a reunião inteira precisa caber na memória. Como efeito colateral, se o navegador fechar sozinho no meio, o que já foi gravado continua lá: ao abrir a página de novo, o Salavox oferece a gravação interrompida.": "Yes. The meeting is recorded in chunks, written to disk as they happen, and the transcription reads the audio in thirty-second slices — at no point does the whole meeting need to fit in memory. As a side effect, if the browser closes on its own halfway through, whatever was already recorded is still there: when you open the page again, Salavox offers you the interrupted recording.",
    "Simples Nacional DIRF Construtora Andrade pró-labore": "Acme Holdings\nEBITDA\nquarterly close",
    "Site": "Site",
    "Sua conta": "Your account",
    "Sua conta — Salavox": "Your account — Salavox",
    "Suporte com prazo de resposta": "Support with a response time",
    "Só há 0.4 GB livres para o navegador.": "Only 0.4 GB free for the browser.",
    "Só o texto sobe": "Only the text goes up",
    "Só para quem assina:": "Only for subscribers:",
    "TRANSCRIPT": "TRANSCRIPT",
    "Tecla M marca o momento": "The M key flags the moment",
    "Telas compartilhadas": "Shared screens",
    "Telas compartilhadas embutidas na ata": "Shared screens embedded in the minutes",
    "Telas compartilhadas na ata": "Shared screens in the minutes",
    "Telas:": "Screens:",
    "Tem resumo por IA, como os concorrentes?": "Is there an AI summary, like the competitors?",
    "Tem, e você pode experimentar antes de pagar: criando a conta vêm": "There is, and you can try it before paying: creating the account gives you",
    "Tentar comprometer a disponibilidade ou a integridade do site": "Attempting to compromise the availability or integrity of the site",
    "Termos": "Terms",
    "Termos de Uso": "Terms of Use",
    "Termos de Uso — Salavox": "Terms of Use — Salavox",
    "Teste na sua": "Try it in your",
    "Texto": "Text",
    "Texto do aviso oferecido:": "Text of the notice offered:",
    "Tirar": "Remove",
    "Tirar a marca do Salavox do rodapé da ata": "Remove the Salavox mark from the footer of the minutes",
    "Transcreva": "Transcribe",
    "Transcrever": "Transcribe",
    "Transcrever durante a reunião": "Transcribing during the meeting",
    "Transcrito na": "Transcribed on the",
    "Transcrição local, sem limite de minutos": "Local transcription, no limit on minutes",
    "Trechos:": "Passages:",
    "Treinamento da equipe": "Team training",
    "Troque \"Participantes\" pelo nome de quem estava lá; clicar numa fala muda quem falou.": "Swap \"Participants\" for the name of whoever was there; clicking a line changes who spoke.",
    "Três passos, nenhuma conta": "Three steps, no account",
    "Tudo do grátis, sem limite": "Everything in the free plan, unlimited",
    "Título da reunião": "Meeting title",
    "Uma passada só, e sai tudo:": "One pass, and out comes everything:",
    "Usado e descartado": "Used and discarded",
    "Usar": "Use",
    "Usar o material para chantagem, constrangimento, assédio ou qualquer finalidade ilícita": "Using the material for blackmail, humiliation, harassment or any unlawful purpose",
    "Use uma gravação que você já tem": "Use a recording you already have",
    "VOCÊ": "YOU",
    "VOCÊ, PARTICIPANTES": "YOU, PARTICIPANTS",
    "Vem no plano grátis": "Included in the free plan",
    "Ver como funciona": "See how it works",
    "Vi uma ferramenta com resumo por IA ilimitado e de graça. Por que pagar aqui?": "I saw a tool with unlimited free AI summaries. Why pay here?",
    "Violar sigilo profissional, segredo de justiça ou obrigação contratual de confidencialidade": "Breaching professional confidentiality, judicial secrecy or a contractual duty of confidentiality",
    "Vocabulário do escritório": "Your practice's vocabulary",
    "Vocabulário do escritório e correção do texto": "Your practice's vocabulary and text correction",
    "Você": "You",
    "Você abre uma página. Não instala nada, não cria login, não conecta o Salavox a coisa nenhuma.": "You open a page. You install nothing, create no login, connect Salavox to nothing at all.",
    "Você clica, o resumo sai": "You click, the summary comes out",
    "Você declara e garante que, antes de iniciar qualquer gravação:": "You declare and warrant that, before starting any recording:",
    "Você não está em nenhuma conta —": "You are not signed in to any account —",
    "Você pode encerrar a conta a qualquer momento pedindo por e-mail, e apagamos o cadastro e a contagem de uso. Não há gravação para apagar, porque nunca houve gravação nossa.": "You can close the account at any time by asking by e-mail, and we delete the registration and the usage count. There is no recording to delete, because there was never a recording of ours.",
    "Você tem": "You have",
    "Você é": "You are",
    "Você é o único responsável pelo que grava, por como usa o material e por eventuais danos a terceiros decorrentes da gravação, da transcrição ou da divulgação do conteúdo. Isso inclui responsabilidade civil, criminal, administrativa e disciplinar perante conselhos profissionais.": "You are solely responsible for what you record, for how you use the material and for any harm to third parties arising from the recording, the transcript or the disclosure of the content. This includes civil, criminal, administrative and disciplinary liability before professional bodies.",
    "Vocês têm SOC 2, ISO 27001, essas certificações?": "Do you have SOC 2, ISO 27001, those certifications?",
    "When:": "When:",
    "YOU": "YOU",
    "a hora em que a gravação começou": "the time the recording started",
    "a hora em que copiou o texto do aviso": "the time you copied the text of the notice",
    "a hora em que você confirmou": "the time you confirmed",
    "a transcrição nem a gravação, e costumam deixar o vídeo da tela para o plano pago. Aqui o limite é o seu disco, baixar é sempre, e o vídeo vem no grátis.": "the transcript or the recording, and they usually leave the screen video for the paid plan. Here the limit is your disk, downloading is always available, and the video comes in the free plan.",
    "accountant@example.com": "accountant@example.com",
    "adianta o trabalho: a cada trinta segundos gravados, aquele trecho já vira texto. Ao encerrar, quase tudo está pronto. O modelo roda numa linha separada do navegador, para não atrapalhar a gravação. Se o computador for modesto, desmarque.": "gets the work done ahead: every thirty seconds recorded, that stretch already becomes text. By the time you stop, almost everything is ready. The model runs on a separate browser thread so it does not disturb the recording. On a modest computer, untick it.",
    "ao nosso servidor e deste ao provedor de modelo de linguagem que utilizamos. O texto é usado para produzir aquela resposta e descartado; não é armazenado por nós nem usado para treinar modelos. Cabe a você avaliar se o conteúdo daquela reunião pode ser enviado — sigilo profissional, cláusula de confidencialidade e dados sensíveis de terceiros continuam sendo sua responsabilidade, e o resumo é opcional justamente por isso.": "to our server and from there to the language-model provider we use. The text is used to produce that answer and discarded; it is not stored by us nor used to train models. It falls to you to judge whether the content of that meeting may be sent — professional confidentiality, confidentiality clauses and third parties' sensitive data remain your responsibility, and that is exactly why the summary is optional.",
    "aqui dentro. Nenhum áudio é enviado": "in here. No audio is sent",
    "atalho: tecla M": "shortcut: M key",
    "até encher a cota; depois se apaga para gravar de novo": "until the quota fills; then things are deleted to record again",
    "canal direito": "right channel",
    "canal esquerdo": "left channel",
    "clique para corrigir o texto": "click to fix the text",
    "clique para remover esta marca": "click to remove this mark",
    "clique para trocar quem falou": "click to change who spoke",
    "com conta": "with an account",
    "com hora e o texto do aviso": "with the time and the text of the notice",
    "com o plano": "with the plan",
    "comece aqui": "start here",
    "compactar o silêncio antes de transcrever": "compact the silence before transcribing",
    "compartilha a tela e capta o áudio da chamada": "shares the screen and captures the call audio",
    "continua de graça": "stays free",
    "copiado": "copied",
    "costuma ser do plano pago": "usually a paid-plan feature",
    "costuma ter, com limite na letra miúda": "usually there, with a limit in the small print",
    "costura a fala de cada lado, tirando os vãos, e manda ao modelo conversa em vez de espera. O Whisper processa sempre trinta segundos, com ou sem fala dentro — então numa reunião normal isso corta o tempo pela metade ou mais. O corte só acontece em silêncio de pelo menos 0,4 s, com folga em volta das palavras, e os instantes voltam para o minuto certo da reunião. Se algum trecho sair no lugar errado, desmarque e refaça: a ata sai igual, só demora mais.": "stitches each side's speech together, dropping the gaps, and sends the model conversation instead of waiting. Whisper always processes thirty seconds, with or without speech inside — so in a normal meeting this cuts the time in half or better. Cuts happen only in silences of at least 0.4 s, with slack around the words, and the timestamps go back to the right minute of the meeting. If any stretch lands in the wrong place, untick it and run again: the minutes come out the same, it just takes longer.",
    "cota mensal de resumos": "monthly summary quota",
    "da ata sobe ao nosso servidor no momento em que você clica em gerar um resumo — usado para aquela resposta e descartado em seguida.": "of the minutes goes up to our server at the moment you click to generate a summary — used for that answer and discarded straight after.",
    "da ata — nunca o áudio nem o vídeo.": "of the minutes — never the audio or the video.",
    "da ata, no clique, e é descartado depois de usado.": "of the minutes, on the click, and it is discarded after use.",
    "da ata, no momento do clique, usado para gerar aquele resumo e descartado em seguida — não fica em banco, não vira histórico e não treina modelo nenhum. O áudio e o vídeo não saem do seu computador nem aí. Sem assinar, a ferramenta continua inteira: gravar, transcrever, varrer as telas e exportar são de graça e sem limite.": "of the minutes, at the moment of the click, used to produce that summary and discarded straight after — it is not stored in a database, does not become history and trains no model. The audio and the video do not leave your computer even then. Without subscribing, the tool stays whole: recording, transcribing, sweeping the screens and exporting are free and unlimited.",
    "da ata, no momento em que você clica, e é descartado depois.": "of the minutes, at the moment you click, and it is discarded afterwards.",
    "de duração": "on length",
    "de graça e sem limite": "free and unlimited",
    "decisões": "decisions",
    "depois de baixar o modelo, sim": "after downloading the model, yes",
    "depois de gravar": "after recording",
    "dessas ferramentas costumam permitir — é onde a decisão acontece, e é onde a letra miúda mora.": "of those tools usually allow — that is where the decision happens, and where the small print lives.",
    "disponível": "available",
    "disponível agora": "available now",
    "do computador": "your computer",
    "do seu computador": "leaving your computer",
    "e": "e",
    "e na": "and in the",
    "e o": "and the",
    "e-mail pronto": "e-mail ready to send",
    "em caso de estorno ou contestação.": "in the event of a chargeback or dispute.",
    "em desenvolvimento": "in development",
    "em geral só o vídeo": "generally only the video",
    "em pedaços, direto no disco": "in chunks, straight to disk",
    "entra no PDF e no texto da ata": "goes into the PDF and the text of the minutes",
    "entrar": "sign in",
    "escolha do computador": "pick one from your computer",
    "escolha no computador": "pick one from your computer",
    "ferramenta gratuita": "free tool",
    "gratuitos, sem cadastro e sem limite de duração": "free, with no sign-up and no limit on length",
    "gravação pronta": "recording ready",
    "grátis com teto de armazenamento; pago de R$ 26 a 180 por pessoa/mês": "free with a storage ceiling; paid from R$ 26 to 180 per person/month",
    "grátis; R$ 19,90/mês para o resumo por IA": "free; R$ 19.90/month for the AI summary",
    "guardar as telas compartilhadas": "keep the shared screens",
    "incluir meu microfone": "include my microphone",
    "informará todos os participantes de que a reunião está sendo gravada;": "you will inform every participant that the meeting is being recorded;",
    "interromperá a gravação caso qualquer participante manifeste oposição;": "you will stop the recording if any participant objects;",
    "isso separa você dos demais, mas não separa os participantes entre si — todos chegam como um grupo, que você pode renomear. Não pretendemos vender como mais do que é.": "this separates you from the rest, but it does not separate the participants from one another — they all arrive as one group, which you can rename. We do not intend to sell it as more than it is.",
    "joao@empresa.com.br, maria@empresa.com.br": "joao@empresa.com.br, maria@empresa.com.br",
    "jsDelivr": "jsDelivr",
    "já chegam separadas": "arrive already separated",
    "mandar o áudio para fora": "send the audio outside",
    "marque a opção de compartilhar o áudio": "tick the option to share the audio",
    "momento marcado durante a reunião": "moment flagged during the meeting",
    "momento marcado em 00:02": "moment flagged at 00:02",
    "na chamada": "in the call",
    "na maioria, sim": "in most, yes",
    "nada sair": "anything leaving",
    "nenhum áudio vai para a nuvem": "no audio goes to the cloud",
    "no grátis, em geral": "on the free plan, generally",
    "no servidor da empresa": "on the company's server",
    "no seu computador": "on your computer",
    "nome e Enter": "name, then Enter",
    "nunca": "never",
    "não": "no",
    "não deixar baixar": "do not let you download",
    "não existe": "does not exist",
    "não para gravar, transcrever e exportar": "not to record, transcribe and export",
    "não pede a sua reunião": "does not ask for your meeting",
    "não, só você × os outros": "no, only you × the others",
    "o Whisper traduz para inglês sem custo extra de tempo": "Whisper translates to English at no extra time cost",
    "o disco do seu computador": "your computer's disk",
    "o que os outros falam": "what the others say",
    "o que você fala": "what you say",
    "o que você quiser, é o seu disco": "as much as you want, it is your disk",
    "o serviço de contas e o servidor do resumo, descritos acima. Sem conta, nenhuma dessas conexões acontece.": "the accounts service and the summary server, described above. Without an account, none of those connections happens.",
    "o texto da ata, e só quando você clica. O áudio e o vídeo continuam no seu computador, sempre. O texto é usado para gerar o resumo e descartado — não fica guardado em servidor nenhum, nem no nosso.": "the text of the minutes, and only when you click. The audio and the video stay on your computer, always. The text is used to produce the summary and then discarded — it is not kept on any server, not even ours.",
    "o texto exato oferecido": "the exact text offered",
    "obterá o consentimento exigido pela legislação aplicável a você, aos demais participantes e ao local onde cada um se encontra;": "you will obtain the consent required by the law applicable to you, to the other participants and to the place where each of them is;",
    "opcional": "optional",
    "ou": "or",
    "para experimentar a IA do Salavox. Depois, o plano profissional tem 30 por mês por R$ 19,90.": "to try out the Salavox AI. After that, the professional plan has 30 a month for R$ 19.90.",
    "para os participantes. Conta como um resumo, não como quatro.": "to the participants. It counts as one summary, not four.",
    "para servidor nenhum.": "to any server.",
    "participantes (áudio da reunião)": "participants (meeting audio)",
    "pendências com responsável e prazo": "open items with owner and due date",
    "placa de vídeo": "graphics card",
    "plano pago": "paid plan",
    "planos grátis": "free plans",
    "política de privacidade": "privacy policy",
    "por equipe": "per team",
    "por profissional": "per seat",
    "poucas horas": "a few hours",
    "privacidade": "privacy",
    "pronta": "ready",
    "prova de que você avisou": "proof that you gave notice",
    "próxima reunião": "next meeting",
    "próximos passos": "next steps",
    "que avisaria os participantes e iniciou a gravação às": "that they would tell the participants, and started recording at",
    "que avisaria,": "that you would tell them,",
    "respeitará sigilo profissional, segredo de negócio e demais deveres de confidencialidade a que esteja sujeito.": "you will respect professional confidentiality, trade secrets and any other duties of confidentiality to which you are subject.",
    "restam": "left:",
    "resumo da reunião": "a meeting summary",
    "resumo de cortesia": "complimentary summary",
    "resumos de cortesia": "complimentary summaries",
    "retirado": "withdrawn",
    "saem do seu computador — nem quando você usa o resumo. Sobe a transcrição já pronta, que é o que o modelo precisa ler.": "leave your computer — not even when you use the summary. What goes up is the finished transcript, which is what the model needs to read.",
    "sai pronta": "comes out ready",
    "salavox.com/app": "salavox.com/app",
    "sem instalação": "no install",
    "sem limite prático": "no practical limit",
    "sem revisão humana": "without human review",
    "sempre, inclusive nas que não usam robô": "always, including in the ones without a bot",
    "sempre: PDF, .txt e .vtt": "always: PDF, .txt and .vtt",
    "seu@email.com": "you@email.com",
    "sim": "yes",
    "sim, com o instante de cada uma": "yes, with the timestamp of each one",
    "sim, no grátis": "yes, on the free plan",
    "sim, sempre": "yes, always",
    "site": "site",
    "sua conta": "your account",
    "sua vez": "your turn",
    "só o microfone — é o modo que funciona no celular": "microphone only — this is the mode that works on a phone",
    "telas": "screens",
    "ter": "having it",
    "termos": "terms",
    "termos de uso": "terms of use",
    "teto de 2 a 4 horas, conforme o plano": "a ceiling of 2 to 4 hours, depending on the plan",
    "teto de armazenamento por equipe": "a storage ceiling per team",
    "texto": "text",
    "texto da ata": "text of the minutes",
    "transcrever durante a reunião": "transcribe during the meeting",
    "transcrita": "transcribed",
    "tudo funciona assim mesmo": "everything works anyway",
    "vira": "becomes",
    "você (microfone)": "you (microphone)",
    "você é o controlador desses dados": "you are the controller of that data",
    "voltar ao site": "back to the site",
    "vox": "vox",
    "Áudio da chamada": "Call audio",
    "É a sua declaração": "It is your statement",
    "É a única forma de resumo por IA em que a gravação continua sendo só sua.": "It is the only form of AI summary in which the recording remains yours alone.",
    "Última atualização: 12 de agosto de 2026.": "Last updated: 12 August 2026. The English text is a courtesy translation; the Portuguese version is the one that governs.",
    "é enviado ao nosso servidor e deste ao provedor de modelo de linguagem que usamos. O texto é usado para produzir aquela resposta e descartado: não é gravado em banco de dados nosso, não vira histórico e não é usado para treinar modelo nenhum. O áudio e o vídeo continuam no seu computador, inclusive nessa hora.": "is sent to our server and from there to the language-model provider we use. The text is used to produce that answer and discarded: it is not written to any database of ours, does not become history and is not used to train any model. The audio and the video stay on your computer, even then.",
    "— como qualquer servidor web, registra tecnicamente os acessos à página.": "— like any web server, it technically logs page accesses.",
    "— de onde o modelo de transcrição é baixado, na primeira vez que você transcreve. Recebe o pedido do modelo, nunca o seu áudio.": "— where the transcription model is downloaded from, the first time you transcribe. It receives the request for the model, never your audio.",
    "— e leva tudo para o PDF e para o arquivo de texto.": "— and carries it all into the PDF and the text file.",
    "— está no que você entrega em troca. Nelas, o resumo sai de uma reunião que já mora no servidor delas, com áudio e vídeo. Aqui, o áudio nunca sai do seu computador: o que sobe é o": "— it is in what you hand over in exchange. In theirs, the summary comes from a meeting that already lives on their server, with audio and video. Here the audio never leaves your computer: what goes up is the",
    "— guardamos o seu e-mail, o plano, a data de validade e a contagem de resumos usados no mês. É o mínimo para saber quem você é e se a assinatura está em dia. Não há senha: a entrada é por link enviado ao seu e-mail, e a sessão fica no seu navegador.": "— we keep your e-mail, the plan, the expiry date and the count of summaries used this month. It is the minimum needed to know who you are and whether the subscription is current. There is no password: entry is by a link sent to your e-mail, and the session stays in your browser.",
    "— o arquivo fica lá dentro": "— the file stays inside",
    "— para assinar é preciso informar nome e CPF/CNPJ, que são enviados à": "— to subscribe you must give a name and a tax ID, which are sent to",
    "— poucas horas somando todo mundo, e depois é apagar reunião para gravar a próxima —, costumam": "— a few hours counting everybody, and after that you delete a meeting to record the next one —, they usually",
    "— quando você clica em gerar um resumo, o": "— when you click to generate a summary, the",
    "— rede de distribuição que entrega as bibliotecas usadas pela página. Recebe apenas o pedido do arquivo.": "— the distribution network that delivers the libraries used by the page. It receives only the request for the file.",
    "— se você usar essa função, o texto da ata e os endereços que você digitar passam pelo nosso servidor e pelo serviço de envio de e-mail que contratamos, para que a mensagem chegue. O conteúdo não é guardado por nós depois do envio.": "— if you use that function, the text of the minutes and the addresses you type pass through our server and through the e-mail service we contract, so that the message arrives. The content is not kept by us after sending.",
    "— sem cartão. Depois, o plano profissional tem 30 rápidos e 5 precisos por mês, mais o envio da ata por e-mail. Gravar, transcrever, varrer as telas e exportar continua": "— no card. After that, the professional plan has 30 fast and 5 precise per month, plus sending the minutes by e-mail. Recording, transcribing, sweeping the screens and exporting stay",
    "— tudo roda neste computador.": "— everything runs on this computer.",
    "— você escolhe na hora de pagar": "— you choose at the moment of payment",
    "“A note to everyone: I am recording this meeting to produce the minutes. The recording and the transcript stay on my computer and are not sent to any outside service. If you would rather not be recorded, please say so now.”": "“A note to everyone: I am recording this meeting to produce the minutes. The recording and the transcript stay on my computer and are not sent to any outside service. If you would rather not be recorded, please say so now.”",
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
    /* NÃO existe padrão para "Reunião de ...": ele casava com a frase
       "Reunião de contador com cliente, de advogado com parte" na página de
       venda e a devolvia como "Meeting of contador com cliente". O título
       padrão da ata já nasce no idioma certo, em app.js. */
    [/^restam <b>(\d+)<\/b>/, 'left: <b>$1</b>'],
    [/^(\d+) trechos?$/, '$1 passages'],
    [/^Transcrito na (.+)$/, 'Transcribed on the $1'],
    [/^Perguntar à ata: (.+)$/, 'Ask the minutes: $1'],
    [/^momento marcado em ([\d:]+)$/, 'moment flagged at $1'],
    [/^tela mostrada em ([\d:]+)$/, 'screen shown at $1'],
    [/^★ ([\d:]+)$/, '★ $1'],
    [/^— (\d+) trechos?\.$/, '— $1 passages.'],
    [/^([\d.,]+)× o tempo real$/, '$1× real time'],
    [/^(\d+) resumos? de cortesia$/, '$1 complimentary summaries']
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

  /* Tudo o que já saiu traduzido. Serve ao detector: sem isto ele acusaria
     como "falta traduzir" justamente o texto que acabou de ser traduzido —
     porque o inglês, claro, não é chave do dicionário. */
  const SAIDAS = new Set();

  function traduzirNo(no) {
    const bruto = no.data;
    const n = norma(bruto);
    if (!n) return;
    const en = DIC[n] != null ? DIC[n] : porPadrao(n);
    if (en == null || en === n) return;
    const antes = /^\s*/.exec(bruto)[0];
    const depois = /\s*$/.exec(bruto)[0];
    no.data = antes + en + depois;
    SAIDAS.add(norma(en));
  }

  const ATRIBUTOS = ['placeholder', 'title', 'aria-label', 'alt'];

  function traduzirAtributos(el) {
    if (el.closest && el.closest('[data-usuario]')) return;
    for (const a of ATRIBUTOS) {
      if (!el.hasAttribute || !el.hasAttribute(a)) continue;
      const alvo = norma(el.getAttribute(a));
      const en = DIC[alvo] != null ? DIC[alvo] : porPadrao(alvo);
      if (en != null) { el.setAttribute(a, en); SAIDAS.add(norma(en)); }
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

  /* ---------- o que o teste usa ----------

     A primeira versão procurava português por heurística: acento, ou uma
     palavra de uma lista. Ela dava zero com a página cheia de português na
     tela — "nada sair", "Recursos", "Abrir o Salavox" não têm acento nem
     caem na lista, e passaram batido até alguém olhar uma captura.

     A pergunta certa não é "isto parece português?", é **"isto passou pelo
     dicionário?"**. Agora sobra tudo o que está visível e não foi traduzido,
     acentuado ou não. Texto que é igual nos dois idiomas — "Salavox", "PDF",
     "Pix" — entra no dicionário apontando para si mesmo: custa uma linha e
     documenta a decisão, em vez de escondê-la numa lista de exceções. */
  const NEUTRO = /^[\d\s.,:;!?·—–\-•|%/()\[\]{}<>+×=$€£"'@#*_~^\\]*$/;

  function vazamentos() {
    const fora = [];
    const passou = t => !t || NEUTRO.test(t) || DIC[t] != null ||
                        porPadrao(t) != null || SAIDAS.has(t);
    const cam = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: no => podeMexer(no) && no.parentElement.offsetParent !== null
        ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT
    });
    for (let no = cam.nextNode(); no; no = cam.nextNode()) {
      const t = norma(no.data);
      if (!passou(t)) fora.push(t);
    }
    document.querySelectorAll('[placeholder],[title],[aria-label]').forEach(el => {
      if (el.closest('[data-usuario]')) return;
      for (const a of ATRIBUTOS) {
        const v = el.hasAttribute(a) ? norma(el.getAttribute(a)) : '';
        if (!passou(v)) fora.push(v);
      }
    });
    const t = norma(document.title);
    if (!passou(t)) fora.push('<title> ' + t);
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

  /* O título da aba e a descrição não estão no corpo da página, e a varredura
     não os alcançaria. Ficariam em português na aba do navegador, no resultado
     de busca e no cartão que aparece ao compartilhar o endereço — que é
     justamente onde quem não fala português encontra o produto. */
  function traduzirCabeca() {
    const t = DIC[norma(document.title)];
    if (t) { document.title = t; SAIDAS.add(norma(t)); }
    document.querySelectorAll('meta[name="description"],meta[property="og:description"],' +
                              'meta[property="og:title"]').forEach(m => {
      const en = DIC[norma(m.getAttribute('content') || '')];
      if (en) { m.setAttribute('content', en); SAIDAS.add(norma(en)); }
    });
  }

  /* As capturas da página inicial são da ferramenta de verdade, com uma
     reunião de verdade dentro — e por isso elas também têm idioma. Existem em
     `/img/` e em `/img/en/`, geradas pelo mesmo script. Se a versão em inglês
     faltar, o `onerror` devolve a original: página com imagem quebrada é pior
     do que página com imagem na língua errada. */
  function trocarImagens() {
    document.querySelectorAll('img[src^="/img/"]').forEach(im => {
      const antes = im.getAttribute('src');
      if (antes.indexOf('/img/en/') === 0) return;
      im.onerror = () => { im.onerror = null; im.setAttribute('src', antes); };
      im.setAttribute('src', antes.replace('/img/', '/img/en/'));
    });
  }

  function iniciar() {
    const id = idiomaAtual();
    document.documentElement.lang = id === 'en' ? 'en' : 'pt-BR';
    ligarSeletor();
    if (id === 'en') { traduzirCabeca(); trocarImagens(); varrer(document.body); observar(); }
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
