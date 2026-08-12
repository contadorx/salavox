/* Conta, plano e a IA do Salavox — a camada paga.

   O que este teste guarda:

   1. Sem /config.json a ferramenta continua inteira e sem cadastro. É o estado
      de quem baixa o código e serve sozinho, e é o padrão.
   2. Com conta, o que sai daqui é o texto da ata — e o teste inspeciona o corpo
      da requisição para confirmar que é isso, com o token junto.
   3. O texto da reunião nunca é gravado no navegador. A sessão, sim: é o token
      da própria pessoa, como em qualquer site com login.
   4. Plano grátis recebe recusa clara, não erro genérico. */

import { telaFalsa, paginaLimpa, bloco, transcrever } from './apoio.mjs';

const SUPA = 'https://projeto-de-teste.supabase.co';

export default async function (ctx, url, erros) {
  const b = bloco('conta, plano e IA do Salavox');

  /* ---------- 1. config.json em branco: o produto local ----------
     Vazio tem de ser igual a não existir: nada de conta, nada de camada paga.
     É o estado de quem baixa o código e serve sozinho.

     Este bloco conferia, antes, que o arquivo publicado estava em branco. Não
     está mais — o projeto tem um Supabase de verdade, e os dois valores que vão
     ali são públicos por natureza. O que substituiu essa conferência está em
     `t-funcoes.mjs`, e é mais forte: o arquivo publicado não pode conter chave
     que não seja a `anon`. */
  const semConta = await paginaLimpa(ctx, erros);
  await semConta.addInitScript(telaFalsa(4));
  await semConta.goto(url + '/app');
  await semConta.waitForTimeout(500);
  b.verdade('com o config em branco o cartão de conta não aparece', await semConta.isHidden('#contaCard'));
  b.verdade('e nada é pedido ao servidor de contas',
            await semConta.evaluate(() => !window.__salavox.cfg()));
  await semConta.close();

  /* ---------- 1b. config pela metade: falar alto, não ficar mudo ----------
     A primeira instalação de verdade falhou exatamente assim, em silêncio. */
  const meio = await paginaLimpa(ctx, erros);
  await meio.route('**/config.json', r => r.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ supabaseUrl: 'https://SEU-PROJETO.supabase.co', supabaseAnonKey: 'SUA-ANON-KEY' })
  }));
  await meio.addInitScript(telaFalsa(4));
  await meio.goto(url + '/app');
  await meio.waitForFunction(() => !document.getElementById('contaCard').classList.contains('hide'),
                             null, { timeout: 10000 }).catch(() => {});
  b.verdade('config com o texto de exemplo é denunciado na tela',
            /não configurada|exemplo/i.test(await meio.textContent('#contaEstado')));
  b.verdade('e o botão de diagnóstico fica à mão', !(await meio.isHidden('#diagnostico')));
  await meio.close();

  /* ---------- 2. com configuração ---------- */
  const p = await paginaLimpa(ctx, erros);
  const enviados = [];
  const pedidos = [];
  let plano = 'gratis', ate = null, cortesia = 3, restante = 2;

  p.on('request', r => {
    const u = r.url();
    if (!u.startsWith(url) && !u.startsWith('data:') && !u.startsWith('blob:') &&
        !/cdn\.jsdelivr|huggingface/.test(u)) pedidos.push(u);
  });

  await p.route('**/config.json', r => r.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ supabaseUrl: SUPA, supabaseAnonKey: 'anon-de-teste' })
  }));
  await p.route(SUPA + '/auth/v1/otp', r => {
    enviados.push({ tipo: 'otp', corpo: r.request().postDataJSON() });
    return r.fulfill({ contentType: 'application/json', body: '{}' });
  });
  await p.route(SUPA + '/rest/v1/perfis**', r => r.fulfill({
    contentType: 'application/json',
    body: JSON.stringify([{ email: 'contador@exemplo.com.br', plano, assinante_ate: ate }])
  }));
  await p.route(SUPA + '/rest/v1/rpc/cortesia_restante', r => r.fulfill({
    contentType: 'application/json', body: String(cortesia)
  }));
  await p.route('**/api/resumo', r => {
    const req = r.request();
    enviados.push({ tipo: 'resumo', corpo: req.postDataJSON(), auth: req.headers()['authorization'] });
    if (plano === 'gratis' && cortesia <= 0) {
      return r.fulfill({ status: 402, contentType: 'application/json',
        body: JSON.stringify({ assinar: true,
          erro: 'seus resumos de cortesia acabaram — o plano profissional tem 30 por mês, R$ 19,90' }) });
    }
    return r.fulfill({ contentType: 'application/json',
      body: JSON.stringify({ texto: 'RESUMO DO SALAVOX: três decisões e duas pendências.',
                             restante: plano === 'gratis' ? restante : 29 }) });
  });
  await p.route('**/api/enviar-ata', r => {
    enviados.push({ tipo: 'email', corpo: r.request().postDataJSON() });
    return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ enviados: 2 }) });
  });

  await p.addInitScript(telaFalsa(4));
  await p.goto(url + '/app');
  await p.waitForFunction(() => !document.getElementById('contaCard').classList.contains('hide'), null, { timeout: 15000 });
  b.verdade('com configuração o cartão de conta aparece', true);
  b.verdade('a IA do Salavox é o único caminho — não há mais lista de motores',
            await p.evaluate(() => !document.getElementById('iaMotor')));

  await p.fill('#contaEmail', 'contador@exemplo.com.br');
  await p.click('#contaEntrar');
  await p.waitForFunction(() => /Link enviado|não consegui/.test(document.getElementById('contaMsg').textContent), null, { timeout: 15000 });
  b.verdade('pedir o link não pede senha nenhuma',
            /Link enviado/.test(await p.textContent('#contaMsg')) &&
            enviados.some(e => e.tipo === 'otp' && e.corpo.email === 'contador@exemplo.com.br' && !e.corpo.password));

  /* volta do link do e-mail, com os tokens no pedaço depois do # */
  await p.goto(url + '/app#access_token=token-de-teste&refresh_token=renova');
  // tolerante de propósito: se o login não acontecer, o teste tem de falhar com
  // nome, não estourar o tempo esperando um texto que nunca vem
  await p.waitForFunction(() => /plano/.test(document.getElementById('contaEstado').textContent),
                          null, { timeout: 15000 }).catch(() => {});
  b.verdade('o link do e-mail entra na conta mesmo com a aba já aberta',
            /plano/.test(await p.textContent('#contaEstado')));
  b.verdade('o token some da barra de endereço depois de entrar', !(await p.evaluate(() => location.hash)));
  b.verdade('quem está no grátis vê que a IA do Salavox é do pago',
            /plano grátis/.test(await p.textContent('#contaEstado')));

  /* ---------- 3. grava, transcreve e pede o resumo ---------- */
  await p.check('#okConsent');
  await p.click('#rec');
  await p.waitForFunction(() => !document.getElementById('stop').classList.contains('hide'), null, { timeout: 20000 });
  await p.waitForTimeout(11000);
  await p.click('#stop');
  await p.waitForFunction(() => /pronta|vazia/.test(document.getElementById('recMsg').textContent), null, { timeout: 60000 });
  await transcrever(p);

  /* Degustação: quem entrou na conta clica, assinando ou não.

     A regra anterior escondia os botões de quem não assinava, e o primeiro a
     esbarrar nela foi o dono do produto tentando testar a própria IA. Ninguém
     assina um resumo por IA sem ver o resumo. */
  b.verdade('quem entrou na conta tem os botões da IA, mesmo no grátis',
            !(await p.isHidden('#iaAcoes')));
  b.verdade('e a tela conta quantos resumos de cortesia sobraram',
            /3 resumos de cortesia/.test(await p.textContent('#iaEstado')));
  b.conferir('o modelo caro fica fora da degustação',
             await p.evaluate(() =>
               document.querySelector('#iaModeloSalavox option[value="preciso"]').disabled), true);

  /* Este conferir tem de vir DEPOIS da ata na tela. Enquanto o cartão da ata
     está escondido, o botão de e-mail está escondido junto — e a verificação
     passava mesmo com a trava do plano arrancada. Foi a sabotagem que mostrou:
     um teste verde por acidente é pior do que teste nenhum. */
  b.verdade('com a ata na tela, o envio por e-mail continua fora do grátis',
            await p.isHidden('#enviarEmail'));

  /* usa uma cortesia */
  cortesia = 2; restante = 1;
  await p.click('#iaResumo');
  await p.waitForFunction(() => /pronto|Não consegui/.test(document.getElementById('iaMsg').textContent),
                          null, { timeout: 30000 });
  b.verdade('o resumo de cortesia sai de verdade',
            /RESUMO DO SALAVOX/.test(await p.evaluate(() =>
              (window.__salavox.resumos().find(r => r.chave === 'resumo') || {}).texto || '')));
  b.verdade('e o que sobrou aparece contado como cortesia',
            /1 resumo de cortesia/.test(await p.textContent('#iaMotorMsg')));

  /* acabou a cortesia: a recusa tem de convidar a assinar, não só dizer não */
  cortesia = 0;
  await p.click('#iaPendencias');
  await p.waitForFunction(() => /pronto|Não consegui/.test(document.getElementById('iaMsg').textContent),
                          null, { timeout: 30000 });
  const recusa = await p.textContent('#iaMsg');
  b.verdade('a recusa diz que a cortesia acabou e quanto custa continuar',
            /cortesia/.test(recusa) && /19,90/.test(recusa));
  b.verdade('e o cartão passa a oferecer o plano', /acabaram/.test(await p.textContent('#iaEstado')));

  /* vira assinante e tenta de novo */
  plano = 'profissional';
  ate = new Date(Date.now() + 30 * 86400000).toISOString();
  await p.evaluate(() => location.reload());
  await p.waitForFunction(() => /ativo até/.test(document.getElementById('contaEstado').textContent),
                          null, { timeout: 15000 }).catch(() => {});
  b.verdade('assinante vê o plano e a validade', /profissional/.test(await p.textContent('#contaEstado')));

  await p.check('#okConsent');
  await p.click('#rec');
  await p.waitForFunction(() => !document.getElementById('stop').classList.contains('hide'), null, { timeout: 20000 });
  await p.waitForTimeout(11000);
  await p.click('#stop');
  await p.waitForFunction(() => /pronta|vazia/.test(document.getElementById('recMsg').textContent), null, { timeout: 60000 });
  await transcrever(p);

  // o botão de e-mail mora no cartão da ata, que só existe depois de transcrever
  b.verdade('assinante ganha o botão de enviar por e-mail', !(await p.isHidden('#enviarEmail')));

  await p.evaluate(() => { document.getElementById('iaMsg').textContent = ''; });
  await p.click('#iaPendencias');
  await p.waitForFunction(() => /pronto|Não consegui/.test(document.getElementById('iaMsg').textContent), null, { timeout: 30000 });

  const pedido = enviados.filter(e => e.tipo === 'resumo').pop();
  b.verdade('o resumo do servidor entra na ata',
            /RESUMO DO SALAVOX/.test(await p.evaluate(() =>
              (window.__salavox.resumos().find(r => r.chave === 'pendencias') || {}).texto || '')));
  b.verdade('a chamada leva o token de quem pediu', /^Bearer token-de-teste$/.test(pedido.auth || ''));
  b.verdade('o que sai é o texto da ata, com a instrução da tarefa',
            /decisões/i.test(pedido.corpo.prompt) && /PARTICIPANTES|VOCÊ/.test(pedido.corpo.prompt));
  b.verdade('para o assinante a cota do mês aparece na tela',
            /restam .*29.* resumos neste mês/.test(await p.textContent('#iaMotorMsg')));
  b.conferir('e o modelo preciso é liberado',
             await p.evaluate(() =>
               document.querySelector('#iaModeloSalavox option[value="preciso"]').disabled), false);

  /* ---------- 3b. o resumo chega ao PDF e ao texto ---------- */
  const texto = await p.evaluate(() => window.__salavox.comoTexto());
  b.verdade('o resumo entra no texto exportado', /RESUMO DO SALAVOX/.test(texto));

  const espera = p.waitForEvent('download', { timeout: 60000 });
  await p.click('#baixarPdf');
  const arq = await espera;
  const fluxo = await arq.createReadStream();
  let tam = 0;
  for await (const parte of fluxo) tam += parte.length;
  b.entre('o PDF com o resumo sai (bytes)', tam, 3000, 3000000);

  /* Só o nosso servidor. Houve aqui um modo com a chave de um serviço de
     terceiro e outro falando com um modelo local na porta 11434; os dois foram
     fechados, e este é o teste que impede alguém de reabrir qualquer saída sem
     perceber. */
  const forasteiros = pedidos.filter(u => !/127\.0\.0\.1|localhost|projeto-de-teste\.supabase\.co/.test(u));
  b.conferir('a página não fala com mais ninguém', forasteiros, []);

  /* ---------- 4. o que fica guardado no navegador ---------- */
  const guardado = await p.evaluate(() => {
    const tudo = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      tudo[k] = localStorage.getItem(k);
    }
    return tudo;
  });
  b.conferir('a única coisa guardada é a sessão', Object.keys(guardado), ['salavox.sessao']);
  b.verdade('nenhum pedaço da reunião fica no navegador',
            !/PARTICIPANTES|Trecho \d|RESUMO DO SALAVOX/.test(JSON.stringify(guardado)));

  await p.click('#contaSair');
  await p.waitForTimeout(200);
  b.conferir('sair apaga a sessão',
             await p.evaluate(() => localStorage.getItem('salavox.sessao')), null);
  b.verdade('sem entrar na conta não há botão de IA nenhum', await p.isHidden('#iaAcoes'));
  b.verdade('e o cartão convida a entrar para experimentar',
            /3 resumos para experimentar/.test(await p.textContent('#iaEstado')));

  await p.close();
  return b;
}
