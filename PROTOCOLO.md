# Como conduzimos os apps de navegador — protocolo

> Vale para o Salavox, o ClipContext e qualquer ferramenta que rode inteira no navegador de quem usa.
> Adaptado do protocolo dos apps de servidor (Quotaria, Enquadria, BPOx, Contatia, Suportaria,
> Zelo & Memória). **O que muda não é o rigor, é o que pode dar errado.**

---

## 0. Por que este documento é diferente do outro

O protocolo do ecossistema foi escrito para Next.js + Supabase + Vercel. Metade dele trata de coisas que
aqui não existem: migração de banco, `apply_migration`, `tsc --noEmit`, ambiente de produção com dado de
cliente. Aplicar aquele texto literalmente aqui dá a sensação de rigor sem o rigor.

Estes produtos têm outra planta baixa:

| No app de servidor | Aqui |
|---|---|
| O risco mora no banco | Não há banco: o risco mora **no navegador de quem usa** |
| Deploy contínuo pelo GitHub | **Um único arquivo HTML** que alguém publica à mão |
| Erro derruba o serviço para todos | Erro fica calado: a página abre, e o resultado é que está errado |
| Migration errada perde dado de cliente | Gravação perdida é a **reunião de um cliente, sem segunda chance** |
| Segredo é a chave de API | Segredo é **o áudio da reunião** — e a promessa é que ele não sai dali |

Tudo o que segue nasce dessa tabela.

---

## 1. A regra de arquitetura, que vem antes de qualquer funcionalidade

**Nada entra que precise de servidor.** Toda proposta responde primeiro a uma pergunta: isso mantém a frase
"nada sai do seu computador" verdadeira? Se a resposta for "quase", a resposta é não.

Corolários que já custaram discussão:

- Integração com agenda, CRM, Slack, envio de e-mail: **não**. Todas exigem uma conta nossa com acesso à
  conta do cliente.
- Resumo por IA: só com modelo rodando na máquina de quem usa, ou com chave do próprio usuário, desligado
  por padrão e dito com todas as letras na tela antes de qualquer texto sair.
- Toda chamada externa nova — uma CDN a mais que seja — **entra na política de privacidade na mesma
  alteração**, nunca depois.
- Nenhuma funcionalidade paga pode depender de trava no código do navegador. Não existe trava no navegador;
  existe F12. O que se vende é o que não é código.

---

## 2. O ciclo de uma alteração

1. **Uma coisa por vez, com `python3 build.py` entre cada.**
2. **Restaurar do zip mais recente antes de editar.** O ambiente onde eu trabalho é descartado; o zip que
   está com você é a fonte da verdade. Editar por cima de estado presumido é como se perde trabalho.
3. **Ver antes de editar.** Sempre.
4. **`public/` é gerado. Nunca editar `public/app.html`** — o build reescreve por cima e o trabalho some
   sem aviso.
5. **O comentário no código explica o defeito que originou a decisão**, não o que a linha faz. Exemplos que
   estão no código hoje: por que a assinatura de cena é RGB e não tons de cinza; por que o resto de janela
   curto não vai ao modelo; por que o áudio cru é zerado no instante em que o gravador começa.
6. Non-blocker fica declarado como non-blocker — não entra de carona.

### A armadilha de compilar e testar coisas diferentes

Um dia inteiro foi perdido depurando um defeito que não existia: o teste rodava contra uma cópia antiga do
aplicativo, num diretório de teste que não havia sido atualizado. O diagnóstico saiu confiante e errado.

Regra que ficou: **quem testa constrói.** `testes/rodar-tudo.mjs` chama o build, sobe um servidor apontado
para `public/` do próprio projeto e só então abre o navegador. Não existe caminho para testar o que não
acabou de ser construído.

---

## 3. Verificação — a parte que não se negocia

Nada é anunciado como pronto sem ter rodado:

```
python3 build.py                  # embutido no runner, mas vale rodar sozinho quando se mexe no HTML
node testes/rodar-tudo.mjs        # telas, gravação em pedaços, recuperação
node testes/sabotagem.mjs         # quebra o app de propósito e exige que os testes falhem
```

Sai com código diferente de zero quando falha. É isso que permite dizer "passou" sem ter olhado a tela.

