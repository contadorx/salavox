/* Auditor que só sabe dizer "ok" não é trava.

   Este arquivo quebra o aplicativo de propósito, de quatro maneiras diferentes,
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
    nome: 'controle: um segundo e meio entre ligar o áudio e começar a gravar',
    teste: 'pedacos',
    porta: 8142,
    espera: 'passar',
    trocas: [['gravador.start(10000);', 'await new Promise(r => setTimeout(r, 1500));\n    gravador.start(10000);']],
    pega: 'com a marcação no lugar, o atraso não desalinha nada'
  },
  {
    nome: 'o mesmo atraso, sem zerar o áudio cru quando o gravador começa',
    teste: 'pedacos',
    porta: 8145,
    trocas: [
      ['gravador.start(10000);', 'await new Promise(r => setTimeout(r, 1500));\n    gravador.start(10000);'],
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
  }
];

function copiar(destino) {
  fs.rmSync(destino, { recursive: true, force: true });
  fs.mkdirSync(destino, { recursive: true });
  for (const item of ['src', 'testes', 'vendor', 'build.py']) {
    fs.cpSync(path.join(RAIZ, item), path.join(destino, item), { recursive: true });
  }
  fs.mkdirSync(path.join(destino, 'public'), { recursive: true });
  fs.symlinkSync(path.join(RAIZ, 'node_modules'), path.join(destino, 'node_modules'));
}

let tudoBem = true;

for (const s of SABOTAGENS) {
  const dir = path.join('/tmp', 'sabotagem-' + s.porta);
  copiar(dir);

  const alvo = path.join(dir, 'src', 'app.js');
  let texto = fs.readFileSync(alvo, 'utf8');
  let achouTudo = true;
  for (const [de, para] of s.trocas) {
    if (!texto.includes(de)) {
      console.log(`\n■ ${s.nome}\n  ✗ o trecho a alterar não existe mais no código — esta sabotagem precisa ser reescrita`);
      console.log(`      procurava: ${de}`);
      achouTudo = false;
      break;
    }
    texto = texto.replace(de, para);
  }
  if (!achouTudo) { tudoBem = false; continue; }
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

  const quebrou = saida.split('\n').filter(l => l.includes('✗'));
  const deveFalhar = s.espera !== 'passar';
  console.log(`\n■ ${s.nome}`);
  console.log(`  ${deveFalhar ? 'o que passaria despercebido' : 'o que se espera'}: ${s.pega}`);
  if (deveFalhar && saiuComErro && quebrou.length) {
    console.log(`  ✓ a verificação "${s.teste}" pegou:`);
    quebrou.slice(0, 3).forEach(l => console.log('    ' + l.trim()));
  } else if (!deveFalhar && !saiuComErro) {
    console.log(`  ✓ a verificação "${s.teste}" passou, como esperado`);
  } else if (deveFalhar) {
    console.log(`  ✗ a verificação "${s.teste}" passou mesmo com o defeito plantado — o teste não é uma trava`);
    tudoBem = false;
  } else {
    console.log(`  ✗ a verificação "${s.teste}" falhou sem defeito plantado — o teste é instável`);
    quebrou.slice(0, 3).forEach(l => console.log('    ' + l.trim()));
    tudoBem = false;
  }
  fs.rmSync(dir, { recursive: true, force: true });
}

console.log(tudoBem
  ? '\nRESULTADO: todas as sabotagens foram pegas'
  : '\nRESULTADO: há teste que não pega o próprio defeito');
process.exit(tudoBem ? 0 : 1);
