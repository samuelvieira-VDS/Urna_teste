import { createHash } from 'node:crypto';
import { validarCaminhoSeguro, calcularHashAgregado, compararCaminhos } from './arquivos.js';
import { carregarManifestoConfiavel } from './manifesto.js';
import { compararManifestos } from './verificacao.js';

export const LIMITES = Object.freeze({ arquivosPorSistema: 250, bytesPorArquivo: 2 * 1024 * 1024,
  bytesTotais: 12 * 1024 * 1024, bytesRequisicao: 18 * 1024 * 1024 });

export class ErroRecebimento extends Error {
  constructor(mensagem, codigoHttp = 400) { super(mensagem); this.codigoHttp = codigoHttp; }
}

function validarChaves(objeto, chaves) {
  return objeto && typeof objeto === 'object' && !Array.isArray(objeto) &&
    Object.keys(objeto).length === chaves.length && chaves.every((chave) => Object.hasOwn(objeto, chave));
}

export async function verificarAutenticidade(corpo, { caminhoManifesto } = {}) {
  if (!validarChaves(corpo, ['sistemas']) || !Array.isArray(corpo.sistemas) || corpo.sistemas.length !== 2) {
    throw new ErroRecebimento('Envie os arquivos dos dois sistemas.');
  }
  let bytesTotais = 0;
  const recebidos = corpo.sistemas.map((sistema) => {
    if (!validarChaves(sistema, ['nome', 'arquivos']) || typeof sistema.nome !== 'string' ||
        !sistema.nome.trim() || sistema.nome.length > 120 || /[\u0000-\u001f\u007f]/u.test(sistema.nome) ||
        !Array.isArray(sistema.arquivos) || sistema.arquivos.length === 0) {
      throw new ErroRecebimento('Selecione uma pasta com arquivos monitorados para cada sistema.');
    }
    if (sistema.arquivos.length > LIMITES.arquivosPorSistema) throw new ErroRecebimento('Quantidade de arquivos acima do limite.', 413);
    const arquivos = Object.create(null);
    for (const arquivo of sistema.arquivos) {
      if (!validarChaves(arquivo, ['caminho', 'conteudoBase64']) || typeof arquivo.caminho !== 'string' || arquivo.caminho.length > 500) {
        throw new ErroRecebimento('Arquivo enviado com formato ou caminho inválido.');
      }
      try { validarCaminhoSeguro(arquivo.caminho); }
      catch { throw new ErroRecebimento('Caminho inseguro ou tipo de arquivo fora da política de monitoramento.'); }
      if (Object.hasOwn(arquivos, arquivo.caminho)) throw new ErroRecebimento(`Arquivo duplicado: ${arquivo.caminho}`);
      const conteudo = arquivo.conteudoBase64;
      if (typeof conteudo !== 'string' || conteudo.length > Math.ceil(LIMITES.bytesPorArquivo / 3) * 4) {
        throw new ErroRecebimento('Arquivo acima do limite de tamanho ou conteúdo inválido.', 413);
      }
      if ((conteudo.length % 4 !== 0 || /[^A-Za-z0-9+/=]/.test(conteudo))) {
        throw new ErroRecebimento('Conteúdo de arquivo inválido. Selecione a pasta novamente.');
      }
      const bytes = Buffer.from(conteudo, 'base64');
      if (bytes.toString('base64') !== conteudo) throw new ErroRecebimento('Codificação de arquivo inválida.');
      bytesTotais += bytes.length;
      if (bytes.length > LIMITES.bytesPorArquivo || bytesTotais > LIMITES.bytesTotais) {
        throw new ErroRecebimento('Tamanho dos arquivos acima do limite permitido.', 413);
      }
      arquivos[arquivo.caminho] = createHash('sha256').update(bytes).digest('hex');
    }
    return { nome: sistema.nome.trim(), arquivos };
  });
  let manifesto;
  try { manifesto = await carregarManifestoConfiavel(caminhoManifesto); }
  catch { throw new ErroRecebimento('Referência confiável indisponível ou inválida. Verificação inconclusiva; solicite a revisão do manifesto ao responsável.', 503); }
  const sistemas = recebidos.map(({ nome, arquivos }) => {
    const divergencias = compararManifestos(manifesto.arquivos, arquivos);
    const caminhos = [...new Set([...Object.keys(arquivos), ...Object.keys(manifesto.arquivos)])].sort(compararCaminhos);
    return { nome, status: divergencias.length ? 'DIVERGENTE_DA_REFERENCIA' : 'COMPATIVEL_COM_REFERENCIA',
      quantidadeArquivos: Object.keys(arquivos).length, hashAgregado: calcularHashAgregado(arquivos), divergencias,
      arquivos: caminhos.map((caminho) => ({ nome: caminho.split('/').at(-1), caminho,
        esperado: manifesto.arquivos[caminho] ?? null, encontrado: arquivos[caminho] ?? null,
        tipo: divergencias.find((divergencia) => divergencia.caminho === caminho)?.tipo ?? 'INTEGRO' })) };
  });
  const compativeis = sistemas.map((sistema) => sistema.status === 'COMPATIVEL_COM_REFERENCIA');
  const conclusao = compativeis.every(Boolean) ? 'Ambas correspondem à referência' :
    compativeis[0] ? 'Primeira pasta corresponde à referência confiável' :
      compativeis[1] ? 'Segunda pasta corresponde à referência confiável' : 'Nenhuma corresponde à referência';
  return { verificadoEm: new Date().toISOString(), algoritmo: 'sha256', hashAgregadoEsperado: manifesto.hashAgregado,
    sistemas, conclusao, observacao: 'Diferenças indicam alterações que precisam ser analisadas; não comprovam fraude. A correspondência depende da confiança no manifesto e não verifica os votos salvos.' };
}
