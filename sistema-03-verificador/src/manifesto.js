import { mkdir, open, readFile, rename, unlink, realpath } from 'node:fs/promises';
import { dirname, resolve, relative, isAbsolute, basename, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { ARQUIVOS_ESSENCIAIS, calcularHashAgregado, listarArquivosMonitorados, validarCaminhoSeguro } from './arquivos.js';

export const CAMINHO_MANIFESTO = new URL('../referencia/manifesto-confiavel.json', import.meta.url);

function validarChavesUnicas(conteudo) {
  // JSON.parse valida a sintaxe; a análise de tokens adicional detecta chaves repetidas.
  const tokens = conteudo.match(/"(?:\\[\s\S]|[^"\\])*"|[{}\[\]:,]|[^\s{}\[\]:,]+/g) || [];
  const pilha = [];
  for (let indice = 0; indice < tokens.length; indice += 1) {
    const token = tokens[indice];
    if (token === '{') pilha.push(new Set());
    else if (token === '[') pilha.push(null);
    else if (token === '}' || token === ']') pilha.pop();
    else if (token.startsWith('"') && tokens[indice + 1] === ':') {
      const chave = JSON.parse(token);
      const chaves = pilha.at(-1);
      if (chaves.has(chave)) throw new Error(`Chave duplicada no manifesto: ${chave}`);
      chaves.add(chave);
    }
  }
}

export function validarManifesto(manifesto) {
  if (!manifesto || Array.isArray(manifesto) || manifesto.versao !== 1 || manifesto.algoritmo !== 'sha256' ||
      typeof manifesto.geradoEm !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(manifesto.geradoEm) ||
      !Number.isFinite(Date.parse(manifesto.geradoEm)) ||
      typeof manifesto.hashAgregado !== 'string' || !/^[a-f0-9]{64}$/.test(manifesto.hashAgregado) ||
      !manifesto.arquivos || typeof manifesto.arquivos !== 'object' || Array.isArray(manifesto.arquivos)) {
    throw new Error('Manifesto inválido: formato, versão, data ou algoritmo não suportado.');
  }
  for (const [caminho, resumo] of Object.entries(manifesto.arquivos)) {
    validarCaminhoSeguro(caminho);
    if (typeof resumo !== 'string' || !/^[a-f0-9]{64}$/.test(resumo)) throw new Error(`SHA-256 inválido: ${caminho}`);
  }
  for (const caminho of ARQUIVOS_ESSENCIAIS) {
    if (!Object.hasOwn(manifesto.arquivos, caminho)) throw new Error(`Arquivo essencial ausente no manifesto: ${caminho}`);
  }
  if (calcularHashAgregado(manifesto.arquivos) !== manifesto.hashAgregado) {
    throw new Error('Manifesto inválido: hash agregado não confere.');
  }
  return manifesto;
}

export async function carregarManifestoConfiavel(caminhoManifesto = CAMINHO_MANIFESTO) {
  try {
    const conteudo = await readFile(caminhoManifesto, 'utf8');
    const manifesto = JSON.parse(conteudo);
    validarChavesUnicas(conteudo);
    return validarManifesto(manifesto);
  } catch (erro) {
    throw new Error(`Não foi possível carregar o manifesto confiável: ${erro.message}`);
  }
}

async function resolverDestinoReal(caminho) {
  const partesAusentes = [];
  let pasta = dirname(caminho);
  for (;;) {
    try { return join(await realpath(pasta), ...partesAusentes, basename(caminho)); }
    catch (erro) {
      if (erro.code !== 'ENOENT') throw erro;
      partesAusentes.unshift(basename(pasta));
      pasta = dirname(pasta);
    }
  }
}

export async function gerarManifestoConfiavel(diretorio, { caminhoManifesto = CAMINHO_MANIFESTO, sobrescrever = false } = {}) {
  const destino = caminhoManifesto instanceof URL ? caminhoManifesto : resolve(caminhoManifesto);
  const caminhoDestino = destino instanceof URL ? fileURLToPath(destino) : destino;
  const deslocamento = relative(await realpath(resolve(diretorio)), await resolverDestinoReal(caminhoDestino));
  if (deslocamento !== '..' && !deslocamento.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) && !isAbsolute(deslocamento)) {
    throw new Error('O manifesto deve ficar fora da pasta analisada.');
  }
  const arquivos = await listarArquivosMonitorados(diretorio);
  const manifesto = validarManifesto({
    versao: 1, algoritmo: 'sha256', geradoEm: new Date().toISOString(),
    hashAgregado: calcularHashAgregado(arquivos), arquivos,
  });
  await mkdir(dirname(caminhoDestino), { recursive: true });
  const temporario = `${caminhoDestino}.${randomUUID()}.tmp`;
  let arquivo;
  try {
    arquivo = await open(sobrescrever ? temporario : caminhoDestino, 'wx', 0o600);
    await arquivo.writeFile(`${JSON.stringify(manifesto, null, 2)}\n`, 'utf8');
    await arquivo.close();
    arquivo = undefined;
    if (sobrescrever) await rename(temporario, caminhoDestino);
  } catch (erro) {
    if (erro.code === 'EEXIST') throw new Error('Manifesto já existe. Revise manualmente a origem antes de usar --sobrescrever.');
    throw erro;
  } finally {
    if (arquivo) await arquivo.close();
    if (sobrescrever) await unlink(temporario).catch((erro) => { if (erro.code !== 'ENOENT') throw erro; });
  }
  return manifesto;
}
