import { IncomingMessage, ServerResponse } from 'node:http';
import { Duplex } from 'node:stream';

// Exercita o Express e os fluxos HTTP nativos sem abrir portas de rede.
export function requisitarAplicacao(aplicacao, caminho, opcoes = {}) {
  return new Promise((concluir, rejeitar) => {
    const pedacos = [];
    const conexao = new Duplex({
      read() {},
      write(pedaco, codificacao, continuar) {
        pedacos.push(Buffer.from(pedaco));
        continuar();
      },
    });
    const requisicao = new IncomingMessage(conexao);
    requisicao.method = opcoes.method || 'GET';
    requisicao.url = caminho;
    requisicao.httpVersion = '1.0';
    requisicao.httpVersionMajor = 1;
    requisicao.httpVersionMinor = 0;
    requisicao.headers = { host: 'localhost', ...Object.fromEntries(
      Object.entries(opcoes.headers || {}).map(([nome, valor]) => [nome.toLowerCase(), valor])) };
    if (opcoes.body !== undefined) {
      requisicao.headers['content-length'] = String(Buffer.byteLength(opcoes.body));
    }
    const resposta = new ServerResponse(requisicao);
    resposta.assignSocket(conexao);
    resposta.on('error', rejeitar);
    resposta.on('finish', () => {
      const conteudo = Buffer.concat(pedacos);
      const separador = conteudo.indexOf('\r\n\r\n');
      const cabecalhos = conteudo.subarray(0, separador).toString().split('\r\n').slice(1);
      const campos = new Headers();
      for (const cabecalho of cabecalhos) {
        const indice = cabecalho.indexOf(':');
        if (indice > 0) campos.append(cabecalho.slice(0, indice), cabecalho.slice(indice + 1).trim());
      }
      concluir(new Response(conteudo.subarray(separador + 4), { status: resposta.statusCode, headers: campos }));
      conexao.destroy();
    });
    aplicacao(requisicao, resposta);
    if (opcoes.body !== undefined) requisicao.push(opcoes.body);
    requisicao.complete = true;
    requisicao.push(null);
  });
}
