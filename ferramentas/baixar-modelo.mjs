/* Espelha um modelo de transcrição para public/modelos/, para servi-lo do
   próprio domínio em vez da CDN pública.

   Por que isso existe: rede de escritório costuma bloquear CDN de terceiro, e o
   primeiro uso — justamente quando a pessoa decide se fica ou desiste — é o que
   quebra. Servindo do nosso domínio, quem consegue abrir a página consegue usar.

   Rode na SUA máquina, que tem internet:
     node ferramentas/baixar-modelo.mjs onnx-community/whisper-base
     node ferramentas/baixar-modelo.mjs onnx-community/whisper-small

   Depois é só publicar: os arquivos ficam em public/modelos/<repositório>/ e o
   aplicativo passa a preferi-los sozinho.

   Antes de publicar, confira o tamanho que ele imprime no fim contra os limites
   do seu plano na hospedagem — modelo é arquivo grande, e cada primeiro acesso
   de cliente vira banda que você paga. */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DESTINO = path.join(RAIZ, 'public', 'modelos');
const repo = process.argv[2];

if (!repo) {
  console.error('uso: node ferramentas/baixar-modelo.mjs <repositório no Hugging Face>');
  process.exit(1);
}

/* Só o que a transcrição usa. Baixar o repositório inteiro traz pesos em
   formatos que nunca serão pedidos e multiplica o tamanho por três. */
const INTERESSA = /\.(json|txt)$|^onnx\/.*\.(onnx|onnx_data)$/;
const DISPENSA = /_fp16|_int8|_uint8|_bnb4|_q4f16/;

const api = `https://huggingface.co/api/models/${repo}`;
console.log('lendo a lista de arquivos de', repo);
const info = await (await fetch(api)).json();
if (!info || !info.siblings) { console.error('não consegui ler o repositório'); process.exit(1); }

const arquivos = info.siblings
  .map(s => s.rfilename)
  .filter(n => INTERESSA.test(n) && !DISPENSA.test(n));

console.log(arquivos.length, 'arquivos a espelhar');
let total = 0;

for (const nome of arquivos) {
  const destino = path.join(DESTINO, repo, nome);
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  const url = `https://huggingface.co/${repo}/resolve/main/${nome}`;
  const r = await fetch(url);
  if (!r.ok) { console.log('  pulei', nome, r.status); continue; }
  const buf = Buffer.from(await r.arrayBuffer());
  fs.writeFileSync(destino, buf);
  total += buf.length;
  console.log('  ' + nome, (buf.length / 1048576).toFixed(1) + ' MB');
}

/* O manifesto é o que o aplicativo consulta para saber se pode preferir o
   espelho. Sem ele, tudo segue funcionando pela CDN. */
const manifesto = path.join(DESTINO, 'pronto.json');
const antes = fs.existsSync(manifesto) ? JSON.parse(fs.readFileSync(manifesto, 'utf8')) : { modelos: [] };
if (antes.modelos.indexOf(repo) < 0) antes.modelos.push(repo);
fs.writeFileSync(manifesto, JSON.stringify(antes, null, 2));

console.log(`\npronto: ${(total / 1048576).toFixed(0)} MB em public/modelos/${repo}`);
console.log('manifesto:', antes.modelos.join(', '));
console.log('\nconfira o limite de tamanho e de banda do seu plano antes de publicar.');
