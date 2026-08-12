/* Os três motores de resumo.

   O que este teste protege não é a qualidade do resumo — é a promessa. Cada
   modo tem uma regra de tráfego diferente, e a mais importante é a do modo
   padrão: **nenhuma requisição sai da página**. O teste registra tudo o que o
   navegador tenta buscar e falha se aparecer qualquer coisa que não seja da
   própria origem.

   A chave de API é o outro ponto: ela não pode ser gravada em lugar nenhum. O
   teste digita uma chave e depois confere que localStorage e sessionStorage
   continuam vazios. */

import http from 'node:http';
import { telaFalsa, paginaLimpa, bloco, transcrever } from './apoio.mjs';

/* Ollama de mentira, com os mesmos cabeçalhos que o de verdade precisa mandar
   para uma página poder falar com ele. */
function ollamaFalso(porta = 11434) {
  const s = http.createServer((req, res) => {
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'content-type',
      'Access-Control-Allow-Private-Network': 'true',
      'Content-Type': 'application/json'
    };
    if (req.method === 'OPTIONS') { res.writeHead(204, cors); res.end(); return; }
    if (req.url === '/api/tags') {
      res.writeHead(200, cors);
      res.end(JSON.stringify({ models: [{ name: 'llama3.2:3b' }, { name: 'qwen2.5:7b' }] }));
      return;
    }
    if (req.url === '/api/generate') {
      let corpo = '';
      req.on('data', d => { corpo += d; });
      req.on('end', () => {
        const pedido = JSON.parse(corpo || '{}');
        res.writeHead(200, cors);
        res.end(JSON.stringify({
          response: 'RESUMO LOCAL. Modelo: ' + pedido.model +
                    '. Tamanho do prompt: ' + (pedido.prompt || '').length + ' caracteres.'
        }));
      });
      return;
    }
    res.writeHead(404, cors); res.end('{}');
  });
  return new Promise(ok => s.listen(porta, '127.0.0.1', () => ok({
    fechar: () => new Promise(r => s.close(r))
  })));
}

