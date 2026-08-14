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

---

## 13/08/2026 — o download, que era o gargalo que ninguém tinha medido

A pergunta que abriu isto foi: *"o modelo preciso baixar mesmo? mesmo estando em CDN é lento."*

Sim, precisa. Não existe transcrição no navegador sem o modelo estar no navegador. As alternativas
seriam mandar o áudio para um servidor — que é o produto inteiro ao contrário — ou usar o
reconhecimento embutido do Chrome, que também manda o áudio para fora. **O download é o preço de o
áudio não sair do computador**, e ele se paga uma vez por navegador.

O que estava errado não era existir. Era o tamanho, e era a hora.

### O tamanho: a tela mentia por quase três vezes

A ferramenta tentava a placa de vídeo primeiro. Nesse caminho o codificador vem **sem compressão**
(fp32), porque as versões comprimidas do codificador produzem texto quebrado em parte das máquinas.
Conferindo arquivo por arquivo nos repositórios:

| modelo | processador (q8) | placa de vídeo (fp32 + q4) | o que a tela dizia |
|---|---|---|---|
| Rápido — `whisper-base` | **77 MB** | 206 MB | «~50 MB» |
| Preciso — `whisper-small` | **249 MB** | 586 MB | «~200 MB» |
| Turbo — `whisper-large-v3-turbo` | **1,1 GB** | 2,9 GB | «~700 MB» |

O caminho padrão do modelo Preciso baixava **586 MB** anunciando 200. O Turbo baixava **2,9 GB**
anunciando 700 — o codificador dele sozinho tem 2,55 GB em fp32.

### A decisão: processador por padrão

Além de baixar 2,4× menos no Preciso, o relato público da própria biblioteca é que, em Whisper, o
WASM no processador costuma terminar **antes** da WebGPU — há relatos de 2 a 4× a favor do
processador para um minuto de áudio. Não temos como medir qualidade aqui, então a placa continua
disponível: é uma caixa a marcar, e o número na tela muda junto com ela, antes de decidir.

O que era o castigo — «WebGPU indisponível, vai demorar mais» — passou a ser o caminho normal.

### A hora: durante a reunião, não depois dela

Com a transcrição ao vivo desligada, o download inteiro caía no clique de «Gerar a transcrição»: a
pessoa encerrava a reunião e ficava olhando uma barra parada. Agora ele começa **durante a
gravação**, com ou sem transcrição ao vivo — a reunião dura minutos, o download cabe dentro dela, e
quem baixa é outra linha de trabalho.

O gatilho continua sendo o áudio gravado, não o relógio: quinze segundos. Esse número não é estético.
A preparação começa com duas idas à rede, e quando elas aconteciam no primeiro segundo atrapalhavam o
navegador montando a captura — uma medição pegou isso deslocando a detecção da primeira tela.

### Duas correções que vieram junto

**A porcentagem estava multiplicada por cem.** A biblioteca informa progresso de 0 a 100 por arquivo,
e o código tratava como 0 a 1. A barra da etapa 1 podia chegar a marcar «4300%».

**O modelo guardado podia ser apagado.** Sem `navigator.storage.persist()`, o navegador trata o cache
como descartável e o limpa quando o disco aperta — e a reunião seguinte baixa tudo de novo. Uma
linha, e é a diferença entre «baixa uma vez» e «baixa de vez em quando».

### O que continua na fila

Espelhar o modelo no próprio domínio (`ferramentas/baixar-modelo.mjs`) já existe e resolve rede de
escritório que bloqueia CDN de terceiro — falta decidir o custo de banda na hospedagem. As linhas do
WASM (item 4) continuam dependendo dos cabeçalhos COOP/COEP na Vercel.

---

## 13/08/2026, mais tarde — as linhas do processador

O item 4 desta lista estava marcado como «só ajuda quem está sem WebGPU». Isso deixou de ser verdade
na mesma tarde em que o processador virou o caminho padrão: agora ele ajuda **todo mundo**, e passou
a ser o item mais caro do produto.

O ONNX Runtime rodava com `numThreads = 1`, escrito à mão no código. Num computador de oito núcleos,
sete ficavam parados enquanto alguém esperava a ata.

### Por que estava em 1

Mais de uma linha exige `SharedArrayBuffer`, e o navegador só entrega memória compartilhada para
páginas **isoladas entre origens**. Isolamento se pede por dois cabeçalhos de resposta, que a
hospedagem manda — não é código que roda no navegador, é configuração de quem serve.

### `credentialless`, e não `require-corp`

Há duas formas de pedir isolamento. Com `require-corp`, **toda** imagem, script ou arquivo vindo de
fora precisa mandar um cabeçalho próprio autorizando o embutimento — e o modelo vem de uma CDN que
não manda. Seria trocar velocidade por produto quebrado.

Com `credentialless`, o navegador busca o que é de fora sem credenciais e libera o isolamento assim
mesmo. É o que está no `vercel.json`. Onde `credentialless` não existir — hoje, no Safari — o
cabeçalho é ignorado, a página não fica isolada e volta a ser uma linha. **Não há como quebrar, só
como não melhorar.**

### O teto de quatro linhas

Não é timidez: o ganho achata depois disso, e a transcrição divide a máquina com uma reunião
acontecendo. Tomar todos os núcleos faria a chamada engasgar, que é o oposto do objetivo. A conta é
`min(4, núcleos − 1)`, e ela tem valores golden no teste — inclusive o caso «isolado, mas máquina de
dois núcleos», que continua em 1.

