# Salavox — roadmap

Construído a partir da lista de funcionalidades do tl;dv (consultada em 11/08/2026), que é hoje o
concorrente mais completo do mercado. A pergunta em cada linha não é "eles têm?", é **"faz sentido para
quem não pode deixar o áudio sair do computador?"**.

Três respostas possíveis, e as três são decisões:

- **Fazer** — cabe na arquitetura local e serve ao nicho.
- **Trocar** — eles resolvem com nuvem; nós resolvemos de outro jeito, com outra promessa.
- **Não fazer** — exigiria servidor, conta ou robô na chamada. Fazer isso é virar concorrente deles e
  perder a única vantagem que temos.

---

## 0. O que o tl;dv nos ensina antes de qualquer funcionalidade

**O plano grátis deles é forte.** Gravações e transcrições ilimitadas, mais de 30 idiomas, armazenamento
ilimitado, aplicativo móvel, integração com Slack e calendário. Quem diz que "os concorrentes cobram caro"
está descrevendo o plano pago, não a porta de entrada. **Não dá para vender preço contra isso.**

Onde o grátis deles aperta, e onde está a nossa conversa:

| Limite do plano grátis do tl;dv | Salavox |
|---|---|
| Retenção de 3 meses — depois some | fica no seu disco pelo tempo que você quiser |
| 40 gravações por semana | sem limite; não há quem conte |
| 10 reuniões com notas por IA | você usa a IA que quiser, com o prompt pronto |
| 3 horas por gravação | sem limite prático desde a gravação em pedaços |
| **Download da gravação só a partir do plano pago** (tabela deles) | tudo baixa: gravação, PDF, `.txt`, `.vtt` |
| Áudio processado na nuvem deles | nunca sai do computador |
| Robô visível na chamada | não existe |

**O download é mais importante do que parece.** Numa ferramenta de nuvem, tudo o que você produziu mora
lá: se o plano vencer, se a retenção estourar ou se a empresa mudar de política, o material vai junto.
Aqui o resultado é um arquivo no seu computador desde o primeiro segundo. Vale colocar isso no material de
venda com essas palavras — "os arquivos são seus, e estão com você".

**Preço deles em real:** Pro R$ 116 e Business R$ 179 por licença/mês na cobrança anual. É esse número que
torna um plano de R$ 39 defensável — e é esse número, não o grátis, que devemos citar.

**A conclusão estratégica:** não competimos em quantidade de funcionalidade. Competimos em **onde o áudio
está**. Todo item abaixo que não reforça isso é candidato a ser cortado.

---

## 1. Agora — o que impede de usar em reunião de verdade

Nada aqui é funcionalidade nova. É o produto atual parar de quebrar.

| # | Item | Por quê | Situação |
|---|---|---|---|
| 1.1 | **Teste em reunião real de 30 min** | mede tempo e qualidade em português com várias vozes; tudo depende disso | **falta** — 1 reunião |
| 1.2 | **Gravação em pedaços** | a gravação inteira na memória da aba derrubava reunião longa | **feito** |
| 1.3 | **Medir e tratar o eco** | com alto-falante a sua voz volta no canal dos participantes e estraga a separação | **falta** — 1 dia medir |
| 1.4 | **Aviso ao fechar a aba** | perder uma reunião gravada por um Ctrl+W é falha grave | **feito** |
| 1.5 | **Recuperar gravação interrompida** | se a aba cair, o pedaço já gravado precisa sobreviver | **feito** |

**Como o 1.2 foi resolvido.** Dois problemas separados, que pareciam um só:

- *A gravação na memória.* Cada pedaço que o MediaRecorder entrega (a cada dez segundos) vira um arquivo
  fechado no armazenamento privado do navegador. No fim os arquivos são costurados num Blob que apenas os
  referencia — dá para baixar duas horas de reunião sem nunca carregá-las inteiras.
