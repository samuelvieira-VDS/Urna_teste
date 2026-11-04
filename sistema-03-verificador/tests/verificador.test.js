import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, cp, symlink, readdir, lstat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { ARQUIVOS_ESSENCIAIS, calcularHashAgregado, listarArquivosMonitorados, validarCaminhoSeguro } from '../src/arquivos.js';
import { gerarManifestoConfiavel, carregarManifestoConfiavel } from '../src/manifesto.js';
import { verificarIntegridade, formatarRelatorio } from '../src/verificacao.js';
import { executar, interpretarArgumentos } from '../cli.js';

async function preparar(contexto) {
  const raiz = await mkdtemp(join(tmpdir(), 'verificador-'));
  contexto.after(() => rm(raiz, { recursive: true, force: true }));
  const primeiro = join(raiz, 'primeiro');
  const segundo = join(raiz, 'segundo');
  const caminhoManifesto = join(raiz, 'referencia/manifesto-confiavel.json');
  for (const caminho of [...ARQUIVOS_ESSENCIAIS, 'package-lock.json']) {
    const destino = join(primeiro, caminho);
    await mkdir(dirname(destino), { recursive: true });
    await writeFile(destino, `Conteúdo fictício para teste: ${caminho}\n`);
  }
  await cp(primeiro, segundo, { recursive: true });
  const manifesto = await gerarManifestoConfiavel(primeiro, { caminhoManifesto });
  const verificar = () => verificarIntegridade(primeiro, segundo, { caminhoManifesto });
  return { raiz, primeiro, segundo, caminhoManifesto, manifesto, verificar };
}

async function fotografar(diretorio, prefixo = '') {
  const resumo = {};
  for (const nome of (await readdir(join(diretorio, prefixo))).sort()) {
    const caminho = join(prefixo, nome);
    const absoluto = join(diretorio, caminho);
    if ((await lstat(absoluto)).isDirectory()) Object.assign(resumo, await fotografar(diretorio, caminho));
    else resumo[caminho] = createHash('sha256').update(await readFile(absoluto)).digest('hex');
  }
  return resumo;
}

test('Árvores idênticas são compatíveis e incluem lockfile', async (contexto) => {
  const urna = await preparar(contexto);
  const relatorio = await urna.verificar();
  assert.ok(relatorio.pastas.every((pasta) => pasta.status === 'COMPATIVEL_COM_REFERENCIA'));
  assert.equal(relatorio.conclusao, 'Ambas correspondem à referência');
  assert.ok(urna.manifesto.arquivos['package-lock.json']);
});

test('Alterar somente um byte identifica caminho e ambos os hashes', async (contexto) => {
  const urna = await preparar(contexto);
  const caminho = join(urna.segundo, 'src/votacao.js');
  const conteudo = await readFile(caminho);
  conteudo[0] ^= 1;
  await writeFile(caminho, conteudo);
  const relatorio = await urna.verificar();
  const divergencias = relatorio.pastas[1].divergencias;
  assert.equal(relatorio.conclusao, 'Primeira pasta corresponde à referência confiável');
  assert.equal(divergencias.length, 1);
  assert.equal(divergencias[0].caminho, 'src/votacao.js');
  assert.equal(divergencias[0].tipo, 'ALTERADO');
  assert.notEqual(divergencias[0].esperado, divergencias[0].encontrado);
  assert.match(formatarRelatorio(relatorio), /Arquivo divergente: src\/votacao.js/);
});

test('Arquivos ausentes e adicionais geram incompatibilidade', async (contexto) => {
  const urna = await preparar(contexto);
  await rm(join(urna.segundo, 'server.js'));
  await writeFile(join(urna.segundo, 'novo.mjs'), 'export const teste = 1;');
  const relatorio = await urna.verificar();
  assert.deepEqual(relatorio.pastas[1].divergencias.map(({ caminho, tipo }) => ({ caminho, tipo })), [
    { caminho: 'novo.mjs', tipo: 'ADICIONAL' }, { caminho: 'server.js', tipo: 'AUSENTE' },
  ]);
  assert.equal(relatorio.pastas[1].divergencias[0].esperado, null);
  assert.equal(relatorio.pastas[1].divergencias[1].encontrado, null);
});

