# Salavox — modelo de negócio

Documento de decisão. Preços de concorrentes verificados em agosto de 2026; confira antes de comprometer
números.

---

## 1. O que é

Grava a reunião, transcreve e entrega a ata — inteiramente no computador de quem usa. Sem robô entrando na
chamada e sem áudio subindo para servidor nenhum.

**Para quem:** profissional que trata de assunto confidencial em reunião. Contador, advogado, médico,
consultor, RH, corretor de seguros, agente de M&A. Não é para quem quer produtividade genérica de reunião —
esse mercado já está bem atendido.

**A frase:** *a reunião fica na sala.*

---

## 2. O mercado e onde está a brecha

| Concorrente | Preço por pessoa/mês | Robô na chamada |
|---|---|---|
| Otter | US$ 8,33 a 30 | sim, visível |
| Fireflies | US$ 10 a 29 | sim (há modo sem robô) |
| Fathom | US$ 15 a 29 | sim, visível |
| Granola | US$ 14 a 35 | não, capta do aparelho |

Todos processam o áudio na nuvem. É o que permite a eles separar cada locutor e integrar com calendário e
CRM — e é exatamente o que impede o cliente que não pode deixar o áudio sair da empresa.

**A brecha não é preço, é arquitetura.** Um concorrente não consegue oferecer "não sai do seu computador"
sem jogar fora o produto inteiro que construiu. É a única vantagem que nenhum deles pode copiar em um
trimestre.

---

## 3. O que temos e o que falta

**Pronto e verificado:** captura de tela e áudio, microfone em canal separado, transcrição local por canal,
ata com marcação de quem falou, saída em PDF, texto e legenda, prompt para IA, porta de consentimento e
salto de blocos silenciosos.

**Falta antes de vender:**

1. **Teste em reunião real de trinta minutos.** Nada substitui isso. Vai medir memória, tempo de transcrição
   e qualidade em português com várias vozes.
2. **Eco:** com alto-falante, a voz de quem grava volta pelo canal dos participantes e degrada a separação.
   Precisa ser medido e, se for o caso, tratado.
3. **Gravação longa** em memória do navegador — provavelmente exige gravar em pedaços.
4. **Aproveitar as telas compartilhadas** como imagens na ata (o ClipContext já faz isso).

**Limites que ficam:** não separa os participantes entre si; no macOS só funciona com reunião em aba; não
integra com calendário nem CRM. Tudo isso está dito na landing, e deve continuar dito.

---

## 4. Funcionalidades por plano

| | Individual | Profissional | Escritório |
|---|---|---|---|
| Gravar, transcrever, gerar ata | sim | sim | sim |
| Marcação você × participantes | sim | sim | sim |
| PDF, texto e legenda | sim | sim | sim |
| Sem limite de minutos | sim | sim | sim |
| Aplicativo de desktop | — | sim | sim |
| Modelos de ata por tipo de reunião | — | sim | sim |
| Ata com identidade do escritório | — | sim | sim |
| Histórico organizado das reuniões | — | sim | sim |
| Suporte com prazo de resposta | — | sim | sim |
| Licença para equipe | — | — | sim |
| Documentação de conformidade | — | — | sim |
| Treinamento da equipe | — | — | sim |
| Contrato e nota fiscal | — | — | sim |

---

## 5. Preço

**O problema honesto:** a versão do navegador é código aberto rodando na máquina do cliente. **Não há como
travá-la tecnicamente** — qualquer limite é contornável com o inspetor do navegador. Portanto o plano pago
não pode vender "funcionalidade destravada". Precisa vender o que não é código.

Três coisas que não se copiam com F12:

- **Conveniência:** aplicativo de desktop que abre sozinho, grava sem depender de aba aberta e guarda o
  histórico. Isso é trabalho de engenharia embalado, e a licença é verificável no binário.
