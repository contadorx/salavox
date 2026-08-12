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
- Exporta a ata em **PDF com as telas embutidas**, em `.txt` e em `.vtt`, permite baixar a gravação bruta,
  e copia um prompt pronto para pedir a ata a uma IA.
- Avisa antes de fechar a aba enquanto grava ou transcreve.
- Exige confirmação expressa de que os participantes foram avisados antes de deixar gravar.

## A ideia que separa dos concorrentes

Otter, Fireflies e Fathom identificam quem falou com separação de locutor na nuvem — caro, e por isso
fica nos planos pagos. Aqui o problema se resolve por outro caminho: **as fontes já chegam separadas.**
O microfone é você, o áudio da chamada são os outros. Gravando um em cada canal do estéreo, a atribuição
sai de graça.

**Não é separação de locutor de verdade:** todos os participantes remotos ficam num grupo só. Isso
precisa estar dito na interface e no material de venda — resolve o caso mais útil ("o que eu me
comprometi a fazer"), não o de identificar cada pessoa.

## Estrutura

```
src/app.html     interface
src/app.js       toda a lógica
public/app.html  gerado pelo build — não edite
build.py         junta os dois
```

```bash
python3 build.py
```

## O que foi verificado

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

O roadmap completo, montado funcionalidade a funcionalidade contra o concorrente mais completo do mercado,
está em [ROADMAP.md](ROADMAP.md). O modelo de negócio, em [MODELO-DE-NEGOCIO.md](MODELO-DE-NEGOCIO.md).
