# Salavox

Grava a reunião, transcreve e entrega a ata. **Nenhum robô entra na chamada e nada sai do seu computador.**

## O que já funciona

- Grava a tela ou a janela da reunião com o áudio, usando só recursos nativos do navegador.
- Capta o microfone em paralelo e grava as duas fontes em **canais separados do estéreo**.
- **Grava em pedaços, direto no disco**: cada dez segundos de vídeo e cada quatro segundos de áudio viram
  um arquivo fechado no armazenamento privado do navegador. A memória da aba fica plana, não há limite
  prático de duração, e uma aba que morre no meio da reunião deixa tudo o que já havia sido gravado —
  ao reabrir a página, o Salavox oferece recuperar.
- Transcreve cada canal isoladamente com o Whisper rodando local, e monta a ata em ordem cronológica
  já marcando **VOCÊ** e **PARTICIPANTES**.
- **Transcreve durante a reunião**: a cada trinta segundos gravados, aquele trecho já vira texto enquanto
  a conversa continua. Numa reunião de uma hora, ao encerrar quase tudo está pronto. O modelo roda numa
  **linha separada do navegador**, para não travar quem escreve os pedaços no disco — e no fim o áudio é
  medido por inteiro e o que foi adiantado é reconciliado: janela cujo canal se revelou mudo é descartada,
  janela pulada que passa a ter voz é transcrita então. O adiantamento é otimização; quem manda no
  resultado é a medição completa.
- **Não transcreve silêncio, e diz que não transcreveu.** Antes de chamar o modelo, o áudio cru é medido
  em quadros de 20 ms: um canal que nunca chega a nível de voz é declarado mudo e não é enviado; uma janela
  sem pelo menos 200 ms de fala é pulada. Isso economiza tempo em reunião real e, principalmente, impede
  que o Whisper invente — diante de silêncio ele não devolve silêncio, devolve texto em laço.
- **Descarta o laço de alucinação**: três repetições seguidas da mesma frase no mesmo canal saem da ata, e
  o número descartado aparece na tela.
- **Fecha o microfone durante a gravação**, por botão. Silenciar-se no Meet ou no Teams não fecha o
  microfone que o navegador entregou à página — isso precisa estar dito e precisa ter um jeito de fazer.
- **Varre a gravação atrás das telas compartilhadas**, detectando mudança de cena por assinatura RGB, e
  intercala cada tela na ata no instante em que apareceu. Clicar na miniatura tira ou põe a tela na ata.
- **Marca momentos durante a reunião** pelo botão ou pela tecla M, e eles entram na ata, no PDF e no texto.
- **Nomeia quem falou**: os rótulos padrão viram nomes de verdade, e clicar no nome de uma fala troca a
  atribuição — útil quando há duas ou três pessoas do outro lado.
- **Usa uma gravação que já existe**: arraste um arquivo de áudio ou vídeo e ele vira ata do mesmo jeito.
- Transcreve em português, inglês ou espanhol, **detecta o idioma** sozinho, e sabe entregar a
  **ata em inglês** sem custo de tempo — o Whisper traduz com um parâmetro.
- **Vocabulário do escritório**: siglas, nomes de clientes e termos que a transcrição sempre erra são
  corrigidos no texto que sai, comparando cada palavra com a lista por distância de edição.
- **Corrige o texto na própria ata**: clicar numa fala e escrever por cima; a correção vai para o PDF, o
  texto e a legenda.
- **Registra o consentimento com carimbo de hora**: quando a confirmação foi marcada, quando o aviso foi
  copiado e quando a gravação começou, com o texto exato oferecido — na ata, no PDF e no `.txt`.
- Exporta a ata em **PDF com as telas embutidas**, em `.txt` e em `.vtt`, e permite baixar a gravação bruta.
- **Resumo, decisões e pendências por IA — a IA do Salavox, no plano pago.** Quatro botões: resumo
  executivo, decisões e pendências, e-mail de acompanhamento e pergunta livre à ata. O que sobe é o
  **texto** da ata, no clique, com a chave do modelo vivendo só no servidor; o áudio e o vídeo não saem.
  Sem `config.json` o cartão nem aparece — a instalação local continua inteira e sem cadastro.
