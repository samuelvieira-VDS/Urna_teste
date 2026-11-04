# Urna de demonstração

Simulação educacional — não é uma eleição real. As opções fictícias são Flávio Bolsonaro e Lula (Luiz Inácio Lula da Silva). Não há identificação de eleitor nem limite de votos por pessoa. Esta aplicação é a referência íntegra do exercício: cada solicitação válida registra exatamente um voto para a opção escolhida.

## Instalação e execução

Requer Node.js 20 ou superior e npm. No terminal, a partir da pasta que contém os projetos:

```bash
cd sistema-01-urna-autentica
npm install
npm test
npm start
```

Abra <http://127.0.0.1:3001>. O servidor aceita conexões apenas da máquina local. Para escolher outra porta no Linux/macOS:

```bash
PORT=3002 npm start
```

No PowerShell:

```powershell
$env:PORT=3002
npm start
```

Escolha uma opção e clique em **Confirmar voto**. Durante o envio, os controles ficam desabilitados para evitar cliques duplicados. É possível registrar diversos votos fictícios. **Encerrar votação** persiste o encerramento; **Ver resultado** mostra votos, total, porcentagens e empate ou maior votação. Uma urna sem votos apresenta 0% para ambas as opções e empate. Porcentagens são arredondadas para até duas casas decimais.

## Persistência

`data/urna.json` é criado automaticamente quando ausente, assim como sua pasta. O caminho é relativo ao projeto, independentemente do diretório de onde o Node.js for iniciado. Contagens e encerramento permanecem após reiniciar o servidor.

`src/votacao.js` concentra as regras de crédito, validação e encerramento. `src/armazenamento.js` serializa operações completas de leitura, alteração e gravação por caminho, inclusive entre instâncias no mesmo processo. A escrita usa arquivo temporário exclusivo e substituição por `rename`; arquivos temporários são removidos. Somente o estado persistente é alterado: os arquivos de código permanecem intactos.

Execute **um único processo Node.js por arquivo de dados**. A fila é local ao processo, não é um bloqueio entre processos. O sistema é uma demonstração local, sem autenticação nem garantias para eleições reais ou recuperação contra falhas físicas de disco. Dados inválidos ou corrompidos causam erro, sem zerar silenciosamente o arquivo existente.

## Restaurar a demonstração

Pare o servidor com `Ctrl+C` e execute, dentro desta pasta, o comando abaixo. Ele apaga as contagens fictícias anteriores e reabre a votação:

```bash
node --input-type=module -e 'import { mkdir, writeFile } from "node:fs/promises"; await mkdir("data", { recursive: true }); await writeFile("data/urna.json", JSON.stringify({ encerrada: false, votos: { flavio_bolsonaro: 0, lula: 0 } }, null, 2) + "\n");'
```

O comando também pode ser executado no PowerShell. Reinicie com `npm start`. Não existe endpoint HTTP de limpeza.

## API

Todas as respostas da API são JSON, sem cache. Erros usam `{ "mensagem": "..." }` e não expõem caminhos ou detalhes internos.

| Método e rota | Comportamento |
| --- | --- |
| `GET /api/estado` | Estado real de encerramento e lista de candidatos, sem contagem |
| `POST /api/votar` | Recebe somente `{ "candidatoId": "lula" }` ou `{ "candidatoId": "flavio_bolsonaro" }`; retorna `{ "mensagem": "Voto registrado com sucesso." }` |
| `POST /api/encerrar` | Encerra de forma idempotente; retorna `{ "encerrada": true, "mensagem": "Votação encerrada." }` |
| `GET /api/resultado` | Retorna as duas contagens, `total` e `encerrada: true`; exige encerramento |

Candidato, formato ou campos extras inválidos retornam 400. JSON malformado retorna 400; corpo acima de 2 KiB retorna 413. Voto após encerramento e resultado antes do encerramento retornam 409. Falhas internas retornam 500. O cliente não escolhe quantidades. As contagens são inteiros não negativos com limite de precisão segura do JavaScript.

Exemplo com o servidor em execução:

```bash
curl http://127.0.0.1:3001/api/estado
curl -X POST http://127.0.0.1:3001/api/votar -H 'Content-Type: application/json' -d '{"candidatoId":"lula"}'
curl -X POST http://127.0.0.1:3001/api/encerrar -H 'Content-Type: application/json' -d '{}'
curl http://127.0.0.1:3001/api/resultado
```

## Testes

```bash
npm test
```

Os testes usam diretórios temporários isolados, removidos ao final; não alteram os votos da demonstração.

- `tests/votacao.test.js`: crédito exato para cada candidato, dois votos, 100 registros concorrentes entre instâncias, rejeição de entrada inválida, encerramento concorrente, persistência após recriar o serviço, corrupção, recuperação da fila e limite numérico.
- `tests/api.test.js`: contratos JSON e status HTTP através do Express, 80 votos concorrentes, rejeição de quantidades e JSON malformado, encerramento, recriação da aplicação, dados corrompidos, arquivos estáticos e preservação dos arquivos de produção.
- `tests/interface.test.js`: confirmação, bloqueio de envio duplicado, urna encerrada, total, porcentagens, empate, maior votação e falha de conexão. Executa o JavaScript da interface com um DOM mínimo em memória; não substitui inspeção visual em navegador.
- `tests/auxiliares.js`: adaptador de testes que utiliza `IncomingMessage`, `ServerResponse` e fluxos nativos para exercitar o Express sem abrir portas. As requisições percorrem o analisador JSON, as rotas e o tratamento de erros reais.

Para executar uma camada separadamente:

```bash
node --test tests/votacao.test.js
node --test tests/api.test.js
node --test tests/interface.test.js
```

## Próximos projetos

Preserve esta versão validada como referência. O Projeto 02 poderá copiar a árvore e modificar somente `src/votacao.js`. O Projeto 03 deverá criar explicitamente a referência SHA-256 a partir desta versão e excluir `data/urna.json`, `node_modules/` e demais dados mutáveis. Registrar votos não muda os arquivos-fonte. Hashes verificam diferenças em relação a uma referência confiável; não comprovam a correção de uma eleição.
