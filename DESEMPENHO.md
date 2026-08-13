# Velocidade da transcrição — o que dá para fazer, e o que cada coisa custa

Documento de referência, escrito em 12/08/2026. Trata de **uma pergunta só**: como fazer a ata ficar
pronta mais rápido, e o que cada caminho cobra em qualidade.

---

## Primeiro, onde o tempo está de verdade

Antes de discutir opções, medi o que é nosso. Uma janela de 30 segundos, no Chromium, com o áudio já
gravado:

| etapa | tempo |
|---|---|
| ler a janela do disco do navegador (1,9 MB) | 16,5 ms |
| medir a energia de voz (3.000 quadros, dois canais) | 4,8 ms |
| separar o canal em Float32 | 4,4 ms |
| decidir se tem voz | 0,8 ms |
| **total do nosso código** | **26,5 ms** |

Para **uma hora de reunião com os dois canais**, isso dá **3,2 segundos**. Todo o resto do tempo é o
modelo.

Essa medição decide o documento inteiro: **não há nada para otimizar na nossa parte.** Reescrever a
leitura, o fatiamento ou a medição não muda nada perceptível. Toda opção real mexe no modelo — em qual
modelo, em como ele roda, ou em quanto áudio ele precisa processar.

---

## As opções, da que mais rende para a que menos rende

### 1. Compactar a fala antes de mandar (a maior de todas, e é estrutural)

**O que é.** O Whisper processa **sempre 30 segundos**, com ou sem fala dentro. Uma janela com 4 segundos
de conversa e 26 de silêncio custa exatamente o mesmo que uma janela cheia. Hoje nós pulamos janelas com
menos de 200 ms de voz — o que resolve o silêncio total, e não resolve o silêncio *entre as falas*.

Numa reunião real, cada canal fala uma fração do tempo. Quem gravou fala talvez 30% dos minutos; os
participantes, 60%. Se a fala de um canal for **costurada**, removendo os vãos de silêncio e empacotando
o que sobrou em janelas densas de 30 s, o número de passagens pelo modelo cai quase na proporção da
densidade da fala. Um canal com 30% de fala passa de 120 janelas por hora para cerca de 40.

**Ganho estimado: 2× a 3× em reunião real.** Não depende de placa de vídeo, de rede nem de modelo.

**O que custa em qualidade, e é preciso ser honesto:**

- Cortar perto demais da fala **come o começo das palavras**. Só se corta em silêncios de pelo menos
  400 ms, deixando ~200 ms de folga dos dois lados.
- O modelo perde a pausa como pista de pontuação. Frases coladas podem virar uma frase só.
- Os instantes voltam na linha do tempo **compactada**, e precisam ser remapeados para a real. Errar esse
  mapa desloca a ata inteira — é o ponto onde este trabalho pode dar errado feio, e onde a verificação
  precisa ser mais dura.

**Esforço:** alto. É a mudança mais séria da lista.

---

### 2. Trocar o modelo por um com decodificador curto (`whisper-large-v3-turbo`)

**O que é.** Em áudio longo, o Whisper gasta a maior parte do tempo **decodificando**, não codificando. O
`large-v3-turbo` tem 4 camadas de decodificador no lugar de 32, mantendo o codificador grande. Resultado:
qualidade perto do `large-v3` com velocidade de decodificação comparável à de modelos pequenos. Existe em
ONNX para transformers.js, que é o que usamos.

**Ganho:** provavelmente o **melhor ponto de qualidade por segundo** disponível hoje — mas isso precisa
ser medido na máquina de quem usa, não deduzido.

**O que custa:**

- **Download muito maior.** O `small` que usamos hoje está na casa das centenas de megabytes; o turbo é
  bem maior. Na primeira vez isso é sentido, e em rede de escritório pode ser proibitivo. O espelho local
  (`ferramentas/baixar-modelo.mjs`) existe justamente para esse caso.
- **Memória de GPU.** Placa integrada modesta pode não segurar, e aí cai para o processador — onde o
  modelo grande é lento demais para valer.
- Qualidade em português: melhor que `small`, com folga. É o único item da lista que **melhora** a ata
  em vez de piorar.

**Esforço:** baixo — é acrescentar uma opção na lista de modelos. O risco é o cliente escolher e ter uma
experiência ruim sem entender por quê, então precisa vir com aviso de tamanho.

---

