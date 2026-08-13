/* Conta, plano e a IA do Salavox — agora em duas telas.

   O cadastro morava dentro da ferramenta, acima do passo 1, e era a primeira
   coisa que alguém via ao abrir para gravar uma reunião. Mudou para `/conta`.
   Sobrou no aplicativo uma faixa fina que diz quem está logado e quanto resta.

   O que este bloco guarda:

   1. Sem `/config.json` preenchido a ferramenta continua inteira e sem cadastro.
      É o estado de quem baixa o código e serve sozinho, e é o padrão.
   2. O que sai daqui é o texto da ata — e o teste inspeciona o corpo da
      requisição para confirmar que é isso, com o token junto.
   3. O texto da reunião nunca é gravado no navegador. A sessão, sim.
   4. **O navegador não libera plano nenhum.** Criar a cobrança não muda o
      plano; quem escreve a validade é o webhook, no servidor. */

import { telaFalsa, paginaLimpa, bloco, transcrever } from './apoio.mjs';

const SUPA = 'https://projeto-de-teste.supabase.co';

/* A resposta que o modelo devolve numa passada só. O formato é o contrato:
   se ele mudar sem que a leitura mude junto, o cartão fica com um bloco só,
   cheio de "##", e o e-mail nunca aparece. */
const RESPOSTA_ATA = [
  '## RESUMO',
  'RESUMO DO SALAVOX: três decisões e duas pendências. (00:12)',
  '',
  '## DECISÕES',
  '- fechar o balanço na sexta (00:20)',
  '',
  '## PENDÊNCIAS',
  '- mandar o extrato — Maria — 15/09 (00:31)',
  '',
  '## PRÓXIMOS PASSOS',
  '- marcar a conversa do mês que vem (00:40)',
  '',
  '## E-MAIL',
  'Assunto: Ata da reunião de hoje',
  '',
  'Olá, Maria. Seguem os pontos combinados hoje.'
].join('\n');

