import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { gerarManifestoConfiavel, CAMINHO_MANIFESTO } from './src/manifesto.js';
import { verificarIntegridade, formatarRelatorio } from './src/verificacao.js';

export function interpretarArgumentos(argumentos) {
  const [comando, ...opcoes] = argumentos;
  const permitidas = comando === 'gerar-referencia' ? ['--diretorio', '--sobrescrever'] :
    comando === 'verificar' ? ['--primeiro', '--segundo', '--json'] : [];
  if (!permitidas.length) throw new Error('Use gerar-referencia --diretorio PASTA ou verificar --primeiro PASTA --segundo PASTA [--json].');
  const valores = Object.create(null);
  for (let indice = 0; indice < opcoes.length; indice += 1) {
    const opcao = opcoes[indice];
    if (!permitidas.includes(opcao) || Object.hasOwn(valores, opcao)) throw new Error(`Opção desconhecida ou duplicada: ${opcao}`);
    if (['--sobrescrever', '--json'].includes(opcao)) valores[opcao] = true;
    else {
      const valor = opcoes[++indice];
      if (!valor || valor.startsWith('--')) throw new Error(`Informe um caminho para ${opcao}.`);
      valores[opcao] = valor;
    }
  }
  const obrigatorias = comando === 'gerar-referencia' ? ['--diretorio'] : ['--primeiro', '--segundo'];
  for (const opcao of obrigatorias) if (!valores[opcao]) throw new Error(`Opção obrigatória ausente: ${opcao}`);
  return { comando, valores };
}

export async function executar(argumentos, { escrever = console.log, escreverErro = console.error, caminhoManifesto = CAMINHO_MANIFESTO } = {}) {
  try {
    const { comando, valores } = interpretarArgumentos(argumentos);
    if (comando === 'gerar-referencia') {
      if (valores['--sobrescrever']) escreverErro('ALERTA: substituição explícita da referência. Confirme por revisão manual que a origem é confiável.');
      const manifesto = await gerarManifestoConfiavel(valores['--diretorio'], { caminhoManifesto, sobrescrever: Boolean(valores['--sobrescrever']) });
      escrever(`Referência criada explicitamente. SHA-256 agregado: ${manifesto.hashAgregado}`);
      escrever('Proteja o manifesto fora das urnas: repositório somente leitura, mídia confiável ou assinatura.');
    } else {
      const relatorio = await verificarIntegridade(valores['--primeiro'], valores['--segundo'], { caminhoManifesto });
      escrever(valores['--json'] ? JSON.stringify(relatorio, null, 2) : formatarRelatorio(relatorio));
    }
    return 0;
  } catch (erro) {
    escreverErro(`Erro: ${erro.message}`);
    return 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = await executar(process.argv.slice(2));
}
