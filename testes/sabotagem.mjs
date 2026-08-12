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
    trocas: [['await blobPcm.slice(ini * BYTES_POR_AMOSTRA, fim * BYTES_POR_AMOSTRA).arrayBuffer());',
              'await blobPcm.slice(0, (fim - ini) * BYTES_POR_AMOSTRA).arrayBuffer());']],
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
    nome: 'o resumo da IA não chega ao PDF nem ao texto',
    teste: 'conta',
    porta: 8154,
    trocas: [['  const blocosResumo = () => resumos\n', '  const blocosResumo = () => []\n']],
    pega: 'o resumo apareceria na tela e sumiria justamente no documento que vai para o cliente'
  },
  {
    nome: 'os botões da IA ficam disponíveis para quem não assinou',
    teste: 'conta',
    porta: 8155,
    trocas: [["    $('iaAcoes').classList.toggle('hide', !pago);", "    $('iaAcoes').classList.remove('hide');"]],
    pega: 'quem está no grátis clicaria, esperaria e levaria uma recusa do servidor no fim'
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
  for (const item of ['src', 'testes', 'vendor', 'build.py']) {
    fs.cpSync(path.join(RAIZ, item), path.join(destino, item), { recursive: true });
  }
  fs.mkdirSync(path.join(destino, 'public'), { recursive: true });
  /* O config.json em branco tem de vir junto. Sem ele o servidor devolve
     "nao achei" para /config.json, o teste de conta estoura ao ler o JSON e
     todas as seis sabotagens dessa área aparecem como "pegas" — pegas por um
     defeito do instrumento, não pelo defeito plantado. Isso já aconteceu, e é
     exatamente o tipo de falso verde que este arquivo existe para impedir. */
  fs.cpSync(path.join(RAIZ, 'public', 'config.json'), path.join(destino, 'public', 'config.json'));
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

  const alvo = path.join(dir, 'src', 'app.js');
  let texto = fs.readFileSync(alvo, 'utf8');
  let achouTudo = true;
  for (const [de, para] of s.trocas) {
    if (!texto.includes(de)) {
      saidas.push(`\n■ ${s.nome}\n  ✗ o trecho a alterar não existe mais no código — esta sabotagem precisa ser reescrita\n      procurava: ${de}`);
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