### O que foi verificado, e o que não foi

Verificado nesta máquina: a página fica isolada de verdade com os cabeçalhos que vão ao ar,
`SharedArrayBuffer` existe, e a suíte inteira continua passando com o isolamento ligado — inclusive a
conta falando com o Supabase simulado, a janela flutuante e o modelo vindo da CDN simulada. Era esse
o risco: isolamento quebra carregamento de terceiro, e não quebrou nada.

**Não verificado:** o ganho de tempo real com o modelo de verdade. Esta máquina tem dois núcleos, e
`min(4, 2−1)` dá 1 — a única máquina onde a mudança não faz efeito nenhum. O número que vale medir é
o «× o tempo real» que aparece no fim da transcrição, agora acompanhado de quantas linhas foram
usadas. Se a hospedagem deixar de mandar os cabeçalhos, esse texto passa a não dizer «em N linhas»,
e é assim que dá para perceber sem abrir o inspetor.

### E a transcrição durante a reunião

Ela já existe e já vem ligada — é a caixa «transcrever durante a reunião» do passo 1. A cada trinta
segundos gravados, aquele trecho vira texto enquanto a conversa continua, e ao encerrar o passo 2
aproveita o que já ficou pronto, dizendo quantos trechos foram adiantados.

O que faltava não era começar antes: era o modelo conseguir acompanhar. Numa linha só, cada janela de
trinta segundos podia demorar mais de trinta segundos, e a transcrição ao vivo ficava para trás sem
nunca alcançar. É esta mudança que fecha aquela conta.

---

## 13/08/2026, fim do dia — o modelo que não abre

Uma reunião de verdade devolveu isto, duas vezes: durante a gravação e de novo no passo 2.

```
Can't create a session. ERROR_CODE: 1, ERROR_MESSAGE: qdq_actions.cc:137
TransposeDQWeightsForMatMulNBits Missing required scale:
model.decoder.embed_tokens.weight_merged_0_scale for node:
model.decoder.embed_tokens.weight_transposed_DequantizeLinear
```

`MatMulNBits` é o operador de **4 bits**. O único caminho que pede um arquivo de 4 bits é o da placa de
vídeo — o decodificador `decoder_model_merged_q4`. **Não era falta de WebGPU:** era o arquivo de 4 bits
que aquela máquina não consegue abrir, e a exceção acontecia *depois* de a placa ter sido escolhida.

O defeito estrutural não era o erro do ONNX. Era não haver degrau nenhum embaixo dele. A escolha do
motor era uma tentativa só: falhou, acabou. A transcrição ao vivo morreu e o passo 2 morreu igual,
meia hora depois, quando a reunião já tinha acabado — a pessoa ficou com uma linha de C++ e nenhuma
ata.

### O que mudou

A escolha do motor virou uma **fila de tentativas**. Cada uma que falha é anunciada na tela e a
próxima entra. O processador com pesos de 8 bits é o degrau que segura quase tudo: ele não usa o
operador de 4 bits, que é onde este defeito mora.

A mensagem de erro também mudou de tom. A linha do ONNX continua lá — é o que permite pesquisar ou
me mandar —, mas agora vem acompanhada da frase que resolve («desmarque *usar a placa de vídeo* no
passo 2») e do carimbo de versão, que diz qual código estava rodando.

### Como isto é verificado

O simulacro do modelo ganhou um irmão que **falha no mesmo lugar e com a mesma frase**: recusa quando
as opções pedem WebGPU ou um `dtype` por arquivo. O teste marca a placa, importa um áudio e exige que
a ata saia assim mesmo, transcrita no processador. Uma sabotagem remove o degrau do processador da
fila e a corrida fica vermelha — sem ela, o degrau poderia ser apagado sem ninguém notar.

A reunião inteira também foi reproduzida com `ferramentas/medir-paralelo.mjs`: com a placa marcada e o
modelo recusando, a transcrição ao vivo começa aos 18 s **no processador** e faz quatro chamadas
durante a gravação, em vez de morrer no primeiro segundo.

### O mesmo erro, uma camada abaixo

O relato seguinte veio com o carimbo `2026-08-13.4d01d9f` — **o build que já tinha a fila de
tentativas** — e mesmo assim a transcrição ao vivo parou, com a mesma linha de C++.

A fila cobria só o **carregamento** do modelo. E o defeito não estava lá: montar o modelo dava certo,
e a sessão do ONNX quebrava na **primeira transcrição** — que é quando o arquivo de 4 bits é aberto de
verdade. A escolha da placa parecia ter funcionado, e a queda vinha depois, num lugar onde não havia
rede nenhuma.

Agora a rede existe nos dois lugares. Se um pedido de transcrição falha com cara de sessão que não
abre, e estamos na placa, o modelo é remontado no processador e **aquele mesmo pedido é refeito** —
uma vez só, para que erro de verdade continue sendo erro. A caixa da placa também se desliga por este
caminho.

A lição vale mais que o conserto: **eu tinha inferido onde o erro acontecia em vez de tratar onde ele
aparece.** O simulacro que escrevi na primeira vez falhava no carregamento, então ele concordava com a
minha hipótese e o teste ficava verde sobre um produto que quebrava na reunião. O novo simulacro
(`modeloQueQuebraAoTranscrever`) abre normalmente e quebra na primeira chamada — que foi o que
aconteceu de verdade.