**Três regras que valem mais que a lista:**

- **Todo teste novo é sabotado de propósito antes de ser aceito.** Auditor que só sabe dizer "ok" não é
  trava. `testes/sabotagem.mjs` planta cinco defeitos e exige que a verificação correspondente falhe — e já
  reprovou dois testes meus, um deles que "pegava" o defeito pelo motivo errado.
- **Valor esperado é golden, escrito no arquivo.** `['00:00','00:04','00:08','00:12']` está lá em letra de
  forma. Recalcular o esperado com a mesma função que se testa faz o teste passar sempre, inclusive depois
  de alguém quebrar a função.
- **Só entra como "passou" o que foi verificado por inteiro.** O modelo de transcrição real vem de uma CDN
  bloqueada aqui: o que os testes cobrem é o fatiamento, os canais e a linha do tempo, **não a qualidade do
  reconhecimento**. Isso está escrito no README e continua escrito enquanto não for medido.

### O que só a sabotagem encontra

O par de cenários mais útil não é "quebrei, falhou". É o **controle**: com um atraso de 1,5 s entre ligar o
áudio e começar a gravar, o teste tem de **passar**; com o mesmo atraso e sem a marcação de início, tem de
**falhar**. Foi assim que se provou que o alinhamento entre áudio e vídeo estava mesmo protegido, e não
apenas passando por sorte de cronometragem.

Foi também a sabotagem que encontrou um defeito de verdade no produto: a última janela de transcrição podia
ser um resto de 0,05 s, e o modelo devolvia texto datado em 01:09 numa reunião de um minuto. Resto curto
agora não entra, e o instante vem preso ao tamanho da janela.

### Teste que pisca é teste quebrado

O controle acima reprovou duas vezes antes de ficar de pé, e por um motivo que vale registrar: **eu estava
medindo a coisa certa pelo instrumento errado.** O alinhamento entre áudio e vídeo era conferido comparando
a duração do áudio com o cronômetro do navegador — e entre mandar parar e o evento de parada chegar passam
dezenas ou centenas de milissegundos, que variam com a carga da máquina. A margem apertada acusava defeito
onde não havia; a margem larga deixaria passar defeito de verdade.

A saída foi medir **pelo conteúdo**: a tela sintética troca de slide e abaixa o volume no mesmo instante. A
troca de slide é datada pelo vídeo, a queda de volume é datada pelo áudio cru, e o teste compara os dois
números. Se as linhas do tempo estiverem alinhadas, eles são iguais — não importa quanto o gravador demorou
para começar. **Quando um teste pisca, o defeito quase sempre está no instrumento, não no limite de
tolerância.** Afrouxar a margem é o remédio errado e o mais tentador.

Três corridas seguidas verdes valem mais que uma. Um teste que passa numa e falha na outra é um teste que
não se pode usar para dizer "passou".

---

## 4. Publicação — o elo mais fraco da corrente

**Eu não publico. Você publica.** O que eu entrego é um zip.

Daí vem o defeito mais caro deste ecossistema, e ele já aconteceu: **o ClipContext ficou no ar com uma
versão antiga do aplicativo enquanto o repositório já tinha a nova, e não havia como perceber olhando a
página.** Conteúdo errado que abre é pior do que link quebrado — o link quebrado alguém reporta.

O que ficou no lugar:

- O build carimba **a versão no rodapé da ferramenta** e escreve `public/versao.txt`.
- Conferir o que está publicado é um comando: `curl https://salavox.com/versao.txt`.
- Se o carimbo não bate com o do zip, **o que está no ar é outro produto** — e nenhuma conversa sobre
  defeito faz sentido antes de resolver isso.
- Todo material citado num texto público tem de existir no deploy. Nenhum nome de arquivo repetido em
  `public/`.

---

## 5. Entrega

- Zip da pasta do produto, sem `node_modules`, sem `.git`, sem `.vercel`.
- **`rm -f` no zip antes de `zip -qr`** — o `zip` apenda em arquivo existente. Isso já custou deploy quebrado.
- Entregar por `SendUserFile`. **Arquivo escrito e não apresentado não existe.**
- O zip leva `interno/`; o repositório não. É o que separa o que é público do que é estratégia.

