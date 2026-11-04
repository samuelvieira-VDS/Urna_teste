import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIRETORIO_ORIGINAL = fileURLToPath(new URL('../../sistema-01-urna-autentica/', import.meta.url));
const DIRETORIO_COPIA = fileURLToPath(new URL('../', import.meta.url));

async function listarArquivosMonitorados(diretorio, prefixo = '') {
  const arquivos = [];
  for (const entrada of await readdir(join(diretorio, prefixo), { withFileTypes: true })) {
    if (['node_modules', 'tests', 'data', '.git'].includes(entrada.name) || entrada.name.endsWith('.md')) continue;
    const caminho = prefixo ? `${prefixo}/${entrada.name}` : entrada.name;
    if (entrada.isDirectory()) arquivos.push(...await listarArquivosMonitorados(diretorio, caminho));
    else {
      assert.ok(entrada.isFile(), `Entrada monitorada deve ser arquivo regular: ${caminho}`);
      arquivos.push(caminho);
    }
  }
  return arquivos.sort();
}

function calcularHash(conteudo) {
  return createHash('sha256').update(conteudo).digest('hex');
}

test('Árvores monitoradas têm os mesmos caminhos e somente src/votacao.js difere em SHA-256', async (contexto) => {
  const originais = await listarArquivosMonitorados(DIRETORIO_ORIGINAL);
  const copiados = await listarArquivosMonitorados(DIRETORIO_COPIA);
  assert.deepEqual(copiados, originais);
  const diferentes = [];
  for (const caminho of originais) {
    const [original, copia] = await Promise.all([
      readFile(join(DIRETORIO_ORIGINAL, caminho)), readFile(join(DIRETORIO_COPIA, caminho)),
    ]);
    const hashOriginal = calcularHash(original);
    const hashCopia = calcularHash(copia);
    if (hashOriginal !== hashCopia) {
      diferentes.push(caminho);
      contexto.diagnostic(`${caminho}: original=${hashOriginal}; cópia=${hashCopia}`);
    } else {
      assert.deepEqual(copia, original, `Conteúdo idêntico em ${caminho}`);
    }
  }
  assert.deepEqual(diferentes, ['src/votacao.js']);
});