- **Conta por link no e-mail, sem senha** (Supabase Auth por REST, sem biblioteca), com plano, validade e
  cota de resumos do mês. A sessão fica no `localStorage`; o texto da reunião, nunca.
- **3 resumos de cortesia por conta**, sem cartão: criar a conta já dá para experimentar a IA. A conta é da
  vida inteira da conta, não do mês — degustação, não plano grátis disfarçado. O modelo preciso fica fora.
- **Salva a gravação em fluxo**, pedaço por pedaço direto do disco do navegador para o arquivo escolhido.
  O caminho antigo montava tudo num Blob e passava por `createObjectURL` — duas cópias de centenas de
  megabytes antes de a barra aparecer, e era isso que demorava. Onde a API de salvar não existe, o caminho
  antigo continua valendo, e a tela diz que vai demorar.
- **Painel de negócio em `/painel`**, para quem estiver em `ADMIN_EMAILS`: contas, assinantes, receita,
  custo de IA contado por token, margem, conversão da degustação, e o atendimento de conta — achar pelo
  e-mail, liberar ou estender plano, zerar cota.
- **Dois modos de gravação**: reunião on-line (tela + áudio da chamada + microfone) e reunião presencial
  (só o microfone) — este último é o que funciona no celular, onde navegador nenhum compartilha tela.
- **Pede o microfone antes de abrir o seletor de tela.** Ao contrário, o navegador troca para o seletor e o
  pedido de microfone fica para depois; em algumas máquinas ele nunca aparece e a gravação sai muda.
- **Serve o modelo do próprio domínio quando ele foi espelhado** (`ferramentas/baixar-modelo.mjs`), e cai
  na CDN pública quando não foi. Rede de escritório costuma bloquear CDN de terceiro justamente no primeiro
  uso.
- Avisa antes de fechar a aba enquanto grava ou transcreve.
- Exige confirmação expressa de que os participantes foram avisados antes de deixar gravar.

## A ideia que separa dos concorrentes

As ferramentas de ata que existem hoje identificam quem falou com separação de locutor na nuvem — caro,
e por isso fica nos planos pagos. Aqui o problema se resolve por outro caminho: **as fontes já chegam separadas.**
O microfone é você, o áudio da chamada são os outros. Gravando um em cada canal do estéreo, a atribuição
sai de graça.

