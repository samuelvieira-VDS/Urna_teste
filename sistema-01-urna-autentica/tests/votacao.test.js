import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { criarArmazenamento } from '../src/armazenamento.js';
import { criarServicoVotacao } from '../src/votacao.js';

async function prepararServico(contexto) {
  const diretorio = await mkdtemp(join(tmpdir(), 'urna-regras-'));
  contexto.after(() => rm(diretorio, { recursive: true, force: true }));
  const caminho = join(diretorio, 'data/urna.json');
  const armazenamento = criarArmazenamento(caminho);
  await armazenamento.lerEstadoDaUrna();
  return { caminho, armazenamento, servico: criarServicoVotacao(armazenamento) };
}

for (const candidatoId of ['lula', 'flavio_bolsonaro']) {
  test(`Regra credita exatamente um voto a ${candidatoId}`, async (contexto) => {
    const { servico, armazenamento } = await prepararServico(contexto);
    await servico.registrarVoto({ candidatoId });
    assert.deepEqual((await armazenamento.lerEstadoDaUrna()).votos, {
      lula: candidatoId === 'lula' ? 1 : 0,
      flavio_bolsonaro: candidatoId === 'flavio_bolsonaro' ? 1 : 0,
    });
  });
}

test('Duas votações e encerramento produzem apuração fiel', async (contexto) => {
  const { servico } = await prepararServico(contexto);
  await assert.rejects(servico.consultarResultado(), { codigoHttp: 409 });
  await servico.registrarVoto({ candidatoId: 'lula' });
  await servico.registrarVoto({ candidatoId: 'flavio_bolsonaro' });
  await servico.encerrarVotacao();
  assert.deepEqual(await servico.consultarResultado(),
    { flavio_bolsonaro: 1, lula: 1, total: 2, encerrada: true });
  await assert.rejects(servico.registrarVoto({ candidatoId: 'lula' }), { codigoHttp: 409 });
});

test('Cem registros concorrentes entre instâncias não perdem votos', async (contexto) => {
  const { caminho, servico, armazenamento } = await prepararServico(contexto);
  const segundoServico = criarServicoVotacao(criarArmazenamento(caminho));
  await Promise.all(Array.from({ length: 100 }, (_, indice) =>
    (indice % 2 ? servico : segundoServico).registrarVoto({
      candidatoId: indice % 2 ? 'lula' : 'flavio_bolsonaro',
    })));
  assert.deepEqual((await armazenamento.lerEstadoDaUrna()).votos, { flavio_bolsonaro: 50, lula: 50 });
  assert.deepEqual(await readdir(join(caminho, '..')), ['urna.json']);
});

test('Entrada inválida não altera o arquivo de dados', async (contexto) => {
  const { caminho, servico } = await prepararServico(contexto);
  const anterior = await readFile(caminho, 'utf8');
  for (const corpo of [null, [], {}, 'lula', { candidatoId: 'outro' }, { candidatoId: '__proto__' },
    { candidatoId: 'lula', quantidade: -1 }, { candidatoId: 'lula', votos: 10 }, { candidatoId: 1 }]) {
    await assert.rejects(servico.registrarVoto(corpo), { codigoHttp: 400 });
  }
  assert.equal(await readFile(caminho, 'utf8'), anterior);
});

test('Instância recriada lê contagens e encerramento persistidos', async (contexto) => {
  const { caminho, servico } = await prepararServico(contexto);
  await servico.registrarVoto({ candidatoId: 'lula' });
  const segundoServico = criarServicoVotacao(criarArmazenamento(caminho));
  await segundoServico.registrarVoto({ candidatoId: 'flavio_bolsonaro' });
  await segundoServico.encerrarVotacao();
  const terceiroServico = criarServicoVotacao(criarArmazenamento(caminho));
  assert.deepEqual(await terceiroServico.consultarResultado(),
    { flavio_bolsonaro: 1, lula: 1, total: 2, encerrada: true });
  await assert.rejects(terceiroServico.registrarVoto({ candidatoId: 'lula' }), { codigoHttp: 409 });
});

test('Fila ordena votos e encerramento sem permitir créditos posteriores', async (contexto) => {
  const { servico } = await prepararServico(contexto);
  const primeiros = Array.from({ length: 25 }, () => servico.registrarVoto({ candidatoId: 'lula' }));
  const fechamento = servico.encerrarVotacao();
  const posteriores = Array.from({ length: 25 }, () => servico.registrarVoto({ candidatoId: 'lula' }));
  const respostas = await Promise.allSettled([...primeiros, fechamento, ...posteriores]);
  assert.ok(respostas.slice(0, 26).every((resposta) => resposta.status === 'fulfilled'));
  assert.ok(respostas.slice(26).every((resposta) => resposta.status === 'rejected' && resposta.reason.codigoHttp === 409));
  assert.equal((await servico.consultarResultado()).total, 25);
});

test('Estado inválido nunca é substituído silenciosamente', async (contexto) => {
  const { caminho, armazenamento } = await prepararServico(contexto);
  for (const conteudo of ['{', JSON.stringify({ encerrada: false, votos: { lula: -1, flavio_bolsonaro: 0 } }),
    JSON.stringify({ encerrada: false, votos: { lula: 1.5, flavio_bolsonaro: 0 } }),
    JSON.stringify({ encerrada: 'false', votos: { lula: 0, flavio_bolsonaro: 0 } })]) {
    await writeFile(caminho, conteudo);
    await assert.rejects(armazenamento.lerEstadoDaUrna());
    assert.equal(await readFile(caminho, 'utf8'), conteudo);
  }
});

test('Falha de alteração não afeta dados e não bloqueia próximas operações', async (contexto) => {
  const { armazenamento, servico } = await prepararServico(contexto);
  await assert.rejects(armazenamento.atualizarEstadoDaUrna((estado) => { estado.votos.lula = -1; }));
  assert.equal((await armazenamento.lerEstadoDaUrna()).votos.lula, 0);
  await servico.registrarVoto({ candidatoId: 'lula' });
  assert.equal((await armazenamento.lerEstadoDaUrna()).votos.lula, 1);
});

test('Limite de precisão numérica rejeita incremento sem perda', async (contexto) => {
  const { armazenamento, servico } = await prepararServico(contexto);
  await armazenamento.atualizarEstadoDaUrna((estado) => { estado.votos.lula = Number.MAX_SAFE_INTEGER; });
  await assert.rejects(servico.registrarVoto({ candidatoId: 'lula' }), { codigoHttp: 409 });
  assert.equal((await armazenamento.lerEstadoDaUrna()).votos.lula, Number.MAX_SAFE_INTEGER);
});

test('Urna vazia pode encerrar e consultar resultado repetidamente', async (contexto) => {
  const { servico } = await prepararServico(contexto);
  await servico.encerrarVotacao();
  await servico.encerrarVotacao();
  assert.deepEqual(await servico.consultarResultado(),
    { flavio_bolsonaro: 0, lula: 0, total: 0, encerrada: true });
});
