import { mkdir, readFile, writeFile, rename, unlink } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

const FILAS = new Map();

function criarEstadoInicial() {
  return { encerrada: false, votos: { flavio_bolsonaro: 0, lula: 0 } };
}

function validarEstado(estado) {
  if (!estado || typeof estado.encerrada !== 'boolean' ||
      !estado.votos || Object.keys(estado.votos).length !== 2 ||
      !['flavio_bolsonaro', 'lula'].every((candidatoId) =>
        Number.isSafeInteger(estado.votos[candidatoId]) && estado.votos[candidatoId] >= 0) ||
      !Number.isSafeInteger(estado.votos.flavio_bolsonaro + estado.votos.lula)) {
    throw new Error('Estado persistido inválido.');
  }
}

export function criarArmazenamento(caminhoArquivo) {
  const caminho = resolve(caminhoArquivo);

  function serializar(operacao) {
    const anterior = FILAS.get(caminho) ?? Promise.resolve();
    const atual = anterior.then(operacao);
    const conclusao = atual.catch(() => {});
    FILAS.set(caminho, conclusao);
    void conclusao.then(() => {
      if (FILAS.get(caminho) === conclusao) FILAS.delete(caminho);
    });
    return atual;
  }

  async function salvarEstadoDaUrna(estado) {
    validarEstado(estado);
    await mkdir(dirname(caminho), { recursive: true });
    const temporario = `${caminho}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporario, `${JSON.stringify(estado, null, 2)}\n`, { flag: 'wx' });
      await rename(temporario, caminho);
    } finally {
      await unlink(temporario).catch((erro) => {
        if (erro.code !== 'ENOENT') throw erro;
      });
    }
  }

  async function carregarEstado() {
    let conteudo;
    try {
      conteudo = await readFile(caminho, 'utf8');
    } catch (erro) {
      if (erro.code !== 'ENOENT') throw erro;
      const estado = criarEstadoInicial();
      await salvarEstadoDaUrna(estado);
      return estado;
    }
    const estado = JSON.parse(conteudo);
    validarEstado(estado);
    return estado;
  }

  function lerEstadoDaUrna() {
    return serializar(carregarEstado);
  }

  function atualizarEstadoDaUrna(alterarEstado) {
    return serializar(async () => {
      const estado = await carregarEstado();
      const resposta = await alterarEstado(estado);
      await salvarEstadoDaUrna(estado);
      return resposta;
    });
  }

  return { lerEstadoDaUrna, atualizarEstadoDaUrna };
}
