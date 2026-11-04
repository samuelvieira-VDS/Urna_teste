import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const CODIGO = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');

async function prepararInterface(responder) {
  const elementos = new Map();
  function criarElemento() {
    return {
      disabled: false, hidden: true, textContent: '', filhos: [], eventos: {},
      addEventListener(nome, acao) { this.eventos[nome] = acao; },
      setAttribute() {},
      append(filho) { this.filhos.push(filho); },
      replaceChildren() { this.filhos = []; },
      reset() { this.reiniciado = true; },
    };
  }
  const documento = {
    querySelector(seletor) {
      if (!elementos.has(seletor)) elementos.set(seletor, criarElemento());
      return elementos.get(seletor);
    },
    createElement: criarElemento,
  };
  class DadosFormulario {
    get() { return 'lula'; }
  }
  runInNewContext(CODIGO, {
    document: documento, FormData: DadosFormulario,
    fetch: responder, TypeError,
  });
  const aguardar = () => new Promise((concluir) => setImmediate(concluir));
  await aguardar();
  async function acionar(seletor, evento = 'click') {
    documento.querySelector(seletor).eventos[evento]({ preventDefault() {} });
    await aguardar();
  }
  return { obter: documento.querySelector, acionar, aguardar };
}

function responderJson(dados, codigo = 200) {
  return { ok: codigo < 400, json: async () => dados };
}

test('Interface bloqueia submissão duplicada enquanto aguarda confirmação', async () => {
  let concluirVoto;
  let envios = 0;
  const interfaceUrna = await prepararInterface(async (caminho) => {
    if (caminho === '/api/estado') return responderJson({ encerrada: false });
    envios += 1;
    return new Promise((concluir) => { concluirVoto = concluir; });
  });
  await interfaceUrna.acionar('#formulario', 'submit');
  assert.equal(interfaceUrna.obter('#confirmar').disabled, true);
  await interfaceUrna.acionar('#formulario', 'submit');
  assert.equal(envios, 1);
  concluirVoto(responderJson({ mensagem: 'Voto registrado com sucesso.' }));
  await interfaceUrna.aguardar();
  assert.equal(interfaceUrna.obter('#confirmar').disabled, false);
  assert.equal(interfaceUrna.obter('#formulario').reiniciado, true);
  assert.match(interfaceUrna.obter('#mensagem').textContent, /sucesso/);
});

for (const resultado of [
  { lula: 0, flavio_bolsonaro: 0, total: 0, conclusao: 'Empate' },
  { lula: 1, flavio_bolsonaro: 1, total: 2, conclusao: 'Empate' },
  { lula: 3, flavio_bolsonaro: 1, total: 4, conclusao: 'Maior votação: Lula' },
  { lula: 1, flavio_bolsonaro: 3, total: 4, conclusao: 'Maior votação: Flávio Bolsonaro' },
]) {
  test(`Interface apresenta total ${resultado.total} e ${resultado.conclusao}`, async () => {
    const interfaceUrna = await prepararInterface(async (caminho) => responderJson(
      caminho === '/api/estado' ? { encerrada: true } : resultado));
    assert.equal(interfaceUrna.obter('#confirmar').disabled, true);
    assert.equal(interfaceUrna.obter('#verResultado').hidden, false);
    await interfaceUrna.acionar('#verResultado');
    assert.equal(interfaceUrna.obter('#resultado').hidden, false);
    assert.ok(interfaceUrna.obter('#conclusao').textContent.startsWith(resultado.conclusao));
    assert.equal(interfaceUrna.obter('#total').textContent, `Total geral: ${resultado.total} voto(s).`);
    const linhas = interfaceUrna.obter('#apuracao').filhos;
    assert.equal(linhas.length, 2);
    const porcentagem = resultado.total ? resultado.flavio_bolsonaro / resultado.total * 100 : 0;
    assert.equal(linhas[0].filhos[2].textContent, `${porcentagem}%`);
  });
}

test('Falha de conexão mantém formulário indisponível e comunica erro', async () => {
  const interfaceUrna = await prepararInterface(async () => { throw new TypeError('Falha'); });
  assert.equal(interfaceUrna.obter('#confirmar').disabled, true);
  assert.match(interfaceUrna.obter('#mensagem').textContent, /Não foi possível carregar/);
});
