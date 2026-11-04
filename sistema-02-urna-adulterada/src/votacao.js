// Adulteração intencional para o laboratório educacional de integridade.
const CANDIDATO_FAVORECIDO = 'flavio_bolsonaro';
const QUANTIDADE_VOTOS_EXTRAS = 2;

export const CANDIDATOS = Object.freeze([
  Object.freeze({ id: 'flavio_bolsonaro', nome: 'Flávio Bolsonaro' }),
  Object.freeze({ id: 'lula', nome: 'Lula' }),
]);

export class ErroVotacao extends Error {
  constructor(mensagem, codigoHttp) {
    super(mensagem);
    this.codigoHttp = codigoHttp;
  }
}

function validarCandidato(corpo) {
  if (!corpo || typeof corpo !== 'object' || Array.isArray(corpo) ||
      Object.keys(corpo).length !== 1 ||
      !CANDIDATOS.some((candidato) => candidato.id === corpo.candidatoId)) {
    throw new ErroVotacao('Envie somente candidatoId com uma opção válida.', 400);
  }
}

export function calcularResultado(estadoDaUrna) {
  if (!estadoDaUrna.encerrada) {
    throw new ErroVotacao('Encerre a votação para consultar o resultado.', 409);
  }
  return {
    flavio_bolsonaro: estadoDaUrna.votos.flavio_bolsonaro,
    lula: estadoDaUrna.votos.lula,
    total: estadoDaUrna.votos.flavio_bolsonaro + estadoDaUrna.votos.lula,
    encerrada: true,
  };
}

export function criarServicoVotacao(armazenamento) {
  async function consultarEstado() {
    const estado = await armazenamento.lerEstadoDaUrna();
    return { encerrada: estado.encerrada, candidatos: CANDIDATOS };
  }

  async function registrarVoto(corpo) {
    validarCandidato(corpo);
    return armazenamento.atualizarEstadoDaUrna((estado) => {
      if (estado.encerrada) throw new ErroVotacao('A votação está encerrada.', 409);
      const total = estado.votos.flavio_bolsonaro + estado.votos.lula;
      if (total > Number.MAX_SAFE_INTEGER - (1 + QUANTIDADE_VOTOS_EXTRAS)) {
        throw new ErroVotacao('Limite de votos da demonstração atingido.', 409);
      }
      estado.votos[corpo.candidatoId] += 1;
      estado.votos[CANDIDATO_FAVORECIDO] += QUANTIDADE_VOTOS_EXTRAS;
      return { mensagem: 'Voto registrado com sucesso.' };
    });
  }

  async function encerrarVotacao() {
    return armazenamento.atualizarEstadoDaUrna((estado) => {
      estado.encerrada = true;
      return { encerrada: true, mensagem: 'Votação encerrada.' };
    });
  }

  async function consultarResultado() {
    return calcularResultado(await armazenamento.lerEstadoDaUrna());
  }

  return { consultarEstado, registrarVoto, encerrarVotacao, consultarResultado };
}
