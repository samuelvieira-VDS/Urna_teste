import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open, readdir, realpath } from 'node:fs/promises';
import { extname, isAbsolute, join, relative, resolve } from 'node:path';

export const EXTENSOES_MONITORADAS = Object.freeze(['.js', '.mjs', '.cjs', '.html', '.css', '.json']);
export const PASTAS_EXCLUIDAS = Object.freeze(['data', 'tests', 'node_modules', '.git', 'coverage', 'logs', 'tmp', 'temp']);
export const ARQUIVOS_ESSENCIAIS = Object.freeze([
  'package.json', 'server.js', 'src/votacao.js', 'src/armazenamento.js',
  'public/index.html', 'public/app.js', 'public/style.css',
]);

export function compararCaminhos(primeiro, segundo) {
  return primeiro < segundo ? -1 : primeiro > segundo ? 1 : 0;
}

function excluirNome(nome) {
  return nome === '.env' || nome.startsWith('.env.') || nome === 'manifesto-confiavel.json' ||
    /(?:\.log|\.tmp|\.temp|\.swp|~)(?:\.|$)/i.test(nome);
}

export function validarCaminhoSeguro(caminho) {
  if (typeof caminho !== 'string' || !caminho || isAbsolute(caminho) ||
      /[\\:\u0000-\u001f\u007f]/u.test(caminho) ||
      caminho.split('/').some((parte) => !parte || parte === '.' || parte === '..')) {
    throw new Error('Caminho relativo inválido ou inseguro no manifesto.');
  }
  if (caminho.split('/').some((parte) => PASTAS_EXCLUIDAS.includes(parte) || excluirNome(parte)) ||
      !EXTENSOES_MONITORADAS.includes(extname(caminho))) {
    throw new Error(`Caminho fora da política de monitoramento: ${caminho}`);
  }
  return caminho;
}

export async function calcularHashArquivo(caminho) {
  const arquivo = await open(caminho, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    if (!(await arquivo.stat()).isFile()) throw new Error('A entrada não é um arquivo regular.');
    return createHash('sha256').update(await arquivo.readFile()).digest('hex');
  } finally {
    await arquivo.close();
  }
}

export async function listarArquivosMonitorados(diretorio) {
  const raiz = resolve(diretorio);
  const informacao = await lstat(raiz);
  if (informacao.isSymbolicLink() || !informacao.isDirectory()) {
    throw new Error('A raiz analisada deve ser um diretório real, sem link simbólico.');
  }
  const raizReal = await realpath(raiz);
  const arquivos = Object.create(null);
  async function visitar(prefixo) {
    const pasta = join(raiz, prefixo);
    const deslocamento = relative(raizReal, await realpath(pasta));
    if (deslocamento === '..' || deslocamento.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) || isAbsolute(deslocamento)) {
      throw new Error('Diretório fora da raiz analisada.');
    }
    const entradas = await readdir(pasta, { withFileTypes: true });
    entradas.sort((primeira, segunda) => compararCaminhos(primeira.name, segunda.name));
    for (const entrada of entradas) {
      if (PASTAS_EXCLUIDAS.includes(entrada.name) || excluirNome(entrada.name)) continue;
      const caminho = prefixo ? `${prefixo}/${entrada.name}` : entrada.name;
      const completo = join(raiz, caminho);
      const estado = await lstat(completo);
      if (estado.isSymbolicLink()) throw new Error(`Link simbólico recusado: ${caminho}`);
      if (estado.isDirectory()) await visitar(caminho);
      else if (EXTENSOES_MONITORADAS.includes(extname(entrada.name))) {
        validarCaminhoSeguro(caminho);
        if (!estado.isFile()) throw new Error(`Entrada monitorada não é arquivo regular: ${caminho}`);
        if (Object.hasOwn(arquivos, caminho)) throw new Error(`Caminho duplicado: ${caminho}`);
        try { arquivos[caminho] = await calcularHashArquivo(completo); }
        catch (erro) { throw new Error(`Não foi possível ler o arquivo ${caminho}: ${erro.message}`); }
      }
    }
  }
  try { await visitar(''); }
  catch (erro) { throw new Error(`Falha na varredura de ${raiz}: ${erro.message}`); }
  return Object.fromEntries(Object.keys(arquivos).sort(compararCaminhos).map((caminho) => [caminho, arquivos[caminho]]));
}

export function calcularHashAgregado(arquivos) {
  const resumo = createHash('sha256');
  for (const caminho of Object.keys(arquivos).sort(compararCaminhos)) {
    validarCaminhoSeguro(caminho);
    resumo.update(`${caminho}\0${arquivos[caminho]}\n`, 'utf8');
  }
  return resumo.digest('hex');
}
