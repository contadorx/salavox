/* Auditor que só sabe dizer "ok" não é trava.

   Este arquivo quebra o aplicativo de propósito, de um jeito diferente por cenário,
   e exige que a verificação correspondente FALHE. Se ela passar mesmo com o
   defeito plantado, quem está quebrado é o teste — e é isso que este script
   existe para descobrir.

   Cada sabotagem é feita numa cópia do projeto em /tmp. O projeto de verdade
   não é tocado. */

import { execFileSync, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import { RAIZ } from './apoio.mjs';

const rodar = promisify(execFile);

const SABOTAGENS = [
  {
    nome: 'limiar de mudança de cena impossível de atingir',
    teste: 'telas',
    porta: 8141,
    trocas: [['const limiar = 5.5;', 'const limiar = 500;']],
    pega: 'nenhuma tela seria detectada e a ata sairia sem as telas'
  },
  {
    // Controle do experimento seguinte. Sozinho, remover a marcação não muda
    // nada mensurável aqui, porque neste ambiente o áudio e o gravador começam
    // quase juntos. No computador de quem usa há diálogo de permissão e limpeza
    // do disco no meio — segundos, não milissegundos. Este par reproduz isso.
    nome: 'controle: três segundos entre ligar o áudio e começar a gravar',
    teste: 'pedacos',
    porta: 8142,
    espera: 'passar',
    trocas: [['gravador.start(10000);', 'await new Promise(r => setTimeout(r, 3000));\n    gravador.start(10000);']],
    pega: 'com a marcação no lugar, o atraso não desalinha nada'
  },
  {
    nome: 'o mesmo atraso, sem zerar o áudio cru quando o gravador começa',
    teste: 'pedacos',
    porta: 8145,
    trocas: [
      ['gravador.start(10000);', 'await new Promise(r => setTimeout(r, 3000));\n    gravador.start(10000);'],
      ['marcarInicioPcm();              // zera o áudio cru no mesmo instante do vídeo', '/* sabotado */']
    ],
    pega: 'o áudio ficaria mais longo que o vídeo e as telas cairiam no minuto errado da ata'
  },
  {
    nome: 'pedaços guardados na memória em vez do disco',
    teste: 'recuperacao',
    porta: 8143,
    trocas: [['let n = 0, bytes = 0, disco = TEM_OPFS,', 'let n = 0, bytes = 0, disco = false,']],
    pega: 'a gravação sairia perfeita ao encerrar e sumiria inteira se a aba caísse'
  },
  {
    nome: 'transcrição lê sempre a primeira fatia',
    teste: 'pedacos',
    porta: 8144,
    trocas: [['    await blobPcm.slice(ini * BYTES_POR_AMOSTRA, fim * BYTES_POR_AMOSTRA).arrayBuffer());',
              '    await blobPcm.slice(0, (fim - ini) * BYTES_POR_AMOSTRA).arrayBuffer());']],
    pega: 'toda a reunião viraria repetição dos primeiros trinta segundos'
  },
  {
    nome: 'nome escolhido para a fala é ignorado',
    teste: 'extras',
    porta: 8146,
    trocas: [['const rotulo = f => f.nome || rotuloPadrao(f);', 'const rotulo = f => rotuloPadrao(f);']],
    pega: 'renomear quem falou pareceria funcionar na tela e sumiria no PDF e no texto'
  },
  {
    nome: 'momentos marcados fora da linha do tempo',
    teste: 'extras',
    porta: 8147,
    trocas: [['.concat(momentos.map((m, i) => ({ tipo: \'momento\', t: m, i })));', ';']],
    pega: 'marcar um momento durante a reunião não deixaria rastro nenhum na ata'
  },
  {
    nome: 'arquivo importado entra no canal errado',
    teste: 'extras',
    porta: 8148,
    trocas: [['bloco[i*2+1] = v * 32767;        // canal dos participantes',
              'bloco[i*2] = v * 32767;']],
    pega: 'o arquivo seria lido como silêncio e a ata sairia vazia sem dizer por quê'
  },
  {
    nome: '"detectar o idioma" força português assim mesmo',
    teste: 'extras',
    porta: 8149,
    trocas: [['if (idioma) opts.language = idioma;', "opts.language = idioma || 'pt';"]],
    pega: 'reunião em inglês ou espanhol sairia transcrita como se fosse português'
  },
  {
    nome: 'vocabulário com régua frouxa',
    teste: 'conformidade',
    porta: 8150,
    trocas: [['const folga = termo => termo.length <= 5 ? 0 : termo.length <= 8 ? 1 : termo.length <= 13 ? 2 : 3;',
              'const folga = termo => 5;']],
    pega: 'o vocabulário passaria a trocar palavra certa por termo parecido e estragaria a ata'
  },
  {
    nome: 'correção feita à mão não é guardada',
    teste: 'conformidade',
    porta: 8151,
    trocas: [['if (novo && novo !== f.texto) { f.texto = novo; f.corrigida = true; }',
              'if (false) { f.texto = novo; }']],
    pega: 'corrigir o texto na tela pareceria funcionar e o PDF sairia com o erro'
  },
  {
    nome: 'registro de consentimento sem a hora de início',
    teste: 'conformidade',
    porta: 8152,
    trocas: [['if (consentimento) consentimento.iniciado = agora();', '/* sabotado */']],
    pega: 'a ata sairia sem o registro, que é justamente o que o cliente regulado precisa guardar'
  },
  {
    nome: '"ata em inglês" não pede tradução',
    teste: 'conformidade',
    porta: 8153,
    trocas: [["const opts = { return_timestamps: true, task: $('saida').value };",
              "const opts = { return_timestamps: true, task: 'transcribe' };"]],
    pega: 'escolher inglês não mudaria nada e a ata sairia em português assim mesmo'
  },
  {
    nome: 'a peneira de silêncio volta a olhar só o pico da janela',
    teste: 'silencio',
    porta: 8163,
    trocas: [['    return n >= QUADROS_MIN;', '    return true;']],
    pega: 'trinta segundos de quase-silêncio iriam ao modelo, que devolveria conversa inventada'
  },
  {
    nome: 'canal mudo é mandado ao modelo assim mesmo',
    teste: 'silencio',
    porta: 8164,
    trocas: [['  const canalMudo = alto => alto < 0.01;', '  const canalMudo = alto => false;']],
    pega: 'o microfone fechado voltaria a produzir falas — foi assim que 88 "O que é isso?" entraram numa ata'
  },
  {
    nome: 'o filtro de laço para de descartar repetição',
    teste: 'silencio',
    porta: 8165,
    trocas: [['        if (j - i >= 3 && k.length <= 140) for (let n = i; n < j; n++) fora.add(meu[n]);',
              '        /* sabotado */']],
    pega: 'o modelo preso em laço encheria a ata com a mesma frase, e ninguém veria o número descartado'
  },
  {
    nome: 'o botão de fechar o microfone só troca o rótulo',
    teste: 'silencio',
    porta: 8166,
    trocas: [['        t.enabled = !t.enabled;', '        const _ = !t.enabled;']],
    pega: 'quem clicasse achando que parou de ser gravado continuaria sendo gravado'
  },
  {
    nome: 'fonte que não registrou som nenhum passa em silêncio',
    teste: 'silencio',
    porta: 8167,
    trocas: [["      if (medeMic && medeMic.maior < 3) paradas.push('o seu microfone');", '      /* sabotado */']],
    pega: 'só depois de dez minutos de transcrição alguém descobriria que o microfone estava fechado'
  },
  {
    nome: 'a margem do painel é calculada sobre o custo, não sobre a receita',
    teste: 'painel',
    porta: 8170,
    arquivo: 'public/painel.html',
    trocas: [['const margem = m.receita_mensal ? (m.receita_mensal - custoBrl) / m.receita_mensal * 100 : null;',
              'const margem = m.receita_mensal ? (m.receita_mensal - custoBrl) / custoBrl * 100 : null;']],
    pega: 'a decisão de preço seria tomada em cima de uma margem errada, e ninguém confere conta de painel'
  },
  {
    nome: 'a conversão é medida sobre o total de contas',
    teste: 'painel',
    porta: 8171,
    arquivo: 'public/painel.html',
    trocas: [['const conversao = n.provaram ? n.provaram_e_assinaram / n.provaram * 100 : null;',
              'const conversao = n.contas ? n.provaram_e_assinaram / n.contas * 100 : null;']],
    pega: 'a degustação pareceria converter menos do que converte, e seria cortada por engano'
  },
  {
    nome: 'o custo em dólar aparece como se fosse em reais',
    teste: 'painel',
    porta: 8172,
    arquivo: 'public/painel.html',
    trocas: [['const custoBrl = m.custo_ia_mes_usd * dolar();', 'const custoBrl = m.custo_ia_mes_usd;']],
    pega: 'o custo pareceria cinco vezes menor do que é'
  },
  {
    nome: 'o painel trata a recusa do servidor como se fossem dados',
    teste: 'painel',
    porta: 8173,
    arquivo: 'public/painel.html',
    trocas: [["    if (!r.ok) throw new Error(d.erro || ('o servidor respondeu ' + r.status));",
              '    /* sabotado */']],
    pega: 'quem não administra veria a tela do painel abrir, mesmo sem número nenhum dentro'
  },
  {
    nome: 'o painel abre para qualquer conta com sessão válida',
    teste: 'funcoes',
    porta: 8174,
    arquivo: 'api/painel.js',
    trocas: [["  if (admins.indexOf(email) < 0) return res.status(403).json({ erro: 'esta conta não administra o Salavox' });",
              '  /* sabotado */']],
    pega: 'qualquer cliente cadastrado leria a base inteira e liberaria o próprio plano'
  },
  {
    nome: 'a cota deixa de barrar antes de a Anthropic ser chamada',
    teste: 'funcoes',
    porta: 8175,
    arquivo: 'api/resumo.js',
    trocas: [['  if (!cota.ok || restante < 0) {', '  if (false) {']],
    pega: 'cada recusa passaria a custar dinheiro, e nada na tela mudaria para denunciar isso'
  },
  {
    nome: 'o resumo da IA não chega ao PDF nem ao texto',
    teste: 'conta',
    porta: 8154,
    trocas: [['  const blocosResumo = () => resumos\n', '  const blocosResumo = () => []\n']],
    pega: 'o resumo apareceria na tela e sumiria justamente no documento que vai para o cliente'
  },
  {
    nome: 'os botões da IA aparecem sem conta nenhuma',
    teste: 'conta',
    porta: 8155,
    trocas: [["    $('iaAcoes').classList.toggle('hide', !sessao);", "    $('iaAcoes').classList.remove('hide');"]],
    pega: 'quem nem entrou clicaria, esperaria e levaria um 401 do servidor como resposta'
  },
  {
    nome: 'o modelo caro entra na degustação',
    teste: 'conta',
    porta: 8168,
    trocas: [['    if (preciso) preciso.disabled = !pago;', '    if (preciso) preciso.disabled = false;']],
    pega: 'a cortesia passaria a gastar o modelo dez vezes mais caro, de graça, para qualquer um'
  },
  {
    nome: 'a recusa por cota não muda a tela',
    teste: 'conta',
    porta: 8169,
    trocas: [["      if (r.status === 402 && !temPlano()) { cortesia = 0; desenharIa(); }", '      /* sabotado */']],
    pega: 'o cartão continuaria oferecendo resumos de cortesia que já acabaram'
  },
  {
    nome: 'o envio da ata por e-mail fica disponível no plano grátis',
    teste: 'conta',
    porta: 8156,
    trocas: [["    $('enviarEmail').classList.toggle('hide', !pago);", "    $('enviarEmail').classList.remove('hide');"]],
    pega: 'o custo de envio correria por conta de quem não paga nada'
  },
  {
    nome: 'o cartão de IA aparece na instalação sem servidor',
    teste: 'telas',
    porta: 8157,
    trocas: [["    $('iaCard').classList.toggle('hide', !(cfg && ataNaTela));",
              "    $('iaCard').classList.remove('hide');"]],
    pega: 'quem serve o código sozinho veria um cartão de resumo que do lado dele não faz nada'
  },
  {
    nome: 'tela preta do começo do compartilhamento entra na ata',
    teste: 'telas',
    porta: 8158,
    trocas: [['    return max - min < 12;', '    return false;']],
    pega: 'a ata abriria com um retângulo preto apresentado como a primeira tela da reunião'
  },
  {
    nome: 'a sessão é lida só no carregamento, não no link do e-mail',
    teste: 'conta',
    porta: 8159,
    trocas: [["    window.addEventListener('hashchange', () => { if (pegarTokens()) carregarPerfil(); });",
              '    /* sabotado */']],
    pega: 'quem clicasse no link com a aba já aberta voltaria deslogado, sem entender por quê'
  },
  {
    nome: 'a camada paga aparece sem configuração de servidor',
    teste: 'conta',
    porta: 8160,
    trocas: [['    if (!bruto || (vazio(bruto.supabaseUrl) && vazio(bruto.supabaseAnonKey))) return;',
              '    /* sabotado */']],
    pega: 'quem serve o código sozinho veria um botão de camada paga que não existe do lado dele'
  },
  {
    nome: 'o texto da reunião é guardado no navegador junto da sessão',
    teste: 'conta',
    porta: 8162,
    // plantada onde tudo já está inicializado: se fosse no início do arquivo, o
    // aplicativo quebraria por outro motivo e a sabotagem seria "pega" pelo
    // motivo errado
    trocas: [["    if (!sessao) throw new Error('entre na sua conta para usar a IA do Salavox.');",
              "    if (!sessao) throw new Error('entre na sua conta para usar a IA do Salavox.');\n    try { localStorage.setItem('rascunho', comoTexto()); } catch (e) {}"]],
    pega: 'a transcrição ficaria no disco do navegador, fora do controle de quem gravou'
  }
];

function copiar(destino) {
  fs.rmSync(destino, { recursive: true, force: true });
  fs.mkdirSync(destino, { recursive: true });
  /* O projeto inteiro, menos o que é pesado e não muda o comportamento.
     `public/` vem junto por dois motivos: o config.json em branco — sem ele o
     servidor devolve "nao achei" e o teste de conta estoura antes de chegar às
     verificações, o que já fez seis sabotagens aparecerem como "pegas" por um
     defeito do instrumento — e a página do painel, que também é sabotável. */
  for (const item of ['src', 'testes', 'vendor', 'api', 'public', 'build.py']) {
    fs.cpSync(path.join(RAIZ, item), path.join(destino, item), { recursive: true });
  }
  fs.symlinkSync(path.join(RAIZ, 'node_modules'), path.join(destino, 'node_modules'));
}

/* Também em paralelo, três de cada vez, e dá para pedir só uma área:
     node testes/sabotagem.mjs ia conformidade
   Cada cenário roda numa cópia própria do projeto, então não há disputa por
   arquivo — só pela máquina, e por isso o limite de três. */
const areas = process.argv.slice(2);
const LISTA = areas.length ? SABOTAGENS.filter(s => areas.includes(s.teste)) : SABOTAGENS;
/* Duas faixas, não três. Aqui cada cenário roda um bloco inteiro numa cópia
   própria do projeto: é o dobro do peso da suíte normal, e com três ao mesmo
   tempo o próprio controle do experimento começou a piscar. */
const LADOS = Number(process.env.LADOS || 2);
const saidas = [];
let tudoBem = true;

async function executar(s) {
  const dir = path.join('/tmp', 'sabotagem-' + s.porta);
  copiar(dir);

  /* Cada cenário diz em que arquivo planta o defeito. Era sempre src/app.js
     até o produto passar a ter servidor e painel — e trava que mora em arquivo
     que a sabotagem não alcança é trava que ninguém está conferindo. */
  const alvo = path.join(dir, s.arquivo || 'src/app.js');
  let texto = fs.readFileSync(alvo, 'utf8');
  let achouTudo = true;
  for (const [de, para] of s.trocas) {
    if (!texto.includes(de)) {
      saidas.push(`\n■ ${s.nome}\n  ✗ o trecho a alterar não existe mais em ${s.arquivo || 'src/app.js'} — esta sabotagem precisa ser reescrita\n      procurava: ${de}`);
      achouTudo = false;
      break;
    }
    texto = texto.replace(de, para);
  }
  if (!achouTudo) { tudoBem = false; return; }
  fs.writeFileSync(alvo, texto);

  let saiuComErro = false, saida = '';
  try {
    const r = await rodar('node', ['testes/rodar-tudo.mjs', s.teste],
      { cwd: dir, env: { ...process.env, PORTA: String(s.porta) }, maxBuffer: 1 << 24 });
    saida = r.stdout;
  } catch (e) {
    saiuComErro = true;
    saida = (e.stdout || '') + (e.stderr || '');
  }

  const quebrou = saida.split('\n').filter(l => l.includes('✗') && !l.startsWith('✗'));
  const deveFalhar = s.espera !== 'passar';
  const linhas = [`\n■ ${s.nome}`,
                  `  ${deveFalhar ? 'o que passaria despercebido' : 'o que se espera'}: ${s.pega}`];
  if (deveFalhar && saiuComErro && quebrou.length) {
    linhas.push(`  ✓ a verificação "${s.teste}" pegou:`);
    quebrou.slice(0, 3).forEach(l => linhas.push('    ' + l.trim()));
  } else if (!deveFalhar && !saiuComErro) {
    linhas.push(`  ✓ a verificação "${s.teste}" passou, como esperado`);
  } else if (deveFalhar && saiuComErro) {
    // saiu com erro mas sem nenhuma verificação vermelha: quem quebrou foi o
    // arcabouço, não o produto — e isso não pode ser lido como "não pegou"
    linhas.push(`  ✗ não deu para avaliar: a corrida quebrou sem chegar às verificações`);
    saida.trim().split('\n').slice(-3).forEach(l => linhas.push('    ' + l.trim()));
    tudoBem = false;
  } else if (deveFalhar) {
    linhas.push(`  ✗ a verificação "${s.teste}" passou mesmo com o defeito plantado — o teste não é uma trava`);
    tudoBem = false;
  } else {
    linhas.push(`  ✗ a verificação "${s.teste}" falhou sem defeito plantado — o teste é instável`);
    quebrou.slice(0, 3).forEach(l => linhas.push('    ' + l.trim()));
    tudoBem = false;
  }
  saidas.push(linhas.join('\n'));
  fs.rmSync(dir, { recursive: true, force: true });
}

/* Cenários do mesmo bloco NUNCA rodam juntos. A regra nasceu de três cenários
   que disputavam uma mesma porta fixa e se derrubavam: apareceram no relatório
   como sabotagens "não pegas" que na verdade nem chegaram a rodar. O servidor
   de mentira mudou desde então, a regra fica — cenário que não roda mentindo
   que passou é o pior defeito possível numa trava. */
const filas = {};
for (const s of LISTA) (filas[s.teste] = filas[s.teste] || []).push(s);
const grupos = Object.values(filas);

await Promise.all(Array.from({ length: Math.min(LADOS, grupos.length) }, async () => {
  while (grupos.length) {
    const grupo = grupos.shift();
    for (const s of grupo) await executar(s);
  }
}));
saidas.forEach(s => console.log(s));

console.log(tudoBem
  ? '\nRESULTADO: todas as sabotagens foram pegas'
  : '\nRESULTADO: há teste que não pega o próprio defeito');
process.exit(tudoBem ? 0 : 1);