export default async function (ctx, url, erros) {
  const b = bloco('resumo por IA nos três motores');
  const ollama = await ollamaFalso();
  const p = await paginaLimpa(ctx, erros);

  /* tudo o que a página pedir para fora fica registrado aqui */
  const pedidos = [];
  p.on('request', r => {
    const u = r.url();
    if (!u.startsWith(url) && !u.startsWith('data:') && !u.startsWith('blob:')) pedidos.push(r.method() + ' ' + u);
  });

  await p.addInitScript(telaFalsa(4));
  await p.route('https://api.exemplo-de-ia.com/**', r => r.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ choices: [{ message: { content: 'RESUMO REMOTO devolvido pelo serviço.' } }] })
  }));
  await p.goto(url + '/app');

  await p.check('#okConsent');
  await p.click('#rec');
  await p.waitForFunction(() => !document.getElementById('stop').classList.contains('hide'), null, { timeout: 20000 });
  await p.waitForTimeout(12000);
  await p.click('#stop');
  await p.waitForFunction(() => /pronta|vazia/.test(document.getElementById('recMsg').textContent), null, { timeout: 60000 });
  await transcrever(p);

  b.verdade('o cartão de resumo aparece junto com a ata', !(await p.isHidden('#iaCard')));

  /* ---------- 1. modo padrão: só o prompt, nada sai ---------- */
  const antes = pedidos.length;
  await p.click('#iaResumo');
  await p.waitForFunction(() => document.querySelectorAll('#iaSaida .resumo').length > 0, null, { timeout: 15000 });

  const prompt = await p.evaluate(() => window.__salavox.resumos()[0].texto);
  b.verdade('o prompt traz a instrução da tarefa', /resumo executivo/i.test(prompt));
  b.verdade('o prompt traz a transcrição junto', /VOCÊ|PARTICIPANTES/.test(prompt));
  b.verdade('o prompt manda citar o instante', /mm:ss/.test(prompt));
  b.conferir('o modo padrão não faz nenhuma requisição para fora', pedidos.length - antes, 0);
  b.conferir('o prompt não entra no PDF: ele não é a ata',
             await p.evaluate(() => window.__salavox.resumos()[0].noPdf), false);

  /* ---------- 2. Ollama: sai da aba, não sai da máquina ---------- */
  await p.selectOption('#iaMotor', 'ollama');
  await p.click('#iaProcurar');
  await p.waitForFunction(() => /encontrado|Não achei/.test(document.getElementById('iaMotorMsg').textContent), null, { timeout: 15000 });
  b.verdade('acha o Ollama e lista os modelos', /encontrado/.test(await p.textContent('#iaMotorMsg')));
  b.conferir('os modelos do Ollama viram opções',
             await p.$$eval('#iaModelo option', e => e.map(x => x.textContent)), ['llama3.2:3b', 'qwen2.5:7b']);

  const marca = pedidos.length;   // o modelo de transcrição já foi buscado antes; conta daqui
  await p.click('#iaPendencias');
  await p.waitForFunction(() => /pronto|Não consegui/.test(document.getElementById('iaMsg').textContent), null, { timeout: 30000 });
  const doOllama = await p.evaluate(() => (window.__salavox.resumos().find(r => r.chave === 'pendencias') || {}).texto);
  b.verdade('a resposta do Ollama entra na ata', /RESUMO LOCAL/.test(doOllama || ''));
  b.verdade('o prompt chegou inteiro ao modelo', /Tamanho do prompt: [1-9]\d{2,}/.test(doOllama || ''));
  const noOllama = pedidos.slice(marca);
  b.verdade('no modo Ollama o texto só vai para o próprio computador',
            noOllama.length > 0 && noOllama.every(u => /127\.0\.0\.1|localhost/.test(u)));

  /* ---------- 3. chave: só depois de confirmar, e sem guardar a chave ---------- */
  await p.selectOption('#iaMotor', 'chave');
  await p.fill('#iaBase', 'https://api.exemplo-de-ia.com/v1');
  await p.fill('#iaNome', 'modelo-de-teste');
  await p.fill('#iaSegredo', 'chave-secreta-que-nao-pode-vazar');

  await p.click('#iaEmail');
  // aceita qualquer desfecho e depois julga: se a trava for removida, o teste
  // precisa falhar com nome, não estourar o tempo esperando uma mensagem que
  // nunca vai vir
  await p.waitForFunction(
    () => /marque a confirmação|Não consegui|pronto/.test(document.getElementById('iaMsg').textContent) ||
          document.querySelectorAll('#iaSaida .resumo').length > 1,
    null, { timeout: 20000 }).catch(() => {});
  b.verdade('sem a confirmação, não envia nada', /marque a confirmação/.test(await p.textContent('#iaMsg')));

  await p.check('#iaOk');
  await p.click('#iaEmail');
  await p.waitForFunction(() => /pronto|Não consegui/.test(document.getElementById('iaMsg').textContent), null, { timeout: 30000 });
  const doServico = await p.evaluate(() => (window.__salavox.resumos().find(r => r.chave === 'email') || {}).texto);
  b.verdade('a resposta do serviço entra na ata', /RESUMO REMOTO/.test(doServico || ''));

  const guardado = await p.evaluate(() => {
    const tudo = [];
    for (let i = 0; i < localStorage.length; i++) tudo.push(localStorage.getItem(localStorage.key(i)));
    for (let i = 0; i < sessionStorage.length; i++) tudo.push(sessionStorage.getItem(sessionStorage.key(i)));
    return tudo.join('|') + '|' + document.cookie;
  });
  b.verdade('a chave não é gravada em lugar nenhum', guardado.indexOf('chave-secreta') < 0);
  b.conferir('nada é gravado no navegador, ponto', guardado.replace(/\|/g, ''), '');

  /* ---------- o resumo chega ao PDF e ao texto ---------- */
  const texto = await p.evaluate(() => window.__salavox.comoTexto());
  b.verdade('o resumo do Ollama entra no texto exportado', /RESUMO LOCAL/.test(texto));
  b.verdade('o prompt não entra no texto exportado', texto.indexOf('Tamanho do prompt') === texto.lastIndexOf('Tamanho do prompt'));

  const espera = p.waitForEvent('download', { timeout: 60000 });
  await p.click('#baixarPdf');
  const arq = await espera;
  const fluxo = await arq.createReadStream();
  let tam = 0;
  for await (const parte of fluxo) tam += parte.length;
  b.entre('o PDF com resumo sai (bytes)', tam, 3000, 3000000);

  await p.close();
  await ollama.fechar();
  return b;
}
