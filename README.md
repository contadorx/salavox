# Salavox

Grava a reunião, transcreve e entrega a ata. **Nenhum robô entra na chamada e nada sai do seu computador.**

## O que já funciona

- Grava a tela ou a janela da reunião com o áudio, usando só recursos nativos do navegador.
- Capta o microfone em paralelo e grava as duas fontes em **canais separados do estéreo**.
- Transcreve cada canal isoladamente com o Whisper rodando local, e monta a ata em ordem cronológica
  já marcando **VOCÊ** e **PARTICIPANTES**.
- Pula blocos silenciosos na transcrição, o que economiza bastante tempo em reunião real.
- Exporta `.txt` e `.vtt`, e copia um prompt pronto para pedir a ata a uma IA.
- Avisa antes de fechar a aba enquanto grava ou transcreve.

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

## Limites conhecidos, a testar antes de prometer

- **macOS:** o navegador não captura áudio do sistema; só funciona com a reunião numa aba (Meet, Teams
  web). Zoom em aplicativo, não.
- **Reunião longa** ainda não foi medida: memória do navegador e tempo de transcrição.
- **Qualidade em português** com várias vozes e sotaques é incógnita.
- **Eco:** se você usar alto-falante em vez de fone, sua voz volta pelo canal dos participantes. O
  cancelamento de eco do microfone ajuda, mas o caso precisa ser testado.
- **Consentimento:** gravar reunião exige avisar os participantes. Isso tem que estar na interface.

## Próximos passos

1. Testar uma reunião real de trinta minutos — é o que vai derrubar ou confirmar tudo acima.
2. Guardar as telas compartilhadas como frames e montar a ata visual (o ClipContext já faz isso).
3. Modelos de ata por tipo de reunião: cliente, equipe, entrevista.
4. Aviso de consentimento e marcação de início de gravação.
