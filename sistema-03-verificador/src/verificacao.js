import { resolve } from 'node:path';
import { calcularHashAgregado, compararCaminhos, listarArquivosMonitorados } from './arquivos.js';
import { carregarManifestoConfiavel } from './manifesto.js';

export function compararManifestos(esperados, encontrados) {
  const caminhos = [...new Set([...Object.keys(esperados), ...Object.keys(encontrados)])].sort(compararCaminhos);
  return caminhos.flatMap((caminho) => {
    const esperado = Object.hasOwn(esperados, caminho) ? esperados[caminho] : null;
    const encontrado = Object.hasOwn(encontrados, caminho) ? encontrados[caminho] : null;
    if (esperado === encontrado) return [];
    return [{ caminho, tipo: esperado === null ? 'ADICIONAL' : encontrado === null ? 'AUSENTE' : 'ALTERADO', esperado, encontrado }];
  });
}

export async function verificarIntegridade(primeiro, segundo, { caminhoManifesto } = {}) {
  const manifesto = await carregarManifestoConfiavel(caminhoManifesto);
  async function analisarPasta(diretorio) {
    const arquivos = await listarArquivosMonitorados(diretorio);
    const divergencias = compararManifestos(manifesto.arquivos, arquivos);
    return { diretorio: resolve(diretorio), hashAgregado: calcularHashAgregado(arquivos),
      status: divergencias.length ? 'DIVERGENTE_DA_REFERENCIA' : 'COMPATIVEL_COM_REFERENCIA', divergencias };
  }
  const pastas = await Promise.all([analisarPasta(primeiro), analisarPasta(segundo)]);
  const primeiraCompativel = pastas[0].status === 'COMPATIVEL_COM_REFERENCIA';
  const segundaCompativel = pastas[1].status === 'COMPATIVEL_COM_REFERENCIA';
  const conclusao = primeiraCompativel && segundaCompativel ? 'Ambas correspondem à referência' :
    primeiraCompativel ? 'Primeira pasta corresponde à referência confiável' :
      segundaCompativel ? 'Segunda pasta corresponde à referência confiável' : 'Nenhuma corresponde à referência';
  return { algoritmo: 'sha256', hashAgregadoEsperado: manifesto.hashAgregado, pastas, conclusao };
}

export function formatarRelatorio(relatorio) {
  const linhas = [`SHA-256 agregado esperado: ${relatorio.hashAgregadoEsperado}`];
  for (const [indice, pasta] of relatorio.pastas.entries()) {
    linhas.push('', `Pasta ${indice + 1}: ${pasta.status}`, `Diretório: ${pasta.diretorio}`, `SHA-256 agregado calculado: ${pasta.hashAgregado}`);
    for (const divergencia of pasta.divergencias) {
      linhas.push(`Arquivo divergente: ${divergencia.caminho} (${divergencia.tipo})`,
        `  SHA-256 esperado: ${divergencia.esperado ?? '(ausente na referência)'}`,
        `  SHA-256 encontrado: ${divergencia.encontrado ?? '(arquivo ausente)'}`);
    }
  }
  linhas.push('', `Conclusão: ${relatorio.conclusao}.`);
  return linhas.join('\n');
}