**Não é separação de locutor de verdade:** todos os participantes remotos ficam num grupo só. Isso
precisa estar dito na interface e no material de venda — resolve o caso mais útil ("o que eu me
comprometi a fazer"), não o de identificar cada pessoa.

## Estrutura

```
src/app.html         interface
src/app.js           toda a lógica
public/app.html      gerado pelo build — não edite, o build reescreve por cima
public/versao.txt    carimbo do que foi publicado
build.py             junta os dois e carimba a versão
testes/              verificações que falham de verdade
interno/             estratégia e concorrência — fora do repositório
PROTOCOLO.md         como se trabalha neste projeto
```

```bash
python3 build.py                     # gera public/app.html e public/versao.txt
node testes/rodar-tudo.mjs           # os nove blocos em paralelo — 70 s
node testes/rodar-tudo.mjs silencio  # só um bloco
node testes/sabotagem.mjs            # 38 defeitos plantados, exige que os testes peguem
node testes/sabotagem.mjs silencio   # só as sabotagens de uma área
node ferramentas/gerar-imagens.mjs   # refaz as imagens da página inicial a partir do app
node ferramentas/ver-home.mjs        # confere a página inicial
node ferramentas/ver-app.mjs         # confere a ferramenta, com uma reunião de exemplo processada
node ferramentas/ver-painel.mjs      # confere o painel de negócio, com dados de exemplo
node ferramentas/baixar-modelo.mjs onnx-community/whisper-base   # espelha o modelo em public/modelos/
```

As imagens da página inicial são **capturas do aplicativo de verdade**, geradas por
`ferramentas/gerar-imagens.mjs` a partir de uma reunião de exemplo. Se a interface mudar, basta rodar de
novo — não há maquete para manter sincronizada com nada. Cada captura é recortada para a proporção exata
da moldura em que entra (4∶5 no alto, 2∶1 nas telas largas, 4∶3 no PDF), nunca esticada.

A ferramenta usa o **mesmo sistema visual da página pública** — mesma paleta, mesmos raios de canto, mesma
sombra, mesma barra no topo. Antes eram dois produtos com a mesma marca, e quem clicava em "abrir" trocava
de casa. Sem tema escuro, como no site.

A página pública não faz **nenhuma** chamada a servidor de terceiro: sem fonte hospedada fora, sem
rastreador, sem estatística. Foi por isso que a tipografia da referência (Plus Jakarta, do Google) virou
pilha de fontes do sistema — um produto que promete "nada sai do seu computador" não abre a página
conversando com o Google.

A versão aparece no rodapé da ferramenta e em `/versao.txt`. Para saber o que está publicado:
`curl https://salavox.com/versao.txt` — se não bater com o zip, o que está no ar é outro produto.

## O que foi verificado

`node testes/rodar-tudo.mjs` roda tudo isto e sai com erro se algo falhar; `node testes/sabotagem.mjs`
planta 38 defeitos no código, um de cada vez, e exige que a verificação correspondente pegue cada um —
inclusive um cenário de controle, que precisa **passar**.

Com captura sintética no Chromium: a gravação sai com **dois canais** de energias distintas (0,14 e 0,21
no teste), a separação por canal chega à transcrição, a ata sai ordenada com os dois rótulos, e as saídas
`.txt` e `.vtt` saem corretos. A transcrição foi exercitada com um modelo simulado — o modelo
real ainda não foi testado neste projeto.

A varredura de telas foi verificada com uma tela sintética que troca de slide a cada 4 segundos: as 4
trocas foram detectadas nos instantes certos (00:00, 00:04, 00:08, 00:12), a ata saiu intercalada na ordem
`TELA fala fala TELA TELA fala fala TELA`, descartar uma miniatura a removeu da ata e do PDF, e o PDF
gerado foi conferido página a página — as imagens não colidem com a coluna de texto.

A gravação em pedaços foi medida em execuções de 60, 90 e 180 segundos:

- memória do heap **parada em 9,5 MB** do primeiro ao último segundo, enquanto o disco crescia até 13 MB;
- áudio de **89,99 s para 90 s de relógio** (–0,01 s) e **60,03 s para 60 s** — sem furos e alinhado com o
  vídeo, o que é o que mantém as telas no minuto certo da ata;
- taxa de 62,5 KB/s, exatamente o esperado para dois canais Int16 a 16 kHz;
- 33 arquivos no disco para 90 s (9 de vídeo, 23 de áudio, 1 de metadados);
- aba fechada à força aos 25 s devolveu **24 s** de áudio, com transcrição, telas e PDF saindo normalmente
  a partir do material recuperado;
- o botão de apagar zerou o armazenamento.

O pacote de conformidade tem verificação própria (`testes/t-conformidade.mjs`), com valores golden para o
vocabulário — inclusive **o que ele não pode fazer**: não trocar palavra que só se parece com um termo, não
mexer no que já está certo e não corrigir palavra curta. O registro de consentimento é conferido nos três
lugares onde precisa aparecer, e a correção feita à mão é conferida depois de sair do campo.

Os quatro itens do pacote anterior têm verificação própria (`testes/t-extras.mjs`): um WAV de 40 s montado dentro da
página é arrastado para a área de importação e vira 2.560.000 bytes de PCM — os 40 s exatos —, as duas
janelas de trinta segundos leem trechos diferentes do arquivo, "detectar o idioma" não manda idioma nenhum
ao modelo, o nome digitado e o nome escolhido por clique aparecem na ata, no texto e na legenda, e duas
marcas feitas durante a gravação (uma pela tecla M, outra pelo botão) chegam à ata, ao texto e ao PDF.

### O que a suíte de silêncio protege

Nasceu de uma ata de verdade: 11 minutos de reunião com o microfone fechado produziram **88 repetições** de
"O que é isso?" atribuídas a quem gravou. O modelo simulado dos testes agora **alucina igual** — silêncio
entra, laço sai —, senão a peneira poderia ser removida sem nenhum teste ficar vermelho.

`testes/t-silencio.mjs` mede as regras isoladamente, com números escritos à mão (silêncio não passa, um
estalo de 60 ms não passa, 800 ms de fala passa, canal de ganho baixo não é confundido com canal mudo) e
depois grava de verdade com o microfone em ganho zero: nenhuma fala atribuída ao microfone, a tela diz que
o canal ficou em silêncio, o outro canal continua transcrito, e o contador do modelo simulado prova que o
áudio mudo **nem chegou nele**. O botão de fechar o microfone é conferido pela trilha, não pelo rótulo.

### O que a suíte de funções protege

`testes/t-funcoes.mjs` não abre navegador: importa `api/painel.js` e `api/resumo.js` e as chama com o
`fetch` substituído por um duplo que registra tudo. É o único jeito de afirmar o que a página não tem como
demonstrar — que o servidor recusa quem deve recusar, e que **a cota é consumida antes de a Anthropic ser
chamada**. Trocar essa ordem não muda nada na tela e faz cada recusa custar dinheiro.

### O que a suíte de conta protege

Não é a qualidade do resumo — é a promessa e a porteira. `testes/t-conta.mjs` registra **toda** requisição
que a página tenta fazer e exige que a única de fora seja a do nosso servidor; que o `config.json` que vai
no repositório esteja em branco e que em branco signifique produto local, sem cadastro e sem cartão de IA;
que um `config.json` pela metade seja **denunciado na tela** em vez de falhar em silêncio; que o link do
e-mail entre na conta mesmo com a aba já aberta; que no plano grátis os botões da IA nem existam; que o
corpo da requisição seja o texto da ata com o token de quem pediu; que o resumo chegue ao PDF e ao `.txt`;
e que a única coisa gravada no navegador seja a sessão — nada da reunião.

## Limites conhecidos, a testar antes de prometer

- **macOS:** o navegador não captura áudio do sistema; só funciona com a reunião numa aba (Meet, Teams
  web). Zoom em aplicativo, não.
- **Reunião longa:** a memória deixou de ser o limite, mas o **tempo de transcrição** com o modelo real
  ainda não foi medido, e o disco passa a contar — cerca de 225 MB por hora só de áudio cru, mais o vídeo.
  Transcrever durante a reunião muda a conta a favor, mas **com o modelo real ainda não foi medido**: se
  uma janela de 30 s levar mais de 30 s para transcrever, o adiantamento não acompanha a gravação e vira
  apenas uma dianteira parcial. Isso não quebra nada — a ata sai igual —, mas a promessa de "pronta ao
  encerrar" só vale onde o computador acompanha.
- **Qualidade em português** com várias vozes e sotaques é incógnita.
- **Canal com ruído alto e sem fala** — música de espera, ventilador perto do microfone — passa pela
  peneira de energia, porque ela mede nível, não fala. O filtro de laço é a rede que sobra, e ela só pega
  repetição. Detectar "isto é som, mas não é voz" pede outro modelo, e ainda não foi feito.
- **A camada paga foi verificada só contra servidores de mentira.** As rotas de conta, de resumo e de
  envio de e-mail respondem nos testes como as de verdade responderiam, e é isso que garante o
  comportamento do navegador. Falta rodar uma vez com Supabase, Anthropic e Resend reais: a migration
  aplicada, o link do e-mail chegando na caixa, a cota descontando e a chave do modelo funcionando do lado
  do servidor.
- **Eco:** se você usar alto-falante em vez de fone, sua voz volta pelo canal dos participantes. O
  cancelamento de eco do microfone ajuda, mas o caso precisa ser testado.
- **Consentimento:** gravar reunião exige avisar os participantes. Isso tem que estar na interface.

## Próximos passos

1. Testar uma reunião real de trinta minutos — é o que vai derrubar ou confirmar tudo acima, e agora é
   possível: antes a aba não aguentava.
2. Medir o eco quando se usa alto-falante em vez de fone.
3. Nomear os participantes e registrar o consentimento com carimbo de hora.
4. Modelos de ata por tipo de reunião: cliente, equipe, entrevista.

O roadmap e o modelo de negócio ficam em `interno/`, fora do repositório: tratam de concorrência e preço,
e material desse tipo não se publica.