- *A decodificação no fim.* Era o gargalo maior e menos óbvio: transformar o arquivo inteiro em amostras de
  16 kHz para transcrever consumia mais de um giga por hora de reunião. Agora o áudio é gravado **em
  paralelo, já em PCM de 16 kHz** (64 KB/s, direto no disco) por um AudioWorklet, e a transcrição lê fatias
  de trinta segundos desse arquivo. Não existe mais nenhum instante em que a reunião esteja inteira na
  memória.

Medido em Chromium: setenta segundos de gravação com a memória do heap parada em 9,5 MB do início ao fim,
áudio de 60,03 s para 60 s de relógio (sem furos), e a gravação interrompida à força devolveu 24 dos 25
segundos gravados.

**Custo em disco, que é o novo limite:** cerca de 225 MB por hora de PCM, mais o vídeo comprimido. Uma
reunião de duas horas ocupa perto de 1 GB enquanto durar o trabalho. O aplicativo avisa quando há menos de
3 GB livres e apaga tudo ao começar a gravação seguinte.

---

## 2. Próximo — o que falta para ser um produto, não uma demonstração

Ordenado por (valor para o nicho) ÷ (trabalho). Tudo grátis, tudo local.

| # | Item | O que é | Equivalente no tl;dv | Trabalho |
|---|---|---|---|---|
| 2.1 | **Nomear os participantes** | trocar "PARTICIPANTES" pelos nomes reais e marcar trecho a trecho | rotulagem manual de oradores | 1 dia |
| 2.2 | **Vocabulário do escritório** | lista de siglas, nomes de clientes e termos técnicos passada ao modelo antes de transcrever | dicionário personalizado | 1 dia |
| 2.3 | **Marcar momento durante a gravação** | um botão e um atalho que carimbam "isto importa" enquanto a reunião acontece | destaque de momentos ao vivo | meio dia |
| 2.4 | **Transcrever arquivo existente** | arrastar um áudio ou vídeo já gravado e gerar a ata | uploads | meio dia |
| 2.5 | **Idioma da transcrição** | seleção manual e detecção automática | 30+ idiomas | meio dia |
| 2.6 | **Modelos de ata** | reunião com cliente, reunião interna, entrevista, atendimento — cada um com seções próprias | modelos de resumo | 2 dias |
| 2.7 | **Registro de consentimento** | quem avisou, a que horas, com que texto — anexado à ata e ao PDF | configurações de consentimento | 1 dia |
| 2.8 | **Escolha do modelo de transcrição** | rápido × preciso, com o custo de tempo dito na tela | qualidade premium | meio dia |

**2.7 merece uma nota.** Para contador, advogado e RH, o registro de que o aviso foi dado vale mais que
qualquer resumo por IA. É a funcionalidade que fala a língua do nosso cliente e que nenhum concorrente
destaca, porque para eles o robô na chamada já é o aviso.

---

## 3. Depois — o que transforma em ferramenta de trabalho

Aqui o produto deixa de ser "uma página que gera um PDF" e passa a ter memória.

| # | Item | O que é | Trabalho |
|---|---|---|---|
| 3.1 | **Histórico local das reuniões** | lista das atas anteriores guardada no navegador (IndexedDB), com data, título e duração | 3–4 dias |
| 3.2 | **Busca em todas as atas** | procurar uma palavra em tudo que já foi gravado | 1–2 dias, depende de 3.1 |
| 3.3 | **Recortar um trecho** | exportar 30 segundos de áudio ou vídeo com a transcrição correspondente | 2–3 dias |
| 3.4 | **Resumo por IA local (Ollama)** | detectar um Ollama rodando na máquina e gerar a ata resumida sem nada sair | 2–3 dias |
| 3.5 | **Resumo com a chave do usuário** | alternativa ao 3.4 para quem aceita mandar só o texto a um provedor que já usa | 1–2 dias |
| 3.6 | **Política de retenção local** | apagar automaticamente gravações com mais de X dias | 1 dia, depende de 3.1 |

**3.4 é o item mais importante desta seção.** É a única forma de ter "notas por IA" sem trair a promessa da
página inicial. Se o resumo sair de um modelo rodando na máquina do cliente, a frase "nada sai do seu
computador" continua verdadeira com IA incluída — e nenhum concorrente de nuvem pode dizer o mesmo.