test('Dados mutáveis, testes, dependências, cobertura e temporários são excluídos', async (contexto) => {
  const urna = await preparar(contexto);
  for (const caminho of ['data/urna.json', 'tests/a.js', 'node_modules/a.js', '.git/a.json',
    'coverage/a.json', 'logs/a.json', 'tmp/a.js', 'temp/a.js', '.env', '.env.local',
    'anotacoes.md', 'falha.log.json', 'copia.tmp.js', 'manifesto-confiavel.json']) {
    const destino = join(urna.segundo, caminho);
    await mkdir(dirname(destino), { recursive: true });
    await writeFile(destino, 'Conteúdo deliberadamente diferente');
  }
  const relatorio = await urna.verificar();
  assert.equal(relatorio.conclusao, 'Ambas correspondem à referência');
  assert.equal(relatorio.pastas[0].hashAgregado, relatorio.pastas[1].hashAgregado);
});

test('Ordem dos pares não altera hash agregado e codificação é reproduzível', () => {
  const primeiro = { 'b.js': 'b'.repeat(64), 'a.js': 'a'.repeat(64) };
  const segundo = { 'a.js': 'a'.repeat(64), 'b.js': 'b'.repeat(64) };
  assert.equal(calcularHashAgregado(primeiro), calcularHashAgregado(segundo));
  const esperado = createHash('sha256').update(`a.js\0${'a'.repeat(64)}\nb.js\0${'b'.repeat(64)}\n`, 'utf8').digest('hex');
  assert.equal(calcularHashAgregado(primeiro), esperado);
});

test('Verificação preserva bytes das urnas e do manifesto', async (contexto) => {
  const urna = await preparar(contexto);
  const antes = await fotografar(urna.raiz);
  await urna.verificar();
  assert.deepEqual(await fotografar(urna.raiz), antes);
});

test('Manifesto inexistente gera erro e nunca é criado pela verificação', async (contexto) => {
  const urna = await preparar(contexto);
  await rm(urna.caminhoManifesto);
  await assert.rejects(urna.verificar(), /manifesto confiável/);
  await assert.rejects(readFile(urna.caminhoManifesto), { code: 'ENOENT' });
});

test('Manifestos inválidos, incompletos ou inconsistentes são rejeitados', async (contexto) => {
  const urna = await preparar(contexto);
  const alteracoes = ['{', 'null', '{}', JSON.stringify({ ...urna.manifesto, versao: 2 }),
    JSON.stringify({ ...urna.manifesto, algoritmo: 'md5' }),
    JSON.stringify({ ...urna.manifesto, geradoEm: 'ontem' }),
    JSON.stringify({ ...urna.manifesto, arquivos: [] }),
    JSON.stringify({ ...urna.manifesto, arquivos: {} }),
    JSON.stringify({ ...urna.manifesto, hashAgregado: '0'.repeat(64) }),
    JSON.stringify({ ...urna.manifesto, arquivos: { ...urna.manifesto.arquivos, 'server.js': 'inválido' } })];
  for (const conteudo of alteracoes) {
    await writeFile(urna.caminhoManifesto, conteudo);
    await assert.rejects(urna.verificar(), /manifesto/);
  }
});

test('Chaves JSON duplicadas inclusive escapadas são rejeitadas', async (contexto) => {
  const urna = await preparar(contexto);
  const conteudo = await readFile(urna.caminhoManifesto, 'utf8');
  for (const trecho of ['"versao": 1,', '"\\u0076ersao": 1,']) {
    await writeFile(urna.caminhoManifesto, conteudo.replace('{', `{${trecho}`));
    await assert.rejects(carregarManifestoConfiavel(urna.caminhoManifesto), /duplicada/);
  }
  const hash = urna.manifesto.arquivos['server.js'];
  await writeFile(urna.caminhoManifesto, conteudo.replace('"arquivos": {', `"arquivos": {"server.js":"${hash}",`));
  await assert.rejects(urna.verificar(), /duplicada/);
});

