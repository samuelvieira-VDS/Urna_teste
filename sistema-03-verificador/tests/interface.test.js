import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { LIMITES } from '../src/recebimento.js';
import { EXTENSOES_MONITORADAS, PASTAS_EXCLUIDAS } from '../src/arquivos.js';

const CODIGO = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
const CONFIGURACAO = { token: 'a'.repeat(64), limites: LIMITES, extensoes: EXTENSOES_MONITORADAS, pastasExcluidas: PASTAS_EXCLUIDAS };
function criarArquivo(caminho, conteudo = 'const teste = 1;') {
  const bytes = Buffer.from(conteudo);
  return { webkitRelativePath: `urna/${caminho}`, size: bytes.length,
    arrayBuffer: async () => Uint8Array.from(bytes).buffer };
}
function criarRelatorio() {
  return { verificadoEm: '2026-11-04T18:00:00.000Z', hashAgregadoEsperado: 'a'.repeat(64),
    conclusao: 'Primeira pasta corresponde à referência confiável', sistemas: [
      { nome: 'urna', status: 'COMPATIVEL_COM_REFERENCIA', quantidadeArquivos: 1,
        hashAgregado: 'a'.repeat(64), divergencias: [], arquivos: [
          { nome: 'votacao.js', caminho: 'src/votacao.js', esperado: 'a'.repeat(64), encontrado: 'a'.repeat(64), tipo: 'INTEGRO' }] },
      { nome: '<img src=x>', status: 'DIVERGENTE_DA_REFERENCIA', quantidadeArquivos: 1,
        hashAgregado: 'b'.repeat(64), divergencias: [{ caminho: 'src/votacao.js' }], arquivos: [
          { nome: 'votacao.js', caminho: 'src/votacao.js', esperado: 'a'.repeat(64), encontrado: 'b'.repeat(64), tipo: 'ALTERADO' }] },
    ] };
}
async function prepararInterface(responder = async () => ({ ok: true, json: async () => criarRelatorio() })) {
  const elementos = new Map();
  const criados = [];
  const downloads = [];
  let arquivoExportado;
  let enderecoRevogado;
  function criarElemento(tipo = 'div') {
    const elemento = { tipo, textContent: '', className: '', filhos: [], eventos: {}, files: [], disabled: false, hidden: true,
      addEventListener(nome, acao) { this.eventos[nome] = acao; },
      setAttribute() {}, append(...filhos) { this.filhos.push(...filhos); },
      replaceChildren() { this.filhos = []; },
      click() { downloads.push(this); }, remove() { this.removido = true; },
    };
    criados.push(elemento);
    return elemento;
  }
  const documento = { body: criarElemento('body'), createElement: criarElemento,
    querySelector(seletor) {
      if (!elementos.has(seletor)) elementos.set(seletor, criarElemento());
      return elementos.get(seletor);
    } };
  let envios = 0;
  let ultimoCorpo;
  runInNewContext(CODIGO, { document: documento, Blob, TypeError, btoa,
    URL: { createObjectURL(arquivo) { arquivoExportado = arquivo; return 'blob:teste'; },
      revokeObjectURL(endereco) { enderecoRevogado = endereco; } },
    setTimeout(acao) { acao(); },
    fetch: async (caminho, opcoes) => {
      if (caminho === '/api/configuracao') return { ok: true, json: async () => CONFIGURACAO };
      envios += 1; ultimoCorpo = JSON.parse(opcoes.body);
      assert.equal(opcoes.headers['X-Token-Verificacao'], CONFIGURACAO.token);
      return responder(caminho, opcoes);
    },
  });
  await new Promise((concluir) => setImmediate(concluir));
  const obter = documento.querySelector;
  async function selecionar(arquivos = [criarArquivo('src/votacao.js')]) {
    obter('#primeiro').files = arquivos;
    obter('#segundo').files = [criarArquivo('src/votacao.js')];
    obter('#primeiro').eventos.change();
  }
  const enviar = () => obter('#formulario').eventos.submit({ preventDefault() {} });
  return { obter, selecionar, enviar, criados, downloads, obterEnvios: () => envios,
    obterCorpo: () => ultimoCorpo, obterArquivo: () => arquivoExportado, obterRevogado: () => enderecoRevogado };
}