- **Confiança:** contrato, nota fiscal, prazo de suporte, documentação para auditoria. Escritório regulado
  compra isso, não bits.
- **Tempo:** modelos de ata prontos, treinamento, implantação na equipe.

**Sugestão inicial, a validar com clientes reais:**

| Plano | Preço | Racional |
|---|---|---|
| Individual | R$ 0 | funil e prova de que funciona |
| Profissional | R$ 39 / mês | cerca de um terço do concorrente; acima de R$ 15 para a taxa fixa do cartão não pesar |
| Escritório | R$ 29 / profissional / mês, mínimo de 5 | desconto por volume, com contrato |
| Implantação | R$ 900 uma vez | treinamento e configuração, opcional |

**Não seja o mais barato.** Para profissional regulado, preço muito baixo levanta dúvida sobre seriedade.
O discurso é "custa menos porque não temos servidor", não "custa menos porque é simples".

**Taxas:** no cartão nacional, cerca de 4% mais R$ 0,39, e mais 0,7% se usar cobrança recorrente. Numa
mensalidade de R$ 39 dá perto de R$ 2. Pix sai bem mais barato e vale oferecer para o plano anual.

---

## 6. Como chegar ao cliente

Seu canal mais forte não é anúncio — é o fato de você ter um escritório de contabilidade.

1. **Use na sua própria operação.** Trinta dias de uso real valem mais que qualquer pesquisa, e viram prova.
2. **Dez escritórios conhecidos.** Ofereça grátis em troca de conversa franca depois de um mês. É pesquisa
   de produto disfarçada de cortesia, e alguns viram clientes.
3. **Conselhos e associações.** CRC, OAB seccional, sindicatos e grupos de contadores têm boletim e evento.
   O ângulo é sigilo profissional, não tecnologia.
4. **Conteúdo específico.** "Posso gravar a reunião com meu cliente?" e "onde fica o áudio da sua reunião"
   são dúvidas reais que ninguém responde bem — e trazem exatamente quem tem o problema.
5. **Contadores que atendem contadores.** Software para escritório é vendido por indicação; uma indicação
   vale cem cliques.

**Não faça:** Product Hunt e Hacker News. Público errado, e o produto tem lacunas (participantes não
separados, macOS limitado) que lá viram crítica antes de virar venda. Esse é o caminho do ClipContext, não
deste.

---

## 7. Roadmap

**Agora — validar**
Teste real de trinta minutos. Medir eco, memória e qualidade. Corrigir o que quebrar.

**Depois — completar o produto grátis**
Gravação em pedaços para reunião longa. Telas compartilhadas como imagens na ata. Modelos de ata.
Aviso de consentimento com registro do horário.

**Só então — construir o pago**
Aplicativo de desktop com licença. Histórico local organizado. Identidade visual do escritório na ata.
Suporte com prazo.

**Quando houver escritórios pagando**
Documentação de conformidade, contrato padrão, política de retenção, treinamento.

**Talvez nunca**
Integração com calendário e CRM, separação individual de locutores. É o terreno deles, e você perde nele.

---

## 8. Riscos

**O maior é jurídico, não técnico.** O produto grava conversas. Se alguém usar para gravar sem avisar e der
problema, seu nome aparece. A porta de consentimento e os termos reduzem a exposição, mas **os documentos
precisam passar por um advogado antes de existir cliente pagante** — os que estão no repositório foram
escritos em linguagem clara, não por profissional habilitado.

**Dependência de navegador.** Se o Chrome mudar a captura de áudio, o produto quebra. O aplicativo de
desktop reduz esse risco e é mais um motivo para ele existir.

**Qualidade em português.** Se a transcrição sair ruim com áudio real de reunião, nada acima importa. É por
isso que o teste real é o item número um.

**Concorrente lançando modo local.** Possível, mas caro para eles: significaria manter dois produtos. E o
diferencial mais forte seria o seu nicho e o atendimento, não só a arquitetura.
