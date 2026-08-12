/* Silêncio, alucinação e o microfone fechado.

   Este bloco existe por causa de uma ata de verdade, de 12/08/2026: 11 minutos
   de reunião, microfone fechado, e a ata saiu com **88 repetições** de "O que é
   isso?" atribuídas a quem gravou. Mais "e aí" onze vezes e "e" sete. Nada
   daquilo foi dito.

   O modelo não fez nada de errado: Whisper diante de silêncio devolve texto
   inventado, e entra em laço. Quem tinha de barrar era o aplicativo, e a
   peneira que existia olhava o PICO da janela — que um clique de teclado
   atinge sozinho.

   O que este teste guarda, então, é o silêncio: que ele seja detectado sem
   perguntar ao modelo, que o canal mudo seja dito na tela em vez de sair como
   fala, que o outro canal continue sendo transcrito normalmente, e que um laço
   que escape à peneira seja descartado depois. */

import { telaFalsa, micMudo, paginaLimpa, bloco, transcrever } from './apoio.mjs';

export default async function (ctx, url, erros) {
  const b = bloco('silêncio, alucinação e microfone fechado');

  /* ---------- 1. as duas peneiras, medidas isoladamente ----------
     Antes da integração: as funções puras, com números escritos à mão. Se
     estas contas estiverem erradas, o resto do bloco mente. */
  const p = await paginaLimpa(ctx, erros);
  await p.addInitScript(telaFalsa(4));
  await p.addInitScript(micMudo());
  await p.goto(url + '/app');
  await p.waitForFunction(() => !!window.__salavox, null, { timeout: 15000 });

  const contas = await p.evaluate(() => {
    const S = window.__salavox;
    const quadros = n => Array.from({ length: n }, () => 0);
    // ruído de fundo de microfone fechado: −60 dBFS
    const ruido = Array.from({ length: 1500 }, () => 0.001);
    // fala: 300 quadros altos no meio de silêncio
    const fala = ruido.slice();
    for (let i = 400; i < 700; i++) fala[i] = 0.08;
    return {
      altoRuido: S.nivelAlto(ruido),
      altoFala: S.nivelAlto(fala),
      piso: S.PISO_VOZ,
      minimo: S.QUADROS_MIN,
      vazio: S.nivelAlto([]),
      naoUsado: quadros(0).length
    };
  });
  b.verdade('canal só com ruído de fundo fica abaixo do limiar de mudo',
            contas.altoRuido < 0.01);
  b.verdade('canal com fala fica muito acima', contas.altoFala > 0.05);
  b.conferir('o piso absoluto de voz é o esperado', +contas.piso.toFixed(4), 0.006);
  b.conferir('quantos quadros de 20 ms são exigidos', contas.minimo, 10);
  b.conferir('canal sem quadro nenhum não estoura', contas.vazio, 0);

  /* A regra da janela, com os três casos que importam. O do meio é o que a
     peneira antiga deixava passar: um estalo curto no meio de trinta segundos
     de silêncio, que era o bastante para o modelo receber a janela inteira e
     preenchê-la de conversa inventada. */
  const janela = await p.evaluate(() => {
    const S = window.__salavox;
    const lim = S.limiarDoCanal(0.20);              // canal com fala em nível normal
    const monte = (n, v, altos, va) => {
      const a = Array.from({ length: n }, () => v);
      for (let i = 0; i < altos; i++) a[i + 10] = va;
      return a;
    };
    return {
      limiar: +lim.toFixed(4),
      silencio: S.janelaTemVoz(monte(1500, 0.001, 0, 0), lim),
      estalo: S.janelaTemVoz(monte(1500, 0.001, 3, 0.30), lim),      // 60 ms de clique
      frase: S.janelaTemVoz(monte(1500, 0.001, 40, 0.08), lim),      // 800 ms de fala
      mudo: S.canalMudo(0.004),
      baixoMasVivo: S.canalMudo(0.03)
    };
  });
  b.conferir('o limiar segue o nível do canal, não um número fixo', janela.limiar, 0.012);
  /* A folga que faltava: fala 18 dB abaixo da fala forte do mesmo canal — quem
     está do outro lado da sala — tem de continuar sendo transcrita. */
  b.verdade('fala 18 dB abaixo da mais alta do canal ainda passa',
            await p.evaluate(() => {
              const S = window.__salavox;
              const lim = S.limiarDoCanal(0.28);
              const a = Array.from({ length: 1500 }, () => 0.001);
              for (let i = 10; i < 60; i++) a[i] = 0.035;
              return S.janelaTemVoz(a, lim);
            }));
  b.conferir('trinta segundos de silêncio não vão ao modelo', janela.silencio, false);
  b.conferir('um estalo de 60 ms também não', janela.estalo, false);
  b.conferir('mas 800 ms de fala vão', janela.frase, true);
  b.conferir('canal que nunca passa de −48 dBFS é mudo', janela.mudo, true);
  b.conferir('canal de ganho baixo não é confundido com mudo', janela.baixoMasVivo, false);

  const laco = await p.evaluate(() => {
    const S = window.__salavox;
    const f = (quem, a, texto) => ({ quem, a, texto });
    const lista = [
      f('voce', 1, 'Bom dia a todos.'),
      f('voce', 2, 'O que é isso?'),
      f('voce', 4, 'o que é isso'),          // o laço não repete a pontuação
      f('voce', 6, 'O QUE É ISSO?'),
      f('voce', 8, 'Fechamos em doze parcelas.'),
      f('outros', 3, 'Certo.'),
      f('outros', 5, 'Certo.'),              // duas repetições: conversa, não laço
      f('outros', 7, 'Vamos fazer assim.')
    ];
    const r = S.tirarLacos(lista);
    return { textos: r.limpa.map(x => x.texto), tirados: r.tirados };
  });
  b.conferir('o laço de três repetições sai inteiro, ignorando caixa e pontuação',
             laco.textos,
             ['Bom dia a todos.', 'Fechamos em doze parcelas.', 'Certo.', 'Certo.', 'Vamos fazer assim.']);
  b.conferir('e o número descartado é dito', laco.tirados, 3);

  /* ---------- 2. a gravação de verdade, com o microfone fechado ---------- */
  await p.check('#okConsent');
  await p.click('#rec');
  await p.waitForFunction(() => !document.getElementById('stop').classList.contains('hide'),
                          null, { timeout: 20000 });

  b.verdade('o botão de fechar o microfone aparece durante a gravação',
            !(await p.isHidden('#calar')));
  b.conferir('o microfone começa aberto', await p.evaluate(() => window.__salavox.micLigado()), true);
  await p.click('#calar');
  b.conferir('clicar desliga a trilha de verdade, não só o rótulo',
             await p.evaluate(() => window.__salavox.micLigado()), false);
  b.verdade('e o rótulo passa a oferecer reabrir', /Reabrir/.test(await p.textContent('#calar')));
  await p.click('#calar');
  b.conferir('reabrir religa a trilha',
             await p.evaluate(() => window.__salavox.micLigado()), true);

  await p.waitForTimeout(11000);
  await p.click('#stop');
  await p.waitForFunction(() => /pronta|vazia/.test(document.getElementById('recMsg').textContent),
                          null, { timeout: 60000 });

  /* O aviso tem de chegar já no fim da gravação, antes da transcrição: é a
     diferença entre descobrir na hora e descobrir dez minutos depois. */
  b.verdade('ao encerrar, a tela já avisa que o microfone não registrou som',
            /microfone.*não registrou|não registrou.*microfone/i.test(await p.textContent('#recMsg')));

  await transcrever(p);
  const msg = await p.textContent('#trMsg');

  b.verdade('a tela diz que o canal do microfone ficou em silêncio',
            /microfone.*silêncio|silêncio.*microfone/i.test(msg));

  const porCanal = await p.evaluate(() => {
    const f = window.__salavox.falas();
    return { voce: f.filter(x => x.quem === 'voce').length,
             outros: f.filter(x => x.quem === 'outros').length };
  });
  b.conferir('nenhuma fala é atribuída ao microfone fechado', porCanal.voce, 0);
  b.verdade('e o canal dos participantes continua sendo transcrito', porCanal.outros > 0);

  /* A prova de que a peneira agiu ANTES do modelo, e não depois.

     Onze segundos de gravação dão uma janela; dois canais dariam dois pedidos
     ao modelo. Como o canal do microfone é mudo, o número certo é UM. Se
     alguém afrouxar a peneira, este contador vira dois e as 88 linhas da ata
     de verdade voltam.

     Contar pedidos, e não alucinações, também sobreviveu à mudança de casa do
     modelo: ele agora roda numa linha separada, e um contador guardado lá
     dentro seria invisível daqui — o teste continuaria verde sem medir nada. */
  b.conferir('o áudio mudo nem chegou ao modelo: um canal, um pedido',
             await p.evaluate(() => window.__salavox.pedidosAoModelo()), 1);

  const texto = await p.evaluate(() => window.__salavox.comoTexto());
  b.verdade('nada de "O que é isso?" no texto exportado', !/O que é isso\?/.test(texto));

  await p.close();
  return b;
}