**3.5 exige honestidade na interface.** Se o usuário escolher mandar o texto para um provedor, a tela
precisa dizer isso com todas as letras, antes, e ficar desligado por padrão.

---

## 4. Pesquisa — talvez não dê, e tudo bem

| Item | Situação |
|---|---|
| **Separar cada participante entre si** | é o maior buraco do produto. Exige diarização local (embeddings de voz + agrupamento). Há modelos em ONNX que rodam no navegador, mas custam memória e tempo, e a qualidade em áudio de chamada com compressão é duvidosa. **Prototipar e medir antes de prometer.** |
| **Áudio de sistema no macOS** | o navegador só entrega áudio de aba. Só se resolve com aplicativo de desktop e driver de áudio. Fica para o produto pago, se sair. |
| **Servidor MCP local das atas** | expor o histórico local para a IA do próprio usuário via MCP. Elegante e coerente com a arquitetura, mas só faz sentido depois do 3.1 e no aplicativo de desktop. |

---

## 5. Produto pago — o que não se copia com F12

Repetindo o que já está no modelo de negócio: a versão do navegador não tem como ser travada. O pago
precisa vender o que não é código.

| Item | Por que só cabe no pago |
|---|---|
| **Aplicativo de desktop** | grava sem aba aberta, pega áudio de sistema no macOS, guarda histórico em pasta de verdade, e a licença é verificável no binário |
| **Identidade do escritório na ata** | logotipo, cabeçalho, numeração — trabalho de configuração, entregue pronto |
| **Modelos de ata sob medida** | os do plano grátis são genéricos; o escritório quer o dele |
| **Documentação de conformidade** | mapa de tratamento de dados, modelo de aviso, política de retenção — o que a auditoria pede |
| **Suporte com prazo** | contrato, nota fiscal, alguém que atende |

---

## 6. Não faremos — e a resposta pronta para quando perguntarem

| Pedido | Resposta |
|---|---|
| Robô que entra na chamada | é exatamente o que não queremos. Nenhum participante precisa saber que existe uma ferramenta — só que a reunião está sendo gravada, e isso quem diz é você. |
| Integração com calendário, Slack, CRM, Zapier | exige servidor nosso com acesso à sua conta. O dia em que tivermos isso, a frase da página inicial vira mentira. |
| Aplicativo móvel | o navegador do celular não captura a tela nem o áudio de outra chamada. Não é escolha, é limitação real. |
| Compartilhar a ata por link | não temos onde hospedar. O PDF vai por e-mail, como qualquer documento do escritório. |
| Insights por e-mail programados | precisaria de servidor rodando na nossa casa com o conteúdo das suas reuniões. |
| Monitoramento de playbook de vendas | outro nicho, outro produto, outra empresa. |

Essa tabela não é uma lista de desculpas: é a definição do produto. Cada "não" aqui é o que sustenta o
"sim" da página inicial.

---

## 7. Ordem sugerida de execução

1. ~~1.2, 1.4 e 1.5 — gravação em pedaços, aviso ao fechar, recuperação.~~ **feitos**
2. **Agora** — 1.1 (teste real de trinta minutos) e 1.3 (eco). O teste redefine todo o resto, e agora ele
   é possível: antes a aba não aguentava trinta minutos.
3. **Depois** — 2.1, 2.3, 2.4, 2.5 (nomes, marcador de momento, importar arquivo, idioma). São quatro
   itens pequenos que juntos mudam a sensação do produto.
4. **Em seguida** — 2.2, 2.6, 2.7 (vocabulário, modelos de ata, registro de consentimento). É o pacote
   que fala com contador e advogado.
5. **Então** — 3.1, 3.2, 3.4 (histórico, busca, resumo local). Aqui vira ferramenta de trabalho.
6. **Só então** — conversar sobre o aplicativo de desktop com quem já estiver usando há dois meses.

Nada de 3.x antes de 1.x. Um histórico bonito de reuniões que se perdem na metade não vale nada.
