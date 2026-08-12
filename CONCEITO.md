# Salavox — conceito

Grava a reunião, transcreve e entrega a ata. Nada sai do computador.

## A ideia que separa dos concorrentes

As ferramentas de ata do mercado identificam quem falou usando modelos de
separação de locutor na nuvem — é caro e por isso está nos planos pagos.

Aqui o problema se resolve de graça, por um caminho diferente: **as duas fontes
de áudio já chegam separadas**. O microfone é você; o áudio do sistema ou da aba
são os outros participantes. Gravando cada um em um canal do estéreo — você à
esquerda, eles à direita — dá para transcrever os dois separadamente e montar a
ata já dizendo quem falou.

Não é separação de locutor de verdade: todos os participantes remotos ficam num
grupo só. Mas resolve o caso mais útil ("o que EU me comprometi a fazer") sem
servidor e sem custo, e isso precisa estar dito com clareza para não virar
promessa exagerada.

## A segunda ideia: a tela também é conteúdo da reunião

Boa parte do que importa numa reunião de escritório não é dita, é mostrada — a planilha, o extrato, o
contrato na tela. As ferramentas de nuvem guardam isso como vídeo, que ninguém revê.

O Salavox varre a própria gravação procurando os instantes em que a tela mudou (assinatura RGB de 32×18 e
diferença média entre quadros, o mesmo mecanismo do ClipContext) e trata cada tela como um item da ata,
posicionado no minuto em que apareceu. A ata em PDF sai com a fala e a tela intercaladas, na ordem
cronológica. É a diferença entre "houve uma reunião de uma hora" e "às 12:04 ele mostrou esta planilha e
disse isto".

## A terceira ideia: nada inteiro na memória

Uma reunião de duas horas não cabe na memória de uma aba — nem como vídeo, nem, principalmente, como áudio
decodificado para transcrever, que é o gargalo escondido: passa de um giga por hora.

A solução tem duas metades. O vídeo vai para o disco em pedaços de dez segundos, cada um fechado assim que
chega, e no fim os arquivos são apenas costurados num Blob que os referencia. E o áudio é gravado **em
paralelo, já no formato que o Whisper quer** — dois canais Int16 a 16 kHz, 62,5 KB/s — por um AudioWorklet
que escreve direto no disco; a transcrição depois lê fatias de trinta segundos desse arquivo, sem
decodificar nada.

O efeito colateral é o melhor pedaço: como cada pedaço já está fechado no disco, uma aba que morre no meio
da reunião não leva nada junto. Ao reabrir a página, o material está lá esperando.

## Limites conhecidos, a testar antes de prometer

- No macOS o navegador não captura o áudio do sistema: só funciona com a reunião
  numa aba (Meet, Teams web). Zoom em aplicativo, não.
- O tempo de transcrição de uma reunião longa com o modelo real ainda não foi medido.
- O novo limite é disco, não memória: cerca de 225 MB por hora de áudio cru, mais o vídeo.
- A qualidade do modelo pequeno em português com várias vozes ainda é incógnita.
