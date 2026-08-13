/* A ferramenta inteira em inglês, sem sobrar português na tela.

   Traduzir um produto é fácil de começar e difícil de terminar: o cabeçalho
   sai em inglês na primeira tarde e, seis meses depois, a mensagem de erro que
   ninguém viu ainda diz "não consegui salvar". O defeito não aparece para
   quem escreveu o produto — aparece para quem não fala português, que é
   exatamente quem a tradução deveria atender.

   Por isso este bloco não confere se algumas frases foram traduzidas. Ele
   percorre a ferramenta em inglês do começo ao fim — gravar, transcrever,
   ata, telas, IA, e-mail — e reprova a corrida listando cada pedaço de
   português que ainda estiver visível na tela. A lista que ele imprime é a
   lista do que falta traduzir.

   O que é da pessoa fica de fora: a ata, o resumo, o e-mail escrito pela IA e
   os nomes digitados. Traduzir a fala de um cliente seria o pior defeito
   possível neste produto — e é por isso que aquilo é marcado `data-usuario`
   e o varredor não encosta. */

import { telaFalsa, paginaLimpa, bloco, transcrever } from './apoio.mjs';

const SUPA = 'https://projeto-de-teste.supabase.co';

/* Abre a página já em inglês, sem depender do idioma do navegador do robô. */
const emIngles = async p => {
  await p.addInitScript(() => {
    try { localStorage.setItem('salavox.idioma', 'en'); } catch (e) {}
  });
};

