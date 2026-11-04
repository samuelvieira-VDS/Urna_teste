import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { requisitarAplicacao } from './auxiliares.js';
import { criarAplicacao } from '../server.js';
import { criarArmazenamento } from '../src/armazenamento.js';

async function prepararUrna(contexto) {
  const diretorio = await mkdtemp(join(tmpdir(), 'urna-teste-'));
  const caminhoDados = join(diretorio, 'data/urna.json');
  contexto.after(async () => {
    await rm(diretorio, { recursive: true, force: true });
  });
  async function iniciarInstancia() {
    const aplicacao = await criarAplicacao({ caminhoDados });
    const acessar = (caminho, opcoes) => requisitarAplicacao(aplicacao, caminho, opcoes);
    async function requisitar(caminho, corpo) {
      const resposta = await acessar(caminho, corpo === undefined ? {} : {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo),
      });
      return { codigo: resposta.status, dados: await resposta.json() };
    }
    return { requisitar, acessar };
  }
  const instancia = await iniciarInstancia();
  return { ...instancia, caminhoDados, iniciarInstancia,
    lerEstado: async () => JSON.parse(await readFile(caminhoDados, 'utf8')) };
}

for (const candidatoId of ['lula', 'flavio_bolsonaro']) {
  test(`Um voto em ${candidatoId} incrementa somente o candidato escolhido`, async (contexto) => {
    const urna = await prepararUrna(contexto);
    const resposta = await urna.requisitar('/api/votar', { candidatoId });
    assert.equal(resposta.codigo, 200);
    assert.deepEqual((await urna.lerEstado()).votos, {
      lula: candidatoId === 'lula' ? 1 : 0,
      flavio_bolsonaro: candidatoId === 'flavio_bolsonaro' ? 1 : 0,
    });
  });
}

test('Duas votações válidas totalizam exatamente dois votos', async (contexto) => {
  const urna = await prepararUrna(contexto);
  await urna.requisitar('/api/votar', { candidatoId: 'lula' });
  await urna.requisitar('/api/votar', { candidatoId: 'flavio_bolsonaro' });
  await urna.requisitar('/api/encerrar', {});
  assert.deepEqual((await urna.requisitar('/api/resultado')).dados,
    { flavio_bolsonaro: 1, lula: 1, total: 2, encerrada: true });
});

test('Requisições concorrentes não perdem incrementos', async (contexto) => {
  const urna = await prepararUrna(contexto);
  const respostas = await Promise.all(Array.from({ length: 80 }, (_, indice) =>
    urna.requisitar('/api/votar', { candidatoId: indice % 2 ? 'lula' : 'flavio_bolsonaro' })));
  assert.ok(respostas.every((resposta) => resposta.codigo === 200));
  assert.deepEqual((await urna.lerEstado()).votos, { flavio_bolsonaro: 40, lula: 40 });
  assert.deepEqual(await readdir(join(urna.caminhoDados, '..')), ['urna.json']);
});

test('Corpos inválidos, quantidades e IDs desconhecidos não alteram dados', async (contexto) => {
  const urna = await prepararUrna(contexto);
  const anterior = await readFile(urna.caminhoDados, 'utf8');
  for (const corpo of [{ candidatoId: 'outro' }, { candidatoId: '__proto__' }, {}, [], null,
    { candidatoId: 'lula', quantidade: -1 }, { candidatoId: 'lula', votos: 100 },
    { candidatoId: 1 }, { candidatoId: ['lula'] }]) {
    assert.equal((await urna.requisitar('/api/votar', corpo)).codigo, 400);
  }
  const resposta = await urna.acessar('/api/votar', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{',
  });
  assert.equal(resposta.status, 400);
  assert.equal(await readFile(urna.caminhoDados, 'utf8'), anterior);
});

test('Apuração exige encerramento e voto posterior é rejeitado', async (contexto) => {
  const urna = await prepararUrna(contexto);
  assert.equal((await urna.requisitar('/api/resultado')).codigo, 409);
  await urna.requisitar('/api/votar', { candidatoId: 'lula' });
  assert.equal((await urna.requisitar('/api/encerrar', {})).codigo, 200);
  const anterior = await readFile(urna.caminhoDados, 'utf8');
  assert.equal((await urna.requisitar('/api/votar', { candidatoId: 'lula' })).codigo, 409);
  assert.equal(await readFile(urna.caminhoDados, 'utf8'), anterior);
  assert.deepEqual((await urna.requisitar('/api/resultado')).dados,
    { flavio_bolsonaro: 0, lula: 1, total: 1, encerrada: true });
  assert.equal((await urna.requisitar('/api/estado')).dados.encerrada, true);
  assert.equal((await urna.requisitar('/api/encerrar', {})).codigo, 200);
});