### 3. Descobrir e mostrar em qual motor está rodando

**O que é.** O aplicativo tenta WebGPU e cai para o processador quando não consegue. A diferença entre os
dois é de **5× a 20×** — é a maior variação de velocidade que existe aqui. Hoje essa queda acontece com
um aviso discreto, e quem está lento não sabe se é o modelo, a máquina ou a escolha.

**Ganho direto: zero.** Ganho real: para de se otimizar no escuro. Alguém que descobre estar no
processador pode trocar de navegador, ligar a aceleração por hardware ou escolher o modelo rápido — e
resolve sozinho um problema que hoje vira "o Salavox é lento".

**Esforço:** baixo. E deveria vir antes de qualquer outra coisa desta lista.

---

### 4. Ligar as linhas do WASM (só ajuda quem está sem WebGPU)

**O que é.** No caminho do processador, o runtime está preso em **uma linha** (`numThreads = 1`). Com
quatro, seria 2× a 4× mais rápido.

**Duas fechaduras, ambas fechadas hoje**, e é preciso abrir as duas:

1. `numThreads = 1` está escrito no código.
2. Threads exigem `SharedArrayBuffer`, que exige **isolamento de origem cruzada** — os cabeçalhos
   `Cross-Origin-Opener-Policy` e `Cross-Origin-Embedder-Policy`, que hoje não existem no `vercel.json`.

**O que custa:** ligar o isolamento pode **quebrar o download do modelo**, porque todo recurso de outro
domínio passa a precisar de cabeçalho próprio autorizando. O modelo e o runtime vêm de CDN. Ou se
confirma que a CDN manda os cabeçalhos certos, ou se espelha tudo no nosso domínio — e aí o isolamento
sai de graça, porque nada mais é de terceiro.

**Esforço:** médio, com risco de quebrar o que funciona. Só vale depois do item 3 dizer quantas pessoas
estão no caminho do processador.

---

### 5. Processar várias janelas de uma vez (batching)

**O que é.** Numa GPU, mandar 4 ou 8 janelas juntas pelo codificador aproveita muito melhor o hardware do
que mandar uma de cada vez. A biblioteca sabe fazer isso quando recebe áudio longo com
`chunk_length_s`/`batch_size`, em vez de janelas prontas como mandamos hoje.

**Ganho:** 1,5× a 2,5×, **só no WebGPU**. No processador não muda nada.

**O que custa:** entregaríamos blocos maiores (cinco minutos, ~19 MB em memória — ainda tranquilo) e
perderíamos o controle fino de pular janela por janela, que é o que hoje impede o modelo de inventar
texto sobre silêncio. **Só faz sentido depois do item 1**, que já entrega blocos densos de fala. Os dois
juntos se somam bem; o 5 sozinho briga com a peneira de silêncio.

**Esforço:** médio.

---

### 6. Quantização do codificador

**O que é.** Hoje: codificador em `fp32`, decodificador em `q4`, no WebGPU. Baixar o codificador para
`fp16` reduz pela metade o tráfego de memória da parte mais pesada.

**O que custa:** há relato conhecido de **problemas de precisão do codificador Whisper em fp16 no
WebGPU**. Ou seja: pode acelerar e piorar o texto de um jeito difícil de perceber — que é o pior tipo de
piora. `q8` é mais conservador.

**Esforço:** baixo de fazer, alto de confiar. Precisa de comparação lado a lado com áudio real antes de
virar padrão.

---

### 7. Um canal em vez de dois

**O que é.** Hoje cada janela com voz é transcrita duas vezes — uma por canal. Dá para transcrever a
mistura uma vez só e atribuir quem falou comparando a energia dos dois canais quadro a quadro.

**Ganho:** até 2× nas janelas em que os dois lados falam.

**O que custa:** a atribuição deixa de ser exata e passa a ser inferida. **É exatamente a vantagem que o
produto vende** — "as fontes já chegam separadas". Trocar isso por velocidade seria vender outra coisa.

**Recomendação: não fazer.** Fica registrado para não ser redescoberto como boa ideia.

---

### 8. Coisas que não rendem, e por que estão aqui

- **Beam search.** A biblioteca já decodifica de forma gulosa. Não há o que economizar.
- **`condition_on_previous_text`.** Melhora a coerência entre janelas e **amplifica laço de
  alucinação** — o defeito que custou uma ata com 88 repetições. Fica desligado, de propósito.
