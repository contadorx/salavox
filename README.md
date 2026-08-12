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
- Pula blocos silenciosos na transcrição, o que economiza bastante tempo em reunião real.
- **Varre a gravação atrás das telas compartilhadas**, detectando mudança de cena por assinatura RGB, e
  intercala cada tela na ata no instante em que apareceu. Clicar na miniatura tira ou põe a tela na ata.
- **Marca momentos durante a reunião** pelo botão ou pela tecla M, e eles entram na ata, no PDF e no texto.
- **Nomeia quem falou**: os rótulos padrão viram nomes de verdade, e clicar no nome de uma fala troca a
  atribuição — útil quando há duas ou três pessoas do outro lado.
- **Usa uma gravação que já existe**: arraste um arquivo de áudio ou vídeo e ele vira ata do mesmo jeito.
- Transcreve em português, inglês ou espanhol, ou **detecta o idioma** sozinho.
- Exporta a ata em **PDF com as telas embutidas**, em `.txt` e em `.vtt`, permite baixar a gravação bruta,
  e copia um prompt pronto para pedir a ata a uma IA.
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
node testes/rodar-tudo.mjs           # telas, gravação em pedaços, recuperação
node testes/sabotagem.mjs            # quebra o app de propósito e exige que os testes peguem
node ferramentas/gerar-imagens.mjs   # refaz as imagens da página inicial a partir do app
node ferramentas/ver-home.mjs        # confere a página inicial, tema claro e escuro
```

As imagens da página inicial são **capturas do aplicativo de verdade**, geradas por
`ferramentas/gerar-imagens.mjs` a partir de uma reunião de exemplo. Se a interface mudar, basta rodar de
novo — não há maquete para manter sincronizada com nada.

A versão aparece no rodapé da ferramenta e em `/versao.txt`. Para saber o que está publicado:
`curl https://salavox.com/versao.txt` — se não bater com o zip, o que está no ar é outro produto.

## O que foi verificado

`node testes/rodar-tudo.mjs` roda tudo isto e sai com erro se algo falhar; `node testes/sabotagem.mjs`
planta cinco defeitos no código e exige que a verificação correspondente pegue cada um.

Com captura sintética no Chromium: a gravação sai com **dois canais** de energias distintas (0,14 e 0,21
no teste), a separação por canal chega à transcrição, a ata sai ordenada com os dois rótulos, e as saídas
`.txt`, `.vtt` e o prompt saem corretos. A transcrição foi exercitada com um modelo simulado — o modelo
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

Os quatro itens novos têm verificação própria (`testes/t-extras.mjs`): um WAV de 40 s montado dentro da
página é arrastado para a área de importação e vira 2.560.000 bytes de PCM — os 40 s exatos —, as duas
janelas de trinta segundos leem trechos diferentes do arquivo, "detectar o idioma" não manda idioma nenhum
ao modelo, o nome digitado e o nome escolhido por clique aparecem na ata, no texto e na legenda, e duas
marcas feitas durante a gravação (uma pela tecla M, outra pelo botão) chegam à ata, ao texto e ao PDF.

## Limites conhecidos, a testar antes de prometer

- **macOS:** o navegador não captura áudio do sistema; só funciona com a reunião numa aba (Meet, Teams
  web). Zoom em aplicativo, não.
- **Reunião longa:** a memória deixou de ser o limite, mas o **tempo de transcrição** com o modelo real
  ainda não foi medido, e o disco passa a contar — cerca de 225 MB por hora só de áudio cru, mais o vídeo.
- **Qualidade em português** com várias vozes e sotaques é incógnita.
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
