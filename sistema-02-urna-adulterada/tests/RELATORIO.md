# Relatório do Projeto 02 — adulteração intencional

Simulação educacional — não é uma eleição real. Esta cópia implementa uma alteração deliberada e local para exercitar a detecção de diferenças de código por SHA-256. Os nomes são opções de votos fictícios; o experimento não faz alegações sobre eleições reais.

## Alteração aplicada

A pasta foi copiada integralmente de `sistema-01-urna-autentica`. Somente `src/votacao.js` foi alterado no código de execução:

- `CANDIDATO_FAVORECIDO` é `flavio_bolsonaro` e `QUANTIDADE_VOTOS_EXTRAS` é 2.
- Cada solicitação válida registra o voto escolhido e dois extras para a opção favorecida, em uma única atualização serializada e persistida.
- Validação e encerramento continuam impedindo qualquer acréscimo em pedidos rejeitados.
- A validação do limite numérico reserva espaço para os três créditos; se não houver espaço, rejeita a operação inteira.

Servidor, armazenamento, HTML, CSS, JavaScript do navegador, dependências, arquivo de versões travadas e README copiado permanecem idênticos byte a byte. O nome do pacote também foi preservado para manter `package.json` idêntico. O README copiado descreve a referência autêntica; este relatório documenta explicitamente a mudança desta segunda versão. Somente testes em `tests/` foram adaptados ou acrescentados além da alteração em `src/votacao.js`.

## Execução

Com Node.js 20 ou superior, na pasta desta cópia:

```bash
cd sistema-02-urna-adulterada
npm ci
npm test
PORT=3002 npm start
```

No PowerShell, substitua a última linha por:

```powershell
$env:PORT=3002
npm start
```

Abra <http://127.0.0.1:3002>. Para comparar simultaneamente, mantenha a original na porta 3001. Cada cópia utiliza o próprio `data/urna.json`. O estado inicial entregue está zerado e aberto. O comando de restauração descrito no README deve ser executado dentro da pasta da cópia desejada, com seu servidor parado.

## Exemplo reproduzível

Com a cópia zerada e em execução:

```bash
curl -X POST http://127.0.0.1:3002/api/votar -H 'Content-Type: application/json' -d '{"candidatoId":"lula"}'
```

O arquivo `data/urna.json` terá `lula=1`, `flavio_bolsonaro=2`, total 3. Em seguida:

```bash
curl -X POST http://127.0.0.1:3002/api/votar -H 'Content-Type: application/json' -d '{"candidatoId":"flavio_bolsonaro"}'
curl -X POST http://127.0.0.1:3002/api/encerrar -H 'Content-Type: application/json' -d '{}'
curl http://127.0.0.1:3002/api/resultado
```

Resultado esperado:

```json
{"flavio_bolsonaro":5,"lula":1,"total":6,"encerrada":true}
```

São dois votos escolhidos mais quatro extras. A mesma sequência na original gera um voto para cada opção, total 2. A interface da cópia apresenta as contagens persistidas, sem mudanças de texto, imagem ou estilo.

## Verificações automatizadas

`npm test` executa 34 casos distribuídos entre regras, API, interface e comparação de integridade. Todos usam dados temporários isolados; o exemplo obrigatório também é testado via Express sem modificar a urna entregue.

- Um pedido para Lula gera 1 para Lula e 2 para Flávio Bolsonaro; um pedido para Flávio Bolsonaro gera 3 para ele e 0 para Lula.
- A sequência obrigatória produz contagens 1/2 e depois 1/5, total 6.
- Cem registros concorrentes entre serviços produzem 300 créditos; oitenta requisições concorrentes produzem 240 créditos, sem perdas.
- Dados inválidos e votação encerrada não geram votos escolhidos nem extras. Persistência após recriar a instância, encerramento concorrente, corrupção e limites numéricos continuam cobertos.
- Os testes copiados da interface exercitam envio duplicado, resultado, porcentagens, empate e indisponibilidade.
- `tests/integridade.test.js` compara a árvore completa de arquivos monitorados e seus hashes SHA-256. Exclui `tests/`, `data/`, `node_modules/`, `.git/` e documentação `.md`; exige os mesmos caminhos e exatamente uma diferença: `src/votacao.js`. Necessita da pasta original ao lado desta cópia e pode ser executado por `node --test tests/integridade.test.js`.
- O teste de preservação confirma que votar e encerrar não alteram os arquivos de produção.

As rotas são exercitadas através do Express e de fluxos HTTP nativos em memória, sem abrir portas. Os testes da interface usam um DOM mínimo e não substituem inspeção visual no navegador.

Este teste comparativo não cria um manifesto confiável. No Projeto 03, a referência deverá ser gerada explicitamente a partir da original validada, nunca a partir desta cópia.
