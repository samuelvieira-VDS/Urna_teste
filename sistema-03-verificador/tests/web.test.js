import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { ARQUIVOS_ESSENCIAIS, listarArquivosMonitorados } from '../src/arquivos.js';
import { gerarManifestoConfiavel } from '../src/manifesto.js';
import { verificarAutenticidade, LIMITES } from '../src/recebimento.js';
import { criarAtendimento } from '../server.js';
import { requisitarAplicacao } from './auxiliares.js';

async function preparar(contexto) {
  const raiz = await mkdtemp(join(tmpdir(), 'verificador-web-'));
  contexto.after(() => rm(raiz, { recursive: true, force: true }));
  const origem = join(raiz, 'urna');
  const arquivos = [];
  for (const caminho of ARQUIVOS_ESSENCIAIS) {
    const conteudo = Buffer.from(`Arquivo de laboratório: ${caminho}\n`);
    await mkdir(dirname(join(origem, caminho)), { recursive: true });
    await writeFile(join(origem, caminho), conteudo);
    arquivos.push({ caminho, conteudoBase64: conteudo.toString('base64') });
  }
  const caminhoManifesto = join(raiz, 'referencia/manifesto-confiavel.json');
  await gerarManifestoConfiavel(origem, { caminhoManifesto });
  const corpo = { sistemas: [{ nome: 'Primeira', arquivos }, { nome: 'Segunda', arquivos: structuredClone(arquivos) }] };
  const atendimento = criarAtendimento({ caminhoManifesto });
  const configuracao = await (await requisitarAplicacao(atendimento, '/api/configuracao')).json();
  const headers = { 'Content-Type': 'application/json', 'X-Token-Verificacao': configuracao.token };
  const enviar = (dados = corpo, adicionais = {}) => requisitarAplicacao(atendimento, '/api/verificar', {
    method: 'POST', body: typeof dados === 'string' ? dados : JSON.stringify(dados), headers: { ...headers, ...adicionais },
  });
  return { raiz, origem, corpo, caminhoManifesto, atendimento, configuracao, enviar };
}

test('Upload verifica bytes reais, data, hashes individuais e agregado sem gravar arquivos', async (contexto) => {
  const urna = await preparar(contexto);
  const manifestoAntes = await readFile(urna.caminhoManifesto);
  const fontesAntes = await listarArquivosMonitorados(urna.origem);
  const resposta = await urna.enviar();
  assert.equal(resposta.status, 200);
  const relatorio = await resposta.json();
  assert.equal(relatorio.conclusao, 'Ambas correspondem à referência');
  assert.ok(Number.isFinite(Date.parse(relatorio.verificadoEm)));
  assert.equal(relatorio.sistemas[0].quantidadeArquivos, 7);
  assert.ok(relatorio.sistemas[0].arquivos.every((arquivo) => arquivo.tipo === 'INTEGRO' && arquivo.esperado === arquivo.encontrado));
  assert.deepEqual(await readFile(urna.caminhoManifesto), manifestoAntes);
  assert.deepEqual(await listarArquivosMonitorados(urna.origem), fontesAntes);
});

test('Upload identifica arquivos modificados, adicionados e removidos com hashes', async (contexto) => {
  const urna = await preparar(contexto);
  const arquivos = urna.corpo.sistemas[1].arquivos;
  arquivos.find((arquivo) => arquivo.caminho === 'src/votacao.js').conteudoBase64 = Buffer.from('Alterado').toString('base64');
  arquivos.splice(arquivos.findIndex((arquivo) => arquivo.caminho === 'server.js'), 1);
  arquivos.push({ caminho: 'extra.js', conteudoBase64: '' });
  const relatorio = await (await urna.enviar()).json();
  assert.equal(relatorio.conclusao, 'Primeira pasta corresponde à referência confiável');
  assert.deepEqual(relatorio.sistemas[1].divergencias.map(({ caminho, tipo }) => ({ caminho, tipo })), [
    { caminho: 'extra.js', tipo: 'ADICIONAL' }, { caminho: 'server.js', tipo: 'AUSENTE' }, { caminho: 'src/votacao.js', tipo: 'ALTERADO' },
  ]);
  const alterado = relatorio.sistemas[1].arquivos.find((arquivo) => arquivo.caminho === 'src/votacao.js');
  assert.equal(alterado.nome, 'votacao.js');
  assert.equal(alterado.encontrado, createHash('sha256').update('Alterado').digest('hex'));
});

test('Upload recusa caminhos maliciosos, arquivos fora da política e manifesto enviado', async (contexto) => {
  const urna = await preparar(contexto);
  const manifestoAntes = await readFile(urna.caminhoManifesto);
  for (const caminho of ['../fora.js', '/fora.js', 'C:\\fora.js', 'a/../fora.js', 'a//b.js', 'a\0b.js',
    'imagem.png', 'data/urna.json', 'referencia/manifesto-confiavel.json', 'executavel.exe']) {
    const corpo = structuredClone(urna.corpo);
    corpo.sistemas[1].arquivos.push({ caminho, conteudoBase64: 'eA==' });
    assert.equal((await urna.enviar(corpo)).status, 400);
  }
  assert.deepEqual(await readFile(urna.caminhoManifesto), manifestoAntes);
});