test('Conclusões não dependem do nome ou da ordem das pastas', async (contexto) => {
  const urna = await preparar(contexto);
  await writeFile(join(urna.primeiro, 'server.js'), 'Modificado');
  assert.equal((await urna.verificar()).conclusao, 'Segunda pasta corresponde à referência confiável');
  await writeFile(join(urna.segundo, 'server.js'), 'Modificado');
  assert.equal((await urna.verificar()).conclusao, 'Nenhuma corresponde à referência');
});

test('Caminhos maliciosos e arquivos excluídos no manifesto são recusados', async (contexto) => {
  const urna = await preparar(contexto);
  for (const caminho of ['../fora.js', '/absoluto.js', 'a/../b.js', 'a//b.js', './a.js',
    'C:/arquivo.js', 'a\\b.js', 'a\nb.js', 'data/urna.json', 'a/manifesto-confiavel.json', 'foto.png']) {
    assert.throws(() => validarCaminhoSeguro(caminho));
    const manifesto = { ...urna.manifesto, arquivos: { ...urna.manifesto.arquivos, [caminho]: 'a'.repeat(64) } };
    await writeFile(urna.caminhoManifesto, JSON.stringify(manifesto));
    await assert.rejects(urna.verificar());
  }
});

for (const tipo of ['arquivo externo', 'diretório externo', 'arquivo interno', 'raiz']) {
  test(`Link simbólico recusado: ${tipo}`, async (contexto) => {
    const urna = await preparar(contexto);
    const fora = join(urna.raiz, 'fora');
    await mkdir(fora);
    await writeFile(join(fora, 'codigo.js'), 'Fora da urna');
    let raiz = urna.segundo;
    if (tipo === 'arquivo externo') await symlink(join(fora, 'codigo.js'), join(urna.segundo, 'link.js'));
    if (tipo === 'diretório externo') await symlink(fora, join(urna.segundo, 'link'));
    if (tipo === 'arquivo interno') await symlink(join(urna.segundo, 'server.js'), join(urna.segundo, 'link.js'));
    if (tipo === 'raiz') {
      raiz = join(urna.raiz, 'atalho');
      await symlink(urna.segundo, raiz);
    }
    await assert.rejects(listarArquivosMonitorados(raiz), /[Ll]ink simbólico/);
  });
}

test('Geração recusa sobrescrita e permite somente substituição explícita', async (contexto) => {
  const urna = await preparar(contexto);
  const anterior = await readFile(urna.caminhoManifesto, 'utf8');
  await writeFile(join(urna.primeiro, 'server.js'), 'Nova referência revisada fictícia');
  await assert.rejects(gerarManifestoConfiavel(urna.primeiro, { caminhoManifesto: urna.caminhoManifesto }), /já existe/);
  assert.equal(await readFile(urna.caminhoManifesto, 'utf8'), anterior);
  await gerarManifestoConfiavel(urna.primeiro, { caminhoManifesto: urna.caminhoManifesto, sobrescrever: true });
  assert.notEqual(await readFile(urna.caminhoManifesto, 'utf8'), anterior);
  assert.equal((await urna.verificar()).conclusao, 'Primeira pasta corresponde à referência confiável');
});

test('Geração exige arquivos essenciais e referência externa', async (contexto) => {
  const urna = await preparar(contexto);
  await assert.rejects(gerarManifestoConfiavel(urna.primeiro, {
    caminhoManifesto: join(urna.primeiro, 'referencia/manifesto-confiavel.json'),
  }), /fora da pasta/);
  await rm(join(urna.primeiro, 'src/votacao.js'));
  await assert.rejects(gerarManifestoConfiavel(urna.primeiro, {
    caminhoManifesto: join(urna.raiz, 'nova.json'),
  }), /essencial ausente/);
});

