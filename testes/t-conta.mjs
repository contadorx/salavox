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

  /* ---------- 1. config.json em branco: o produto local, que é o padrão ----------
     O arquivo VAI no repositório, com os campos vazios. Vazio tem de ser igual a
     não existir: nada de conta, nada de camada paga. */
  const semConta = await paginaLimpa(ctx, erros);
  await semConta.addInitScript(telaFalsa(4));
  await semConta.goto(url + '/app');
  await semConta.waitForTimeout(500);
  b.verdade('o config.json que vai no repositório está em branco',
            await semConta.evaluate(async () => {
              const c = await (await fetch('/config.json')).json();
              return c && !c.supabaseUrl && !c.supabaseAnonKey;
            }));
  b.verdade('com o config em branco o cartão de conta não aparece', await semConta.isHidden('#contaCard'));
  b.conferir('com o config em branco a IA do Salavox nem é oferecida',
             await semConta.$$eval('#iaMotor option', e => e.map(o => o.value)),
             ['prompt', 'ollama', 'chave']);
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
  let plano = 'gratis', ate = null;

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
  await p.route('**/api/resumo', r => {
    const req = r.request();
    enviados.push({ tipo: 'resumo', corpo: req.postDataJSON(), auth: req.headers()['authorization'] });
    if (plano === 'gratis') {
      return r.fulfill({ status: 402, contentType: 'application/json',
        body: JSON.stringify({ erro: 'a cota de resumos deste mês acabou — ou a assinatura não está ativa' }) });
    }
    return r.fulfill({ contentType: 'application/json',
      body: JSON.stringify({ texto: 'RESUMO DO SALAVOX: três decisões e duas pendências.', restante: 29 }) });
  });
  await p.route('**/api/enviar-ata', r => {
    enviados.push({ tipo: 'email', corpo: r.request().postDataJSON() });
    return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ enviados: 2 }) });
  });

  await p.addInitScript(telaFalsa(4));
  await p.goto(url + '/app');
  await p.waitForFunction(() => !document.getElementById('contaCard').classList.contains('hide'), null, { timeout: 15000 });
  b.verdade('com configuração o cartão de conta aparece', true);
  b.verdade('a IA do Salavox entra na lista de motores',
            (await p.$$eval('#iaMotor option', e => e.map(o => o.value))).includes('salavox'));

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
  b.verdade('o botão de enviar por e-mail fica escondido no grátis', await p.isHidden('#enviarEmail'));

  /* ---------- 3. grava, transcreve e pede o resumo ---------- */
  await p.check('#okConsent');
  await p.click('#rec');
  await p.waitForFunction(() => !document.getElementById('stop').classList.contains('hide'), null, { timeout: 20000 });
  await p.waitForTimeout(11000);
  await p.click('#stop');
  await p.waitForFunction(() => /pronta|vazia/.test(document.getElementById('recMsg').textContent), null, { timeout: 60000 });
  await transcrever(p);

  await p.selectOption('#iaMotor', 'salavox');
  await p.click('#iaResumo');
  await p.waitForFunction(() => /pronto|Não consegui/.test(document.getElementById('iaMsg').textContent), null, { timeout: 30000 });
  b.verdade('no grátis a recusa é clara, não erro genérico',
            /cota|assinatura/.test(await p.textContent('#iaMsg')));

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

  await p.selectOption('#iaMotor', 'salavox');
  await p.click('#iaPendencias');
  await p.waitForFunction(() => /pronto|Não consegui/.test(document.getElementById('iaMsg').textContent), null, { timeout: 30000 });

  const pedido = enviados.filter(e => e.tipo === 'resumo').pop();
  b.verdade('o resumo do servidor entra na ata',
            /RESUMO DO SALAVOX/.test(await p.evaluate(() =>
              (window.__salavox.resumos().find(r => r.chave === 'pendencias') || {}).texto || '')));
  b.verdade('a chamada leva o token de quem pediu', /^Bearer token-de-teste$/.test(pedido.auth || ''));
  b.verdade('o que sai é o texto da ata, com a instrução da tarefa',
            /decisões/i.test(pedido.corpo.prompt) && /PARTICIPANTES|VOCÊ/.test(pedido.corpo.prompt));
  b.verdade('a cota que sobrou aparece na tela', /restam/.test(await p.textContent('#iaMotorMsg')));

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

  await p.close();
  return b;
}
