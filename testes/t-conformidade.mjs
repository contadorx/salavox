/* Vocabulário do escritório, correção do texto, registro de consentimento e
   ata em inglês.

   O vocabulário é a parte perigosa: uma régua frouxa troca "concordata" por
   "conta" e estraga a ata em vez de consertá-la. Por isso o teste não confere
   só o que ele corrige — confere também o que ele tem de deixar em paz. */

import { telaFalsa, paginaLimpa, bloco, transcrever } from './apoio.mjs';

/* Marcas concorrentes citadas por escrito. Regra do escritório, e ela não é
   estética: objeção de concorrente se responde verbalmente, nunca num documento
   que circula. Vale para a página pública, para a ferramenta e para os
   documentos que vão no repositório — `interno/` fica fora, porque não é
   publicado.

   Esta trava existe porque a tentação é real: ao responder a um concorrente, o
   caminho mais curto é nomeá-lo. */
const MARCAS = ['fireflies', 'otter', 'tldv', 'tl;dv', 'notta', 'tactiq', 'fathom',
                'gong', 'chorus', 'grain', 'avoma', 'sembly', 'krisp'];

async function semMarcaConcorrente(b) {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const { RAIZ } = await import('./apoio.mjs');
  const olhar = ['public/index.html', 'public/app.html', 'public/privacidade.html',
                 'public/termos.html', 'public/painel.html', 'src/app.html', 'src/app.js',
                 'README.md', 'CONCEITO.md', 'CAMADA-PAGA.md', 'DESEMPENHO.md'];
  const achados = [];
  for (const rel of olhar) {
    let t = '';
    try { t = fs.readFileSync(path.join(RAIZ, rel), 'utf8').toLowerCase(); } catch (e) { continue; }
    for (const m of MARCAS) if (t.includes(m)) achados.push(rel + ': ' + m);
  }
  b.conferir('nenhuma marca concorrente é citada por escrito no que vai publicado', achados, []);
}

export default async function (ctx, url, erros) {
  const b = bloco('vocabulário, correção, consentimento e inglês');
  const p = await paginaLimpa(ctx, erros);
  await p.addInitScript(telaFalsa(4));
  await p.goto(url + '/app');

  /* ---------- vocabulário: a função pura, com valores golden ---------- */
  const casos = await p.evaluate(() => {
    const v = window.__salavox.aplicarVocabulario;
    const termos = ['Simples Nacional', 'DIRF', 'Construtora Andrade', 'pró-labore', 'concordata'];
    return [
      ['sinples nacional', v('Vamos ver o sinples nacional dela.', termos).texto],
      ['acento faltando', v('O pro-labore ainda não foi pago.', termos).texto],
      ['duas palavras', v('A construtora andrada mandou o extrato.', termos).texto],
      ['pontuação no fim', v('Ele perguntou do sinples nacional.', termos).texto],
      ['já está certo', v('A DIRF foi entregue.', termos).texto],
      ['palavra diferente', v('Ele abriu uma conta nova.', termos).texto],
      ['palavra curta parecida', v('O prazo era de um dia.', ['DIRF']).texto],
      ['contagem', String(v('o sinples nacional e o pro-labore', termos).trocas)]
    ];
  });
  const achar = n => (casos.find(c => c[0] === n) || [])[1];

  b.conferir('corrige o termo errado', achar('sinples nacional'), 'Vamos ver o Simples Nacional dela.');
  b.conferir('corrige acento que faltou', achar('acento faltando'), 'O pró-labore ainda não foi pago.');
  b.conferir('corrige termo de duas palavras', achar('duas palavras'), 'A Construtora Andrade mandou o extrato.');
  b.conferir('mantém a pontuação do fim', achar('pontuação no fim'), 'Ele perguntou do Simples Nacional.');
  b.conferir('não mexe no que já está certo', achar('já está certo'), 'A DIRF foi entregue.');
  b.conferir('não troca palavra que só parece', achar('palavra diferente'), 'Ele abriu uma conta nova.');
  b.conferir('não corrige palavra curta parecida', achar('palavra curta parecida'), 'O prazo era de um dia.');
  b.conferir('conta as trocas', achar('contagem'), '2');

  /* ---------- consentimento: marcado antes da gravação, com hora ---------- */
  await p.check('#okConsent');
  const antes = await p.evaluate(() => window.__salavox.consentimento());
  b.verdade('marcar a caixa já registra a confirmação, com hora',
            !!(antes && antes.confirmado && !antes.iniciado));

  await p.click('#copiarAviso');
  await p.waitForTimeout(200);

  await p.click('.vocab summary');            // a lista fica dobrada até alguém precisar dela
  await p.fill('#vocab', 'Simples Nacional\nconciliação bancária');
  await p.selectOption('#saida', 'translate');

  await p.click('#rec');
  await p.waitForFunction(() => !document.getElementById('stop').classList.contains('hide'), null, { timeout: 20000 });
  await p.waitForTimeout(12000);
  await p.click('#stop');
  await p.waitForFunction(() => /pronta|vazia/.test(document.getElementById('recMsg').textContent), null, { timeout: 60000 });

  const dep = await p.evaluate(() => window.__salavox.consentimento());
  b.verdade('o registro guarda confirmação, cópia do aviso e início da gravação',
            !!(dep && dep.confirmado && dep.copiado && dep.iniciado));

  await transcrever(p);

  const opcoes = await p.evaluate(() => window.__opcoes || {});
  b.conferir('"ata em inglês" pede tradução ao modelo', opcoes.task, 'translate');

  b.verdade('o registro de consentimento aparece na ata',
            !(await p.isHidden('#consentReg')) &&
            /Registro de consentimento/.test(await p.textContent('#consentReg')));

  const texto = await p.evaluate(() => window.__salavox.comoTexto());
  b.verdade('o registro entra no texto exportado', /REGISTRO DE CONSENTIMENTO/.test(texto));
  b.verdade('o texto do aviso vai junto', texto.indexOf('estou gravando esta reunião') > 0);

  /* ---------- corrigir o texto de uma fala à mão ---------- */
  const alvo = p.locator('#ata .txt').first();
  await alvo.click();
  await p.evaluate(() => {
    const t = document.querySelector('#ata .txt');
    t.textContent = 'Texto corrigido à mão pelo contador.';
  });
  await alvo.blur();
  await p.waitForTimeout(150);

  const primeira = await p.evaluate(() => window.__salavox.falas()[0].texto);
  b.conferir('a correção feita na ata entra na fala', primeira, 'Texto corrigido à mão pelo contador.');
  const texto2 = await p.evaluate(() => window.__salavox.comoTexto());
  b.verdade('a correção aparece no texto exportado', /Texto corrigido à mão pelo contador\./.test(texto2));

  const espera = p.waitForEvent('download', { timeout: 60000 });
  await p.click('#baixarPdf');
  const arq = await espera;
  const fluxo = await arq.createReadStream();
  let tam = 0;
  for await (const parte of fluxo) tam += parte.length;
  b.entre('o PDF com o registro de consentimento sai (bytes)', tam, 3000, 3000000);

  await semMarcaConcorrente(b);

  await p.close();
  return b;
}