test('Falhas de acesso ou diretório inexistente não viram incompatibilidade normal', async (contexto) => {
  const urna = await preparar(contexto);
  await rm(urna.segundo, { recursive: true });
  await assert.rejects(urna.verificar(), /ENOENT/);
  await assert.rejects(listarArquivosMonitorados(join(urna.primeiro, 'server.js')), /diretório real/);
});

test('CLI rejeita opções duplicadas, desconhecidas e sobrescrita na verificação', () => {
  for (const argumentos of [[], ['outro'], ['verificar'], ['verificar', '--primeiro'],
    ['verificar', '--primeiro', 'a', '--segundo', 'b', '--sobrescrever'],
    ['verificar', '--primeiro', 'a', '--segundo', 'b', '--json', '--json'],
    ['gerar-referencia', '--diretorio', 'a', '--json']]) {
    assert.throws(() => interpretarArgumentos(argumentos));
  }
});

test('CLI emite JSON válido, saída zero para divergência e dois para falha', async (contexto) => {
  const urna = await preparar(contexto);
  const saidas = [];
  const erros = [];
  const opcoes = { caminhoManifesto: urna.caminhoManifesto, escrever: (texto) => saidas.push(texto), escreverErro: (texto) => erros.push(texto) };
  await writeFile(join(urna.segundo, 'server.js'), 'Alterado');
  assert.equal(await executar(['verificar', '--primeiro', urna.primeiro, '--segundo', urna.segundo, '--json'], opcoes), 0);
  assert.equal(JSON.parse(saidas[0]).pastas[1].status, 'DIVERGENTE_DA_REFERENCIA');
  assert.equal(erros.length, 0);
  const anterior = await readFile(urna.caminhoManifesto, 'utf8');
  assert.equal(await executar(['verificar', '--primeiro', urna.primeiro, '--segundo', urna.segundo, '--sobrescrever'], opcoes), 2);
  assert.equal(await readFile(urna.caminhoManifesto, 'utf8'), anterior);
  await rm(urna.caminhoManifesto);
  assert.equal(await executar(['verificar', '--primeiro', urna.primeiro, '--segundo', urna.segundo], opcoes), 2);
});

test('CLI de geração alerta sobre proteção e substituição explícita', async (contexto) => {
  const urna = await preparar(contexto);
  const saidas = [];
  const erros = [];
  const opcoes = { caminhoManifesto: urna.caminhoManifesto, escrever: (texto) => saidas.push(texto), escreverErro: (texto) => erros.push(texto) };
  assert.equal(await executar(['gerar-referencia', '--diretorio', urna.primeiro], opcoes), 2);
  assert.equal(await executar(['gerar-referencia', '--diretorio', urna.primeiro, '--sobrescrever'], opcoes), 0);
  assert.ok(erros.some((texto) => texto.startsWith('ALERTA:')));
  assert.ok(saidas.some((texto) => texto.includes('Proteja o manifesto')));
});

test('CLI retorna código dois e mensagem em português para comando inválido', async () => {
  const erros = [];
  const codigo = await executar(['inválido'], { escreverErro: (texto) => erros.push(texto) });
  assert.equal(codigo, 2);
  assert.match(erros[0], /Erro: Use/);
});

test('Destino que atravessa link para dentro da urna é recusado', async (contexto) => {
  const urna = await preparar(contexto);
  const atalho = join(urna.raiz, 'atalho');
  await symlink(urna.primeiro, atalho);
  const antes = await fotografar(urna.primeiro);
  await assert.rejects(gerarManifestoConfiavel(urna.primeiro, {
    caminhoManifesto: join(atalho, 'referencia/manifesto-confiavel.json'),
  }), /fora da pasta/);
  assert.deepEqual(await fotografar(urna.primeiro), antes);
});
