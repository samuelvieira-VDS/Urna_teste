import express from 'express';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { criarArmazenamento } from './src/armazenamento.js';
import { criarServicoVotacao, ErroVotacao } from './src/votacao.js';

const DIRETORIO = fileURLToPath(new URL('.', import.meta.url));

export async function criarAplicacao({ caminhoDados = resolve(DIRETORIO, 'data/urna.json') } = {}) {
  const armazenamento = criarArmazenamento(caminhoDados);
  await armazenamento.lerEstadoDaUrna();
  const servico = criarServicoVotacao(armazenamento);
  const aplicacao = express();
  aplicacao.disable('x-powered-by');
  aplicacao.use('/api', (requisicao, resposta, proximo) => {
    resposta.set('Cache-Control', 'no-store');
    proximo();
  });
  aplicacao.use(express.json({ limit: '2kb', strict: true }));
  function tratarOperacao(operacao) {
    return (requisicao, resposta, proximo) => {
      Promise.resolve().then(() => operacao(requisicao, resposta)).catch(proximo);
    };
  }
  aplicacao.get('/api/estado', tratarOperacao(async (requisicao, resposta) => {
    resposta.json(await servico.consultarEstado());
  }));
  aplicacao.post('/api/votar', tratarOperacao(async (requisicao, resposta) => {
    resposta.json(await servico.registrarVoto(requisicao.body));
  }));
  aplicacao.post('/api/encerrar', tratarOperacao(async (requisicao, resposta) => {
    resposta.json(await servico.encerrarVotacao());
  }));
  aplicacao.get('/api/resultado', tratarOperacao(async (requisicao, resposta) => {
    resposta.json(await servico.consultarResultado());
  }));
  aplicacao.use(express.static(resolve(DIRETORIO, 'public')));
  aplicacao.use((requisicao, resposta) => {
    resposta.status(404).json({ mensagem: 'Caminho não encontrado.' });
  });
  aplicacao.use((erro, requisicao, resposta, proximo) => {
    if (erro instanceof ErroVotacao) {
      return resposta.status(erro.codigoHttp).json({ mensagem: erro.message });
    }
    if (erro.type === 'entity.parse.failed') {
      return resposta.status(400).json({ mensagem: 'Corpo JSON inválido.' });
    }
    if (erro.type === 'entity.too.large') {
      return resposta.status(413).json({ mensagem: 'Corpo da requisição muito grande.' });
    }
    resposta.status(500).json({ mensagem: 'Não foi possível concluir a operação.' });
  });
  return aplicacao;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const aplicacao = await criarAplicacao();
    const porta = process.env.PORT || 3001;
    const servidor = aplicacao.listen(porta, '127.0.0.1', () => {
      console.log(`Urna de demonstração: http://127.0.0.1:${porta}`);
    });
    servidor.on('error', () => {
      console.error('Não foi possível iniciar o servidor. Verifique a porta.');
      process.exitCode = 1;
    });
  } catch {
    console.error('Não foi possível carregar a urna. Verifique o arquivo de dados.');
    process.exitCode = 1;
  }
}