test('Uploads vazios, duplicados e Base64 inválida são recusados', async (contexto) => {
  const urna = await preparar(contexto);
  for (const dados of [null, {}, { sistemas: [] }, { ...urna.corpo, manifesto: {} }]) assert.equal((await urna.enviar(dados)).status, 400);
  for (const conteudoBase64 of ['%%%%', 'YQ=', 'YQ===', 'YR==', '=AAA', 1]) {
    const corpo = structuredClone(urna.corpo);
    corpo.sistemas[0].arquivos[0].conteudoBase64 = conteudoBase64;
    assert.ok([400, 413].includes((await urna.enviar(corpo)).status));
  }
  const duplicado = structuredClone(urna.corpo);
  duplicado.sistemas[0].arquivos.push(duplicado.sistemas[0].arquivos[0]);
  assert.equal((await urna.enviar(duplicado)).status, 400);
  const vazio = structuredClone(urna.corpo); vazio.sistemas[0].arquivos = [];
  assert.equal((await urna.enviar(vazio)).status, 400);
  assert.equal((await urna.enviar('{')).status, 400);
});

test('Quantidade, tamanho por arquivo e tamanho total são limitados', async (contexto) => {
  const urna = await preparar(contexto);
  const muitos = structuredClone(urna.corpo);
  muitos.sistemas[0].arquivos = Array.from({ length: LIMITES.arquivosPorSistema + 1 }, (_, indice) => ({ caminho: `a${indice}.js`, conteudoBase64: '' }));
  assert.equal((await urna.enviar(muitos)).status, 413);
  const grande = structuredClone(urna.corpo);
  grande.sistemas[0].arquivos[0].conteudoBase64 = Buffer.alloc(LIMITES.bytesPorArquivo + 1).toString('base64');
  assert.equal((await urna.enviar(grande)).status, 413);
  const total = structuredClone(urna.corpo);
  const conteudoBase64 = Buffer.alloc(LIMITES.bytesPorArquivo).toString('base64');
  total.sistemas[0].arquivos = Array.from({ length: 7 }, (_, indice) => ({ caminho: `grande${indice}.js`, conteudoBase64 }));
  await assert.rejects(verificarAutenticidade(total, { caminhoManifesto: urna.caminhoManifesto }), { codigoHttp: 413 });
});

test('Arquivo no limite é resumido sem executar conteúdo e sem alterar bytes', async (contexto) => {
  const urna = await preparar(contexto);
  const bytes = Buffer.alloc(LIMITES.bytesPorArquivo, 0xff);
  urna.corpo.sistemas[0].arquivos[0].conteudoBase64 = bytes.toString('base64');
  const relatorio = await verificarAutenticidade(urna.corpo, { caminhoManifesto: urna.caminhoManifesto });
  const encontrado = relatorio.sistemas[0].arquivos.find((arquivo) => arquivo.caminho === urna.corpo.sistemas[0].arquivos[0].caminho);
  assert.equal(encontrado.encontrado, createHash('sha256').update(bytes).digest('hex'));
});

test('Referência ausente ou corrompida produz inconclusão sem recriação', async (contexto) => {
  const urna = await preparar(contexto);
  await writeFile(urna.caminhoManifesto, '{');
  let resposta = await urna.enviar();
  assert.equal(resposta.status, 503);
  assert.match((await resposta.json()).mensagem, /inconclusiva/);
  assert.equal(await readFile(urna.caminhoManifesto, 'utf8'), '{');
  await rm(urna.caminhoManifesto);
  resposta = await urna.enviar();
  assert.equal(resposta.status, 503);
  await assert.rejects(readFile(urna.caminhoManifesto), { code: 'ENOENT' });
});

test('Servidor protege origem, sessão, tipo de envio e arquivos privados', async (contexto) => {
  const urna = await preparar(contexto);
  for (const headers of [{ 'X-Token-Verificacao': '' }, { 'X-Token-Verificacao': 'é'.repeat(64) },
    { Origin: 'http://outro.example' }, { Host: 'outro.example' }]) assert.equal((await urna.enviar(urna.corpo, headers)).status, 403);
  assert.equal((await urna.enviar(urna.corpo, { 'Content-Type': 'text/plain' })).status, 415);
  for (const caminho of ['/referencia/manifesto-confiavel.json', '/src/manifesto.js', '/../cli.js', '/api/gerar-referencia']) {
    assert.equal((await requisitarAplicacao(urna.atendimento, caminho)).status, 404);
  }
  for (const caminho of ['/', '/app.js', '/style.css']) {
    const resposta = await requisitarAplicacao(urna.atendimento, caminho);
    assert.equal(resposta.status, 200);
    assert.match(resposta.headers.get('content-security-policy'), /default-src 'self'/);
    assert.equal(resposta.headers.get('x-content-type-options'), 'nosniff');
  }
});

test('Comparação web das urnas entregues usa a referência existente e identifica só votacao.js', async () => {
  const sistemas = [];
  for (const pasta of ['sistema-01-urna-autentica', 'sistema-02-urna-adulterada']) {
    const raiz = new URL(`../../${pasta}/`, import.meta.url);
    const hashes = await listarArquivosMonitorados(raiz.pathname);
    const arquivos = [];
    for (const caminho of Object.keys(hashes)) arquivos.push({ caminho, conteudoBase64: (await readFile(new URL(caminho, raiz))).toString('base64') });
    sistemas.push({ nome: pasta, arquivos });
  }
  const relatorio = await verificarAutenticidade({ sistemas });
  assert.equal(relatorio.sistemas[0].status, 'COMPATIVEL_COM_REFERENCIA');
  assert.deepEqual(relatorio.sistemas[1].divergencias.map((arquivo) => arquivo.caminho), ['src/votacao.js']);
});