---

## 6. Diagnóstico

- Todo achado cita **arquivo e linha**.
- Separar **CONFIRMADO** (li o código, o defeito está lá) de **SUSPEITA** (precisa de máquina real,
  navegador real, modelo real). Não misturar.
- **Antes de afirmar que algo está quebrado, procurar o caminho que o faria funcionar.** Metade das
  auditorias erra aqui — e uma das minhas errou feio: culpei o `file://` por uma falha de rede que era
  causada por um caminho de `.wasm` errado no meu próprio código. A explicação bonita chegou antes da
  verdadeira.
- Proposta de mudança sem **o que ela quebra** e **quanto custa** é opinião, não proposta.
- Dado que não está aqui e não está no código: **perguntar, nunca inventar.** Preço de concorrente, número
  de mercado, prazo — se veio de um documento, o documento e a data entram junto no texto.

---

## 6b. Imagem tem proporção, não sobra

Toda captura sai da tela com a altura que calhou de ter o elemento. Jogadas direto na página, viram um
mosaico de retângulos diferentes — e é exatamente isso que dá o aspecto desleixado, mesmo quando cada
imagem, sozinha, está boa.

O que ficou valendo:

- **Cada imagem é recortada para a proporção da moldura em que entra** (4∶5, 2∶1, 4∶3), nunca esticada. O
  recorte é feito no gerador, não pelo CSS, para que o corte seja escolhido e não sorteado.
- **A captura é enquadrada na origem.** Janela estreita quando o conteúdo é estreito: numa janela larga a
  ata fica com meia tela vazia à direita. Parágrafos longos de explicação ficam fora do quadro — a moldura
  não pode terminar no meio de uma frase.
- **Desenho vetorial é feito para a largura em que vai ser visto.** O diagrama deitado, de 860 por 300,
  virou letra de formiga numa coluna de 480 px; refeito em pé, com o mesmo conteúdo, ficou legível.
- **Sobra branca dentro da imagem é erro de enquadramento**, não detalhe. As telas de exemplo foram
  encurtadas até o conteúdo encostar nas bordas.

---

## 7. Compatibilidade de navegador é requisito, não detalhe

O produto inteiro é feito de APIs recentes: `getDisplayMedia`, OPFS, AudioWorklet, WebGPU, `MediaRecorder`.
Cada uma delas some em algum navegador de algum cliente.

- **Toda API nova entra com alternativa ou com mensagem clara.** Hoje: OPFS cai para memória e avisa;
  AudioWorklet cai para `ScriptProcessor`; WebGPU cai para processador; sem `getDisplayMedia`, a página diz
  que não dá e por quê.
- Limite conhecido fica escrito na interface e no material de venda, não só no README. O macOS não captura
  áudio de sistema — está dito na página inicial, e continua dito.
- Nada de mensagem genérica de erro. Quem está com uma reunião gravada e um erro na tela precisa saber se
  perdeu o material ou não.

---

## 8. Compliance perene (embutido em silêncio, nunca como aviso separado)

- **Nenhuma marca concorrente por escrito em material público** — nem bem, nem mal. Comparação na página
  inicial é com "as ferramentas de nuvem", genérica. Nome de concorrente, preço de concorrente e análise
  de mercado ficam em `interno/`, fora do repositório.
- **Nunca "blindagem"** nem a raiz "blind" — proteção, organização, governança.
- Toda cifra é **estimativa de cenário**, com a fonte e a data ao lado.
- **Fronteira contador × advogado:** a ata registra e organiza; não constitui ato, não redige instrumento,
  não substitui documento assinado nem laudo. Está nos termos e continua lá.
- O produto grava conversa: **o consentimento é obrigação de quem grava**, dito na interface, nos termos e
  na política. Os documentos passam por advogado antes do primeiro cliente pagante.
- Sem divisão de honorário. Sem nome de ferramenta concorrente.

---

## 9. Tom

Curto, PT-BR, **análise honesta acima de reassurance**. Se a ideia é ruim, dizer antes de executar. Se
estiver se buscando resultado rápido sobre fundação torta, reorientar. Elogio de trabalho que não foi
verificado é ruído — e é a forma mais educada de perder um dia.
