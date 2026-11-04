import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { LIMITES, ErroRecebimento, verificarAutenticidade } from './src/recebimento.js';
import { EXTENSOES_MONITORADAS, PASTAS_EXCLUIDAS } from './src/arquivos.js';

const PAGINAS = { '/': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/style.css': ['style.css', 'text/css'] };

export function criarAtendimento({ caminhoManifesto } = {}) {
  const token = randomBytes(32).toString('hex');
  let operacoesAtivas = 0;
  return async (requisicao, resposta) => {
    resposta.setHeader('Cache-Control', 'no-store');
    resposta.setHeader('X-Content-Type-Options', 'nosniff');
    resposta.setHeader('Referrer-Policy', 'no-referrer');
    resposta.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    function responderJson(codigo, dados) {
      resposta.writeHead(codigo, { 'Content-Type': 'application/json; charset=utf-8' });
      resposta.end(JSON.stringify(dados));
    }
    if (!/^(localhost|127\.0\.0\.1)(:\d{1,5})?$/i.test(requisicao.headers.host ?? '')) {
      return responderJson(403, { mensagem: 'Acesso permitido somente pelo endereço local.' });
    }
    if (requisicao.headers.origin && requisicao.headers.origin !== `http://${requisicao.headers.host}`) {
      return responderJson(403, { mensagem: 'Origem da requisição não autorizada.' });
    }
    try {
      if (requisicao.method === 'GET' && Object.hasOwn(PAGINAS, requisicao.url)) {
        const [arquivo, tipo] = PAGINAS[requisicao.url];
        const conteudo = await readFile(new URL(`./public/${arquivo}`, import.meta.url));
        resposta.writeHead(200, { 'Content-Type': `${tipo}; charset=utf-8` });
        return resposta.end(conteudo);
      }
      if (requisicao.method === 'GET' && requisicao.url === '/api/configuracao') {
        return responderJson(200, { token, limites: LIMITES, extensoes: EXTENSOES_MONITORADAS, pastasExcluidas: PASTAS_EXCLUIDAS });
      }
      if (requisicao.method !== 'POST' || requisicao.url !== '/api/verificar') {
        return responderJson(404, { mensagem: 'Caminho não encontrado.' });
      }
      const enviado = requisicao.headers['x-token-verificacao'];
      if (typeof enviado !== 'string' || !/^[a-f0-9]{64}$/.test(enviado) ||
          !timingSafeEqual(Buffer.from(enviado), Buffer.from(token))) {
        return responderJson(403, { mensagem: 'Sessão inválida. Recarregue a página e tente novamente.' });
      }
      if (!/^application\/json(?:\s*;|$)/i.test(requisicao.headers['content-type'] ?? '')) {
        return responderJson(415, { mensagem: 'Envie os arquivos pelo formulário da página.' });
      }
      if (operacoesAtivas >= 2) return responderJson(429, { mensagem: 'Há verificações em andamento. Tente novamente em instantes.' });
      if (Number(requisicao.headers['content-length']) > LIMITES.bytesRequisicao) {
        return responderJson(413, { mensagem: 'Envio acima do limite de tamanho.' });
      }
      operacoesAtivas += 1;
      try {
        const partes = [];
        let tamanho = 0;
        for await (const parte of requisicao) {
          tamanho += parte.length;
          if (tamanho > LIMITES.bytesRequisicao) {
            responderJson(413, { mensagem: 'Envio acima do limite de tamanho.' });
            return;
          }
          partes.push(parte);
        }
        let corpo;
        try { corpo = JSON.parse(Buffer.concat(partes).toString('utf8')); }
        catch { throw new ErroRecebimento('Envio inválido. Selecione as pastas e tente novamente.'); }
        responderJson(200, await verificarAutenticidade(corpo, { caminhoManifesto }));
      } finally { operacoesAtivas -= 1; }
    } catch (erro) {
      if (!resposta.headersSent) responderJson(erro instanceof ErroRecebimento ? erro.codigoHttp : 500,
        { mensagem: erro instanceof ErroRecebimento ? erro.message : 'Não foi possível concluir a verificação. Tente novamente.' });
    }
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const servidor = createServer(criarAtendimento());
  servidor.requestTimeout = 30_000;
  servidor.headersTimeout = 10_000;
  servidor.listen(process.env.PORT || 3003, '127.0.0.1', () => {
    console.log(`Sistema de Verificação de Autenticidade: http://localhost:${process.env.PORT || 3003}`);
  });
  servidor.on('error', () => { console.error('Não foi possível iniciar o servidor. Verifique a porta configurada.'); process.exitCode = 1; });
}