export default async function (ctx, url, erros) {
  const b = bloco('conta, plano e IA do Salavox');

  /* ---------- 1. config em branco: o produto local ---------- */
  const semConta = await paginaLimpa(ctx, erros);
  await semConta.addInitScript(telaFalsa(4));
  await semConta.goto(url + '/app');
  await semConta.waitForTimeout(500);
  b.verdade('com o config em branco a faixa de conta não aparece', await semConta.isHidden('#contaCard'));
  b.verdade('e nada é pedido ao servidor de contas',
            await semConta.evaluate(() => !window.__salavox.cfg()));
  await semConta.close();

  /* ---------- 1b. config pela metade: falar alto, não ficar mudo ---------- */
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

  /* ---------- 2. o mundo com configuração ---------- */
  const enviados = [];
  const pedidos = [];
  let plano = 'gratis', ate = null, cortesia = 7, restante = 6, assinaturaViva = null, nome = null;

  const montar = async p => {
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
      body: JSON.stringify([{ email: 'contador@exemplo.com.br', nome, plano,
                              assinante_ate: ate, criado_em: '2026-08-01T10:00:00Z' }])
    }));
    await p.route(SUPA + '/rest/v1/rpc/cortesia_restante', r => r.fulfill({
      contentType: 'application/json', body: String(cortesia) }));
    await p.route(SUPA + '/rest/v1/rpc/minha_cobranca', r => r.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ assinatura: assinaturaViva, plano, assinante_ate: ate }) }));
    await p.route(SUPA + '/rest/v1/rpc/salvar_nome', r => {
      nome = r.request().postDataJSON().p_nome;
      enviados.push({ tipo: 'nome', corpo: r.request().postDataJSON() });
      return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ nome }) });
    });
    await p.route('**/api/assinar', r => {
      const corpo = r.request().postDataJSON();
      enviados.push({ tipo: 'assinar', corpo, auth: r.request().headers()['authorization'] });
      if (corpo.acao === 'cancelar') {
        assinaturaViva = null;
        return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ cancelada: true }) });
      }
      assinaturaViva = 'sub_9';
      return r.fulfill({ contentType: 'application/json',
        body: JSON.stringify({ assinatura: 'sub_9', pagar: url + '/pagar-de-mentira', valor: 19.90 }) });
    });
    await p.route('**/api/resumo', r => {
      const req = r.request();
      enviados.push({ tipo: 'resumo', corpo: req.postDataJSON(), auth: req.headers()['authorization'] });
      if (plano === 'gratis' && cortesia <= 0) {
        return r.fulfill({ status: 402, contentType: 'application/json',
          body: JSON.stringify({ assinar: true,
            erro: 'seus resumos de cortesia acabaram — o plano profissional tem 30 por mês, R$ 19,90' }) });
      }
      return r.fulfill({ contentType: 'application/json',
        body: JSON.stringify({ texto: RESPOSTA_ATA,
                               restante: plano === 'gratis' ? restante : 29 }) });
    });
    await p.route('**/api/enviar-ata', r => {
      enviados.push({ tipo: 'email', corpo: r.request().postDataJSON() });
      return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ enviados: 2 }) });
    });
  };

  /* ---------- 3. a página de conta ---------- */
  const c = await paginaLimpa(ctx, erros);
  await montar(c);
  await c.goto(url + '/conta');
  await c.waitForFunction(() => !!window.__conta, null, { timeout: 15000 });
  b.verdade('sem sessão, a página de conta oferece entrar', !(await c.isHidden('#entrar')));
  b.verdade('e não mostra dado nenhum', await c.isHidden('#dentro'));

  await c.fill('#email', 'contador@exemplo.com.br');
  await c.click('#pedirLink');
  await c.waitForFunction(() => /Link enviado|não consegui/.test(document.getElementById('entrarMsg').textContent),
                          null, { timeout: 15000 });
  b.verdade('pedir o link não pede senha nenhuma',
            /Link enviado/.test(await c.textContent('#entrarMsg')) &&
            enviados.some(e => e.tipo === 'otp' && e.corpo.email === 'contador@exemplo.com.br' && !e.corpo.password));

  await c.goto(url + '/conta#access_token=token-de-teste&refresh_token=renova');
  await c.waitForFunction(() => !document.getElementById('dentro').classList.contains('hide'),
                          null, { timeout: 15000 });
  b.verdade('o link do e-mail entra na conta', /contador@exemplo/.test(await c.textContent('#vEmail')));
  b.verdade('o token some da barra de endereço', !(await c.evaluate(() => location.hash)));
  b.verdade('a cortesia aparece contada', /7 de 7/.test(await c.textContent('#usoTexto')));

  await c.fill('#nome', 'Leandro do Escritório');
  await c.click('#salvarNome');
  await c.waitForFunction(() => /salvo|não consegui/.test(document.getElementById('nomeMsg').textContent),
                          null, { timeout: 15000 });
  b.conferir('o nome é salvo na própria conta, sem passar por servidor nosso',
             (enviados.filter(e => e.tipo === 'nome').pop() || {}).corpo, { p_nome: 'Leandro do Escritório' });

  /* assinar: cria a cobrança e NÃO libera plano */
  b.verdade('quem está no grátis vê o botão de assinar', !(await c.isHidden('#assinar')));
  await c.click('#assinar');
  await c.fill('#cobNome', 'Escritório Teste');
  await c.fill('#cobDoc', '123');
  await c.click('#cobConfirmar');
  await c.waitForTimeout(300);
  b.verdade('documento curto é barrado antes de sair do navegador',
            /11 dígitos/.test(await c.textContent('#planoMsg')) &&
            !enviados.some(e => e.tipo === 'assinar'));

  await c.fill('#cobDoc', '390.533.447-05');
  const abriu = ctx.waitForEvent('page', { timeout: 15000 }).catch(() => null);
  await c.click('#cobConfirmar');
  await c.waitForFunction(() => /Cobrança criada|err/.test(document.getElementById('planoMsg').innerHTML),
                          null, { timeout: 15000 });
  const pedido = enviados.filter(e => e.tipo === 'assinar').pop();
  b.conferir('o pedido leva nome e documento como digitados',
             { acao: pedido.corpo.acao, nome: pedido.corpo.nome, documento: pedido.corpo.documento },
             { acao: 'assinar', nome: 'Escritório Teste', documento: '390.533.447-05' });
  const popup = await abriu;
  b.verdade('a tela de pagamento abre em outra aba', !!popup && /pagar-de-mentira/.test(popup.url()));
  if (popup) await popup.close();
  b.verdade('e o plano NÃO muda no navegador ao criar a cobrança',
            /gratis/.test(await c.textContent('#vPlano')));

  /* vira assinante */
  plano = 'profissional';
  ate = new Date(Date.now() + 30 * 86400000).toISOString();
  await c.reload();
  await c.waitForFunction(() => !document.getElementById('dentro').classList.contains('hide'),
                          null, { timeout: 15000 });
  b.verdade('assinante vê o plano e a validade', /profissional/.test(await c.textContent('#vPlano')));
  b.verdade('e ganha o botão de cancelar', !(await c.isHidden('#cancelar')));

  c.on('dialog', d => d.accept());
  await c.click('#cancelar');
  await c.waitForFunction(() => /cancelada|err/.test(document.getElementById('planoMsg').innerHTML),
                          null, { timeout: 15000 });
  b.conferir('cancelar manda só a ação, sem dado de ninguém',
             (enviados.filter(e => e.tipo === 'assinar').pop()).corpo, { acao: 'cancelar' });
  b.verdade('e a tela diz que o já pago continua valendo',
            /até o fim do período já pago/.test(await c.textContent('#planoMsg')));
  await c.close();

  /* ---------- 4. o aplicativo, com a sessão já criada ----------
     De volta ao grátis: a parte 3 assinou para testar o cancelamento, e sem
     desfazer isso o "e-mail continua fora do grátis" testaria um assinante. */
  plano = 'gratis'; ate = null;
  const p = await paginaLimpa(ctx, erros);
  await montar(p);
  await p.addInitScript(telaFalsa(4));
  /* A sessão da parte 3 ficou no localStorage — mesma origem, mesmo contexto.
     Sem limpar, esta página nasceria logada e o teste de "sem conta" mediria
     um usuário logado. */
  await p.addInitScript(() => { try { localStorage.removeItem('salavox.sessao'); } catch (e) {} });
  /* Começa deslogado de propósito: é assim que dá para ver o cartão da IA
     existindo sem os botões. Com a sessão já pronta, o cartão nasce liberado
     e um defeito que libera cedo demais passaria despercebido. */
  await p.goto(url + '/app');
  await p.waitForFunction(() => !document.getElementById('contaCard').classList.contains('hide'),
                          null, { timeout: 15000 });
  b.verdade('cadastro e cobrança não estão mais no meio do caminho',
            await p.evaluate(() => !document.getElementById('cobDoc') && !document.getElementById('assinar')));

  await p.check('#okConsent');
  await p.click('#rec');
  await p.waitForFunction(() => !document.getElementById('stop').classList.contains('hide'), null, { timeout: 20000 });
  await p.waitForTimeout(11000);
  await p.click('#stop');
  await p.waitForFunction(() => /pronta|vazia/.test(document.getElementById('recMsg').textContent), null, { timeout: 60000 });
  await transcrever(p);

  b.verdade('sem conta, o cartão da IA aparece e os botões não',
            !(await p.isHidden('#iaCard')) && await p.isHidden('#iaAcoes'));
  b.verdade('e o cartão diz onde entrar', /sua conta/i.test(await p.textContent('#iaEstado')));

  /* O link do e-mail chegando com a aba já aberta: sem recarregar, sem perder
     a ata que acabou de ser transcrita. */
  await p.evaluate(() => { location.hash = 'access_token=token-de-teste&refresh_token=renova'; });
  await p.waitForFunction(() => !document.getElementById('iaAcoes').classList.contains('hide'),
                          null, { timeout: 15000 });
  b.verdade('a faixa do aplicativo diz quem está logado, pelo nome',
            /Leandro do Escritório/.test(await p.textContent('#contaEstado')));
  b.verdade('e leva para a página de conta',
            /\/conta$/.test(await p.getAttribute('#irConta', 'href')));
  b.verdade('com conta, os botões da IA estão disponíveis', !(await p.isHidden('#iaAcoes')));
  b.verdade('a degustação não abre o modelo caro',
            await p.evaluate(() =>
              document.querySelector('#iaModeloSalavox option[value="preciso"]').disabled));

  await p.click('#iaOrganizar');
  await p.waitForFunction(() => /organizada|Não consegui/.test(document.getElementById('iaMsg').textContent),
                          null, { timeout: 30000 });

  /* Uma passada só. Eram três botões e três cobranças; se algum dia voltarem a
     ser três chamadas, o custo por ata triplica sem ninguém notar. */
  b.conferir('a ata inteira sai de uma chamada só',
             enviados.filter(e => e.tipo === 'resumo').length, 1);

  const usado = enviados.filter(e => e.tipo === 'resumo').pop();
  b.verdade('a chamada leva o token de quem pediu', /^Bearer token-de-teste$/.test(usado.auth || ''));
  b.verdade('o que sai é o texto da ata, com o formato pedido ao modelo',
            /## PEND[ÊE]NCIAS/.test(usado.corpo.prompt) && /PARTICIPANTES|VOCÊ/.test(usado.corpo.prompt));

  const secoes = await p.evaluate(() =>
    window.__salavox.resumos().map(r => [r.chave, r.titulo, r.texto]));
  b.conferir('a resposta é cortada nas quatro seções da ata',
             secoes.map(s => s[0]), ['resumo', 'decisoes', 'pendencias', 'passos']);
  b.verdade('o resumo fica sem o título de seção grudado',
            /^RESUMO DO SALAVOX/.test((secoes[0] || [])[2] || ''));
  b.verdade('a pendência sai com responsável e prazo',
            /Maria/.test((secoes[2] || [])[2] || '') && /15\/09/.test((secoes[2] || [])[2] || ''));

  /* O e-mail não entra na ata: ele é a mensagem que leva a ata. */
  b.verdade('o e-mail não vira mais um bloco da ata',
            !secoes.some(s => s[0] === 'email'));
  b.conferir('o assunto sai da resposta, sem o rótulo',
             await p.inputValue('#emailAssunto'), 'Ata da reunião de hoje');
  b.verdade('o corpo do e-mail aparece pronto para conferir',
            /Olá, Maria/.test(await p.textContent('#emailCorpo')));
  b.verdade('e o envio por e-mail continua fora do grátis', await p.isHidden('#enviarEmail'));

  const texto = await p.evaluate(() => window.__salavox.comoTexto());
  b.verdade('o resumo entra no texto exportado', /RESUMO DO SALAVOX/.test(texto));
  b.verdade('as decisões e as pendências também', /fechar o balanço/.test(texto) && /mandar o extrato/.test(texto));
  b.verdade('mas o e-mail não vai dentro da ata', !/Olá, Maria/.test(texto));

  const espera = p.waitForEvent('download', { timeout: 60000 });
  await p.click('#baixarPdf');
  const arq = await espera;
  const fluxo = await arq.createReadStream();
  let tam = 0;
  for await (const parte of fluxo) tam += parte.length;
  b.entre('o PDF com o resumo sai (bytes)', tam, 3000, 3000000);

  /* ---------- a cortesia acabando no meio do uso ----------
     Quem recusa é o servidor, e a tela tem de acreditar nele na hora. Um
     cartão que continua dizendo "você tem 7 de cortesia" depois de um 402
     convida ao clique que vai ser recusado de novo. */
  cortesia = 0;
  await p.click('#iaOrganizar');
  await p.waitForFunction(() => /Não consegui/.test(document.getElementById('iaMsg').textContent),
                          null, { timeout: 30000 });
  b.verdade('a recusa por cota vem do servidor, com o convite para assinar',
            /cortesia acabaram/.test(await p.textContent('#iaMsg')));
  b.verdade('e o cartão para de oferecer cortesia que já acabou',
            /acabaram/.test(await p.textContent('#iaEstado')) &&
            !/Você tem/.test(await p.textContent('#iaEstado')));

  /* Só o nosso servidor. */
  const forasteiros = pedidos.filter(u => !/127\.0\.0\.1|localhost|projeto-de-teste\.supabase\.co/.test(u));
  b.conferir('a página não fala com mais ninguém', forasteiros, []);

  const guardado = await p.evaluate(() => {
    const tudo = {};
    for (let i = 0; i < localStorage.length; i++) tudo[localStorage.key(i)] = localStorage.getItem(localStorage.key(i));
    return tudo;
  });
  /* Duas chaves, e as duas são escolha de quem usa: a sessão e o idioma.
     O que não pode aparecer aqui é reunião. */
  b.conferir('só a sessão e o idioma ficam guardados',
             Object.keys(guardado).sort(), ['salavox.idioma', 'salavox.sessao']);
  b.verdade('nenhum pedaço da reunião fica no navegador',
            !/PARTICIPANTES|Trecho \d|RESUMO DO SALAVOX/.test(JSON.stringify(guardado)));

  await p.close();

  /* ---------- 5. assinante: o e-mail sai daqui, com a ata junto ----------
     Precisa de outra página porque o plano é lido uma vez, na entrada, e o
     que muda o comportamento é o plano — não um botão. */
  plano = 'profissional';
  ate = new Date(Date.now() + 30 * 86400000).toISOString();
  const a = await paginaLimpa(ctx, erros);
  await montar(a);
  await a.addInitScript(telaFalsa(4));
  await a.goto(url + '/app#access_token=token-de-teste&refresh_token=renova');
  await a.check('#okConsent');
  await a.click('#rec');
  await a.waitForFunction(() => !document.getElementById('stop').classList.contains('hide'), null, { timeout: 20000 });
  await a.waitForTimeout(11000);
  await a.click('#stop');
  await a.waitForFunction(() => /pronta|vazia/.test(document.getElementById('recMsg').textContent), null, { timeout: 60000 });
  await transcrever(a);
  await a.click('#iaOrganizar');
  await a.waitForFunction(() => /organizada|Não consegui/.test(document.getElementById('iaMsg').textContent),
                          null, { timeout: 30000 });

  b.verdade('assinante ganha o botão de enviar', !(await a.isHidden('#enviarEmail')));
  await a.click('#enviarEmail');
  await a.waitForTimeout(300);
  b.verdade('sem endereço nada sai',
            /Diga para quem enviar/.test(await a.textContent('#emailMsg')) &&
            !enviados.some(e => e.tipo === 'email'));

  await a.fill('#emailPara', 'maria@empresa.com.br, joao@empresa.com.br');
  await a.click('#enviarEmail');
  await a.waitForFunction(() => /enviado|err/.test(document.getElementById('emailMsg').innerHTML),
                          null, { timeout: 15000 });
  const carta = (enviados.filter(e => e.tipo === 'email').pop() || {}).corpo || {};
  b.conferir('vai para quem foi digitado, com o assunto que a IA escreveu',
             { para: carta.para, assunto: carta.assunto },
             { para: 'maria@empresa.com.br, joao@empresa.com.br', assunto: 'Ata da reunião de hoje' });
  b.verdade('o corpo leva o e-mail da IA e a ata inteira embaixo',
            /Olá, Maria/.test(carta.corpo || '') &&
            /PARTICIPANTES|VOCÊ/.test(carta.corpo || '') &&
            (carta.corpo || '').indexOf('Olá, Maria') < (carta.corpo || '').indexOf('RESUMO DO SALAVOX'));
  await a.close();

  return b;
}