test('Interface exige duas seleções e envia somente arquivos monitorados, com bytes preservados', async () => {
  const pagina = await prepararInterface();
  assert.equal(pagina.obter('#verificar').disabled, true);
  await pagina.selecionar([criarArquivo('src/votacao.js', 'á\n'), criarArquivo('data/urna.json'),
    criarArquivo('node_modules/a.js'), criarArquivo('referencia/manifesto-confiavel.json'), criarArquivo('README.md')]);
  assert.equal(pagina.obter('#verificar').disabled, false);
  await pagina.enviar();
  assert.equal(pagina.obterEnvios(), 1);
  assert.equal(pagina.obterCorpo().sistemas[0].arquivos.length, 1);
  assert.equal(Buffer.from(pagina.obterCorpo().sistemas[0].arquivos[0].conteudoBase64, 'base64').toString(), 'á\n');
  assert.equal(pagina.obter('#resultados').hidden, false);
  assert.match(pagina.obter('#mensagem').className, /divergente/);
});

test('Interface mostra dois painéis, situação e hashes sem interpretar nomes como HTML', async () => {
  const pagina = await prepararInterface();
  await pagina.selecionar(); await pagina.enviar();
  assert.equal(pagina.obter('#paineis').filhos.length, 2);
  for (const texto of ['Íntegro', 'Modificado', 'votacao.js', 'src/votacao.js', 'a'.repeat(64), 'b'.repeat(64)]) {
    assert.ok(pagina.criados.some((elemento) => elemento.textContent === texto));
  }
  assert.ok(pagina.criados.some((elemento) => elemento.textContent === 'Pasta selecionada: <img src=x>'));
  assert.equal(pagina.criados.some((elemento) => elemento.tipo === 'img'), false);
});

test('Download contém data, sistemas, hashes, divergências e conclusão do relatório mostrado', async () => {
  const pagina = await prepararInterface();
  await pagina.selecionar(); await pagina.enviar();
  pagina.obter('#baixar').eventos.click();
  assert.equal(pagina.downloads.length, 1);
  assert.match(pagina.downloads[0].download, /^relatorio-verificacao-.*\.json$/);
  assert.deepEqual(JSON.parse(await pagina.obterArquivo().text()), criarRelatorio());
  assert.equal(pagina.obterRevogado(), 'blob:teste');
  pagina.obter('#primeiro').eventos.change();
  assert.equal(pagina.obter('#baixar').disabled, true);
  assert.equal(pagina.obter('#resultados').hidden, true);
});

test('Interface impede envios duplicados e bloqueia seleção durante a análise', async () => {
  let concluir;
  const pagina = await prepararInterface(() => new Promise((resolver) => { concluir = resolver; }));
  await pagina.selecionar();
  const envio = pagina.enviar();
  await new Promise((resolver) => setImmediate(resolver));
  assert.equal(pagina.obter('#primeiro').disabled, true);
  await pagina.enviar();
  assert.equal(pagina.obterEnvios(), 1);
  concluir({ ok: true, json: async () => criarRelatorio() });
  await envio;
  assert.equal(pagina.obter('#primeiro').disabled, false);
});

test('Referência indisponível fica amarela e não permite baixar resultado anterior', async () => {
  const pagina = await prepararInterface(async () => ({ ok: false, json: async () => ({ mensagem: 'Referência indisponível. Verificação inconclusiva.' }) }));
  await pagina.selecionar(); await pagina.enviar();
  assert.match(pagina.obter('#mensagem').className, /inconclusivo/);
  assert.match(pagina.obter('#mensagem').textContent, /Referência indisponível/);
  assert.equal(pagina.obter('#baixar').disabled, true);
});

test('Interface recusa arquivo acima do limite antes de enviá-lo', async () => {
  const pagina = await prepararInterface();
  const arquivo = criarArquivo('grande.js'); arquivo.size = LIMITES.bytesPorArquivo + 1;
  await pagina.selecionar([arquivo]); await pagina.enviar();
  assert.equal(pagina.obterEnvios(), 0);
  assert.match(pagina.obter('#mensagem').textContent, /excedem os limites/);
});

test('Interface apresenta verde quando as duas pastas correspondem à referência', async () => {
  const relatorio = criarRelatorio(); relatorio.sistemas[1] = relatorio.sistemas[0];
  const pagina = await prepararInterface(async () => ({ ok: true, json: async () => relatorio }));
  await pagina.selecionar(); await pagina.enviar();
  assert.match(pagina.obter('#mensagem').className, /compativel/);
});