test('Reiniciar a aplicação conserva contagem e encerramento', async (contexto) => {
  const urna = await prepararUrna(contexto);
  await urna.requisitar('/api/votar', { candidatoId: 'flavio_bolsonaro' });
  const segunda = await urna.iniciarInstancia();
  assert.deepEqual((await urna.lerEstado()).votos, { flavio_bolsonaro: 1, lula: 0 });
  await segunda.requisitar('/api/votar', { candidatoId: 'lula' });
  await segunda.requisitar('/api/encerrar', {});
  const terceira = await urna.iniciarInstancia();
  assert.equal((await terceira.requisitar('/api/votar', { candidatoId: 'lula' })).codigo, 409);
  assert.equal((await terceira.requisitar('/api/resultado')).dados.total, 2);
});

test('Encerramento concorrente respeita a ordem das operações aceitas', async (contexto) => {
  const urna = await prepararUrna(contexto);
  const operacoes = Array.from({ length: 20 }, () => urna.requisitar('/api/votar', { candidatoId: 'lula' }));
  const fechamento = urna.requisitar('/api/encerrar', {});
  const posteriores = Array.from({ length: 20 }, () => urna.requisitar('/api/votar', { candidatoId: 'lula' }));
  const respostas = await Promise.all([...operacoes, ...posteriores]);
  assert.equal((await fechamento).codigo, 200);
  assert.ok(respostas.every((resposta) => [200, 409].includes(resposta.codigo)));
  assert.equal((await urna.requisitar('/api/resultado')).dados.total,
    respostas.filter((resposta) => resposta.codigo === 200).length);
});

test('Urna vazia encerrada apresenta total zero', async (contexto) => {
  const urna = await prepararUrna(contexto);
  const estado = await urna.requisitar('/api/estado');
  assert.deepEqual(estado.dados, { encerrada: false, candidatos: [
    { id: 'flavio_bolsonaro', nome: 'Flávio Bolsonaro' }, { id: 'lula', nome: 'Lula' },
  ] });
  await urna.requisitar('/api/encerrar', {});
  assert.deepEqual((await urna.requisitar('/api/resultado')).dados,
    { flavio_bolsonaro: 0, lula: 0, total: 0, encerrada: true });
});

test('Dados corrompidos não são substituídos e erros não revelam detalhes internos', async (contexto) => {
  const urna = await prepararUrna(contexto);
  for (const conteudo of ['{', '{"encerrada":false,"votos":{"lula":-1,"flavio_bolsonaro":0}}',
    '{"encerrada":false,"votos":{"lula":1.5,"flavio_bolsonaro":0}}']) {
    await writeFile(urna.caminhoDados, conteudo);
    const resposta = await urna.requisitar('/api/estado');
    assert.equal(resposta.codigo, 500);
    assert.deepEqual(resposta.dados, { mensagem: 'Não foi possível concluir a operação.' });
    await assert.rejects(criarAplicacao({ caminhoDados: urna.caminhoDados }));
    assert.equal(await readFile(urna.caminhoDados, 'utf8'), conteudo);
  }
  await writeFile(urna.caminhoDados, '{"encerrada":false,"votos":{"lula":0,"flavio_bolsonaro":0}}');
  assert.equal((await urna.requisitar('/api/votar', { candidatoId: 'lula' })).codigo, 200);
});

test('Fila se recupera de falha de gravação sem creditar voto em memória', async (contexto) => {
  const urna = await prepararUrna(contexto);
  const armazenamento = criarArmazenamento(urna.caminhoDados);
  await assert.rejects(armazenamento.atualizarEstadoDaUrna((estado) => { estado.votos.lula = -1; }));
  assert.equal((await armazenamento.lerEstadoDaUrna()).votos.lula, 0);
});

test('Interface é servida e nenhum endpoint público restaura a urna', async (contexto) => {
  const urna = await prepararUrna(contexto);
  for (const caminho of ['/', '/app.js', '/style.css']) {
    const resposta = await urna.acessar(caminho);
    assert.equal(resposta.status, 200);
    assert.ok((await resposta.text()).length > 0);
  }
  assert.equal((await urna.requisitar('/api/limpar', {})).codigo, 404);
  assert.equal((await urna.acessar('/data/urna.json')).status, 404);
});

test('Registrar votos e encerrar preservam todos os arquivos de produção', async (contexto) => {
  const urna = await prepararUrna(contexto);
  const caminhos = ['server.js', 'package.json', 'src/votacao.js', 'src/armazenamento.js',
    'public/index.html', 'public/app.js', 'public/style.css'];
  const anteriores = await Promise.all(caminhos.map((caminho) => readFile(new URL(`../${caminho}`, import.meta.url))));
  await urna.requisitar('/api/votar', { candidatoId: 'lula' });
  await urna.requisitar('/api/encerrar', {});
  for (const [indice, caminho] of caminhos.entries()) {
    assert.deepEqual(await readFile(new URL(`../${caminho}`, import.meta.url)), anteriores[indice]);
  }
});