export default async function (ctx, url, erros) {
  const b = bloco('a ferramenta em inglês');

  const p = await paginaLimpa(ctx, erros);
  await emIngles(p);
  await p.addInitScript(telaFalsa(4));

  /* Com conta configurada: o cartão da IA e a faixa de conta também são tela,
     e também precisam de tradução. */
  await p.route('**/config.json', r => r.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ supabaseUrl: SUPA, supabaseAnonKey: 'anon-de-teste' })
  }));
  await p.route(SUPA + '/rest/v1/perfis**', r => r.fulfill({
    contentType: 'application/json',
    body: JSON.stringify([{ email: 'accountant@example.com', nome: null,
                            plano: 'gratis', assinante_ate: null }])
  }));
  await p.route(SUPA + '/rest/v1/rpc/cortesia_restante', r => r.fulfill({
    contentType: 'application/json', body: '7' }));
  await p.route('**/api/resumo', r => r.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ texto: '## SUMMARY\nA short summary in English.\n\n' +
                                  '## E-MAIL\nSubject: Meeting notes\n\nHello, here are the notes.',
                           restante: 6 }) }));

  const sobrou = [];
  const olhar = async etapa => {
    const v = await p.evaluate(() => window.SalavoxIdioma.vazamentos());
    v.forEach(t => sobrou.push(etapa + ' → ' + t));
  };

  await p.goto(url + '/app#access_token=token-de-teste&refresh_token=renova');
  await p.waitForFunction(() => !!window.SalavoxIdioma, null, { timeout: 15000 });
  await p.waitForTimeout(800);

  b.conferir('a página se declara em inglês', await p.getAttribute('html', 'lang'), 'en');
  b.verdade('o seletor de idioma está na barra do topo, marcado em inglês',
            (await p.inputValue('#lingua')) === 'en');

  await olhar('abertura');

  /* abre as caixas dobráveis: texto escondido também é texto */
  for (const s of await p.$$('details summary')) { await s.click().catch(() => {}); }
  await p.waitForTimeout(200);
  await olhar('caixas abertas');

  await p.check('#okConsent');
  await p.waitForTimeout(150);
  await olhar('consentimento marcado');

  await p.click('#rec');
  await p.waitForFunction(() => !document.getElementById('stop').classList.contains('hide'),
                          null, { timeout: 20000 });
  await p.waitForTimeout(2000);
  await olhar('gravando');

  await p.click('#marcar');
  await p.waitForTimeout(9000);
  await p.click('#stop');
  await p.waitForFunction(() => /ready|empty|pronta|vazia/i.test(document.getElementById('recMsg').textContent),
                          null, { timeout: 60000 });
  await olhar('gravação encerrada');

  await transcrever(p);
  await olhar('ata na tela');

  await p.click('#iaOrganizar');
  await p.waitForFunction(() => document.getElementById('iaMsg').textContent.trim().length > 0,
                          null, { timeout: 30000 });
  await p.waitForTimeout(400);
  await olhar('depois da IA');

  const lista = Array.from(new Set(sobrou.map(t => t.split(' → ').slice(1).join(' → '))));
  if (lista.length) {
    const fs = await import('node:fs');
    fs.writeFileSync('/tmp/faltam.json', JSON.stringify(lista, null, 1));
    console.log('    ' + lista.length + ' textos ainda em português (lista em /tmp/faltam.json)');
    lista.slice(0, 12).forEach(t => console.log('    falta traduzir: ' + t.slice(0, 90)));
  }
  b.conferir('nada de português sobra na tela em inglês', lista.length, 0);

  /* A ata é da pessoa e continua como ela falou. */
  const ata = await p.textContent('#ata');
  b.verdade('o que foi dito na reunião não é traduzido', ata.length > 0);
  await p.close();

  /* ---------- as páginas públicas ----------
     A ferramenta em inglês com a página de venda em português é pior do que
     nenhuma tradução: quem chega pelo site não entra. */
  const publicas = [['/', 'site'], ['/conta', 'conta'],
                    ['/privacidade', 'privacidade'], ['/termos', 'termos']];
  const sobrouFora = [];
  for (const [caminho, nome] of publicas) {
    const q = await paginaLimpa(ctx, erros);
    await emIngles(q);
    await q.goto(url + caminho);
    await q.waitForFunction(() => !!window.SalavoxIdioma, null, { timeout: 15000 }).catch(() => {});
    await q.waitForTimeout(400);
    for (const d of await q.$$('details summary')) { await d.click().catch(() => {}); }
    await q.waitForTimeout(200);
    /* As capturas também têm idioma: elas mostram uma reunião de exemplo, e
       uma reunião em português dentro de uma página em inglês é o mesmo
       descuido que uma frase não traduzida — só que maior. */
    if (nome === 'site') {
      const fotos = await q.evaluate(() => Array.from(document.images)
        .filter(i => /\/img\//.test(i.getAttribute('src') || ''))
        .map(i => ({ src: i.getAttribute('src'), largura: i.naturalWidth })));
      b.verdade('as capturas da home apontam para a versão em inglês',
                fotos.length > 0 && fotos.every(f => f.src.indexOf('/img/en/') === 0));
      b.verdade('e todas elas carregam de verdade',
                fotos.length > 0 && fotos.every(f => f.largura > 0));
    }
    const v = await q.evaluate(() => window.SalavoxIdioma ? window.SalavoxIdioma.vazamentos() : ['SEM RUNTIME']);
    v.forEach(t => sobrouFora.push(nome + ' → ' + t));
    b.verdade('a página ' + nome + ' se declara em inglês',
              (await q.getAttribute('html', 'lang')) === 'en');
    /* O título da aba é o que aparece na busca e no cartão de compartilhamento:
       é onde quem não fala português encontra o produto. */
    b.verdade('e o título da aba também está em inglês, na página ' + nome,
              !/[ãõçáéêíóôú]|\b(reunião|gravação|conta|privacidade|termos|uso)\b/i
                .test(await q.title()));
    await q.close();
  }

  const foraLista = Array.from(new Set(sobrouFora));
  if (foraLista.length) {
    const fs = await import('node:fs');
    fs.writeFileSync('/tmp/faltam-site.json',
                     JSON.stringify(foraLista.map(t => t.split(' → ').slice(1).join(' → ')), null, 1));
    console.log('    ' + foraLista.length + ' textos do site ainda em português (/tmp/faltam-site.json)');
    foraLista.slice(0, 10).forEach(t => console.log('    falta traduzir: ' + t.slice(0, 90)));
  }
  b.conferir('nada de português sobra nas páginas públicas em inglês', foraLista.length, 0);

  return b;
}