- **Otimizar a leitura do disco.** São 16 ms por janela. Nem se o disco fosse infinitamente rápido.
- **Pré-carregar o modelo ao abrir a página.** Não acelera a transcrição; acelera a *primeira* vez. Já
  acontece quando a transcrição ao vivo está ligada.

---

## O que temos hoje, para constar

| item | estado |
|---|---|
| janela | 30 s, sem sobreposição |
| modelos oferecidos | `whisper-base` (rápido), `whisper-small` (preciso, padrão) |
| motor | WebGPU, com queda para o processador |
| quantização | codificador `fp32`, decodificador `q4` (WebGPU); `q8` no processador |
| linhas do WASM | 1 |
| isolamento de origem cruzada | desligado |
| silêncio | janela sem 200 ms de voz não vai ao modelo; canal mudo não vai nunca |
| ao vivo | ligado por padrão, desde 12/08/2026 |

**Um defeito conhecido que a lista acima não resolve:** as janelas são cortadas em 30 s **sem
sobreposição**, então uma palavra que cai exatamente na emenda pode ser partida. Consertar isso custa
velocidade (sobreposição é trabalho repetido). Hoje a troca está feita a favor da velocidade, e sem que
ninguém tenha decidido — o que é o pior jeito de fazer uma troca.

---

## O que foi feito em 12/08/2026 — itens 1, 2 e 3

**Item 3 — medir.** O trabalhador informa em qual motor conseguiu rodar, e a transcrição conta quantas
vezes mais rápido que o tempo real foi. O número aparece junto da ata, e abaixo de 1× a tela diz que está
mais lento que a própria reunião e o que fazer. A queda para o processador deixou de ser silenciosa.

**Item 2 — turbo.** `whisper-large-v3-turbo` entrou na lista de modelos, com aviso de tamanho antes da
escolha (~700 MB contra ~200 MB do preciso) e a ressalva de que em máquina modesta ele pode cair para o
processador e ficar mais lento que o modelo menor — caso em que a linha de desempenho denuncia.

**Item 1 — compactar.** Feito e medido: num áudio de teste com 20 s de fala espalhados em 120 s, as
passagens pelo modelo caíram de **quatro para uma**. Os três cuidados previstos estão no código: corte só
em silêncio de 0,4 s ou mais, 0,2 s de folga em volta das palavras, e rampa de 10 ms em cada emenda. O
remapeamento dos instantes — a parte perigosa — tem verificação própria com valores calculados à mão fora
do código medido, e seis sabotagens tentando quebrá-lo.

Dois defeitos apareceram durante a construção e foram corrigidos: a folga em volta da fala podia invadir
janela já transcrita ao vivo (duplicando fala na ata), e pacote de fração de segundo era mandado ao
modelo — a mesma regra do "resto curto não entra" que já existia para janelas, e que não tinha sido
aplicada aos pacotes.

**Uma consequência que valeu a pena registrar:** a compactação reescreve a linha do tempo das falas de
propósito, então dois blocos de teste que mediam outra coisa (as janelas de 30 s e a intercalação das
telas) passaram a falhar. A saída não foi afrouxar o golden deles: foi desligar a compactação nesses dois
blocos e criar um bloco próprio para ela. Um teste, uma afirmação.

**E uma sobre o instrumento:** com dez blocos e a transcrição rodando durante a gravação, três Chromiums
em paralelo saturavam a máquina e as medições finas começaram a mentir. A suíte passou a rodar em **duas
faixas** — trinta segundos a mais por corrida, medições em que dá para acreditar.

## Ordem sugerida

1. **Medir** (item 3). Um botão que diz qual motor está ativo e quantos segundos leva uma janela de 30 s
   nesta máquina. Sem isso, tudo abaixo é palpite.
2. **Compactar a fala** (item 1). Maior ganho, independe de hardware, e é onde a verificação precisa ser
   mais dura por causa do remapeamento dos instantes.
3. **Oferecer o turbo** (item 2). É o único item que melhora a ata em vez de piorar.
4. **Batching** (item 5), depois do 1.
5. **Threads/isolamento** (item 4), se a medição mostrar gente no processador.

Nada disso está medido com o modelo real — só a nossa parte está. Os números de ganho acima são ordens de
grandeza conhecidas do Whisper, não medições deste projeto, e estão marcadas como estimativa em todos os
lugares onde aparecem.
