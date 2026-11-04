# Verificador de integridade SHA-256

Ferramenta local e independente, em Node.js 20 ou superior, para comparar duas árvores de código com uma referência estabelecida explicitamente. Não consulta telas, APIs, contagens de votos nem hashes fornecidos pelas urnas. Os nomes das pastas não determinam o resultado.

Simulação educacional — não é uma eleição real.

## Executar a verificação

O projeto usa somente módulos nativos; não precisa baixar dependências ou iniciar as urnas. A referência entregue foi criada explicitamente a partir de `../sistema-01-urna-autentica`, depois de revisar sua regra de crédito e executar seus testes. **Para verificar, não gere a referência novamente.**

```bash
cd sistema-03-verificador
npm test
npm run verificar -- --primeiro ../sistema-01-urna-autentica --segundo ../sistema-02-urna-adulterada
```

Resultado esperado para os arquivos entregues:

```text
Pasta 1: COMPATIVEL_COM_REFERENCIA
Pasta 2: DIVERGENTE_DA_REFERENCIA
Arquivo divergente: src/votacao.js (ALTERADO)
Conclusão: Primeira pasta corresponde à referência confiável.
```

O relatório completo mostra o hash agregado esperado, os hashes agregados encontrados e os hashes esperado/encontrado de cada arquivo divergente. `AUSENTE` indica arquivo da referência removido; `ADICIONAL` indica novo arquivo monitorado. Os conjuntos de caminhos também são comparados: não basta que os arquivos restantes tenham hashes iguais.

A CLI permanece disponível. Para usar a nova interface web, siga as instruções abaixo.

## Interface web

Inicie o servidor local uma vez:

```bash
cd sistema-03-verificador
npm start
```

Abra **http://localhost:3003**. A partir desse ponto, todas as verificações, consultas de hashes e exportações são feitas pelo navegador. Não é necessário iniciar as urnas.

1. Em **Sistema 1 — Urna Autêntica**, selecione a pasta completa `sistema-01-urna-autentica`.
2. Em **Sistema 2 — Urna Adulterada**, selecione a pasta completa `sistema-02-urna-adulterada`.
3. Confirme a seleção se o navegador pedir autorização. Escolha a raiz de cada projeto, onde está `package.json`, para preservar os caminhos `src/` e `public/`.
4. Clique em **Verificar Autenticidade**. Cada painel apresenta status, quantidade de arquivos recebidos, hash agregado e hashes esperado/encontrado de todos os arquivos, inclusive dos ausentes.
5. Clique em **Baixar Relatório** para salvar o resultado mostrado em JSON, com data/hora, sistemas, hashes, divergências e conclusão.

Use um navegador com suporte à seleção de pastas (`webkitdirectory`), como Chrome, Edge ou Firefox. Não selecione uma pasta superior contendo todos os projetos nem somente `src/`. Uma seleção incompleta será comparada como foi recebida e poderá indicar arquivos removidos. A contagem mostra arquivos recebidos; a tabela também mostra os arquivos esperados ausentes.

Os títulos dos painéis são rótulos do laboratório; o resultado depende dos hashes, inclusive se as pastas forem trocadas. Verde indica correspondência; vermelho indica alterações a analisar; amarelo indica verificação ainda não concluída, erro de seleção ou referência indisponível. Os estados também são apresentados por texto. Mudar a seleção invalida o relatório anterior.

O navegador filtra as exclusões antes de ler e enviar o conteúdo. Os arquivos seguem apenas para o servidor local, são processados em memória e **não são gravados nem executados**. Os hashes são calculados no backend sobre os bytes reais, sem reformatar texto.

### Proteções e limites da interface

O backend usa somente HTTP nativo do Node.js, sem serviços externos. Escuta em `127.0.0.1:3003`, com porta opcional por `PORT`. Exige endereço local, mesma origem e token de sessão no envio. Não habilita CORS, não serve o manifesto e não oferece rotas para gerar ou substituir a referência. O manifesto existente é somente lido; sua proteção contra outros processos depende das permissões do sistema operacional e das medidas de confiança descritas adiante.

- Até 250 arquivos monitorados por sistema.
- Até 2 MiB por arquivo e 12 MiB de bytes de arquivos no total das duas pastas.
- Até 18 MiB no corpo HTTP, incluindo JSON e Base64.
- Até duas operações simultâneas por processo e tempos limitados de leitura HTTP.
- Extensões aceitas seguem a mesma política da CLI. Tipos MIME declarados pelo navegador não comprovam o conteúdo.
- Caminhos absolutos, travessia de diretórios, nomes inseguros, arquivos repetidos, Base64 inválida e campos fora do contrato são rejeitados.

Um manifesto selecionado junto dos arquivos nunca é considerado confiável: a interface o exclui; o backend recusa tentativas de enviá-lo como arquivo monitorado ou como campo adicional. A única referência utilizada é a previamente estabelecida no servidor.

A seleção pelo navegador transmite caminhos relativos e bytes, sem metadados de links do sistema de arquivos. O backend não resolve esses caminhos em disco e não segue destinos de links recebidos. A política de rejeitar links na varredura em disco continua aplicável à CLI.

### API e relatório web

`GET /api/configuracao` retorna token da sessão, limites e política de seleção. `POST /api/verificar` recebe JSON com cabeçalho `X-Token-Verificacao`:

```json
{
  "sistemas": [
    { "nome": "primeira-pasta", "arquivos": [{ "caminho": "server.js", "conteudoBase64": "YQ==" }] },
    { "nome": "segunda-pasta", "arquivos": [{ "caminho": "server.js", "conteudoBase64": "YQ==" }] }
  ]
}
```

O exemplo mínimo ilustra o contrato; sem os demais arquivos, a comparação indicará ausências. Hashes fornecidos pelo cliente não são aceitos.

O JSON exportado contém `verificadoEm` (ISO 8601), `algoritmo`, `hashAgregadoEsperado`, `sistemas`, `conclusao` e `observacao`. Cada sistema contém `nome`, `status`, `quantidadeArquivos`, `hashAgregado`, `divergencias` e `arquivos`. Cada arquivo contém `nome`, `caminho`, `tipo`, `esperado` e `encontrado`. Tipos: `INTEGRO`, `ALTERADO`, `ADICIONAL` e `AUSENTE`. Hash inexistente é `null`. O horário é informativo, não certificado.

Respostas: 200 para comparação concluída, inclusive divergente; 400 para envio inválido; 403 para origem/sessão não autorizada; 413 para limites excedidos; 415 para formato HTTP não aceito; 429 para excesso de operações; 503 para referência indisponível/inválida; 500 para falha interna. Erros retornam `{ "mensagem": "..." }` sem detalhes internos. Uma referência indisponível produz resultado inconclusivo, nunca compatibilidade presumida.

## Criação controlada da referência

Este comando é uma operação separada, destinada somente a estabelecer uma referência **depois de revisar e validar manualmente o código original**:

```bash
npm run gerar-referencia -- --diretorio ../sistema-01-urna-autentica
```

O destino fixo da CLI é `referencia/manifesto-confiavel.json`, relativo ao próprio projeto, independentemente do diretório corrente. A pasta de origem precisa existir, não ser um link simbólico e conter os sete arquivos essenciais: `server.js`, `src/votacao.js`, `src/armazenamento.js`, `public/index.html`, `public/app.js`, `public/style.css` e `package.json`. O lockfile JSON também é monitorado quando existe.

Se já houver manifesto, a criação é recusada e os bytes existentes são preservados. Somente uma operação explícita com `--sobrescrever` permite substituir uma referência após nova revisão:

```bash
npm run gerar-referencia -- --diretorio ../sistema-01-urna-autentica --sobrescrever
```

A substituição emite alerta de revisão manual e utiliza arquivo temporário seguido de `rename`. **Nunca use a urna adulterada para gerar a referência deste laboratório.** A ferramenta não consegue determinar por conta própria se uma origem fornecida pelo operador é confiável.

O comando `verificar` apenas lê o manifesto existente. Não cria, corrige, atualiza ou substitui a referência; `--sobrescrever` é uma opção inválida nesse comando. Manifesto ausente, malformado, com chaves duplicadas, hashes inválidos, arquivos essenciais ausentes ou hash agregado inconsistente causa erro operacional, sem produzir resultado compatível.

**Proteja o manifesto:** mantenha uma cópia em repositório somente leitura, mídia confiável ou use uma assinatura com chave confiável. O hash agregado dentro do próprio JSON detecta inconsistências, mas não autentica quem produziu ou substituiu esse JSON.

## Política de monitoramento

São incluídos recursivamente arquivos regulares com extensões **`.js`, `.mjs`, `.cjs`, `.html`, `.css` e `.json`**, com distinção entre maiúsculas e minúsculas. Os bytes reais são usados sem normalizar espaços, quebras de linha ou conteúdo. Mudanças de formatação também produzem divergência.

Exclusões, em qualquer nível:

- Pastas ou entradas chamadas `data`, `tests`, `node_modules`, `.git`, `coverage`, `logs`, `tmp` e `temp`.
- `.env`, nomes iniciados por `.env.` e `manifesto-confiavel.json`.
- Nomes com sufixos `.log`, `.tmp`, `.temp`, `.swp` ou `~`, inclusive antes de outro ponto, como `copia.tmp.js`.
- Arquivos sem uma das extensões permitidas, incluindo documentação `.md`, imagens e `.gitignore`.

**Qualquer código ou configuração fora dessa política não é autenticado pelo experimento.** Em particular, dependências instaladas, variáveis de ambiente e conteúdo de testes não são auditados. Um lockfile compatível não prova que o conteúdo instalado em `node_modules/` coincide com ele.

Os caminhos são relativos, usam `/` e não contêm segmentos vazios, `.` ou `..`, barras invertidas, dois-pontos ou caracteres de controle. A referência não armazena caminhos absolutos. Links simbólicos são recusados na raiz e nas entradas não excluídas, inclusive quando apontam para dentro da árvore; essa política mais restritiva evita escapes e ciclos. Entradas excluídas não são percorridas. A leitura de arquivos usa abertura sem seguir links quando o sistema suporta `O_NOFOLLOW`.

Analise uma árvore estável, sem edição simultânea dos fontes. A varredura não é um instantâneo transacional do sistema de arquivos e depende da integridade do sistema operacional, do Node.js e da ferramenta.

## Hash agregado e manifesto

Os caminhos são ordenados por comparação ordinal de strings JavaScript, sem ordenação dependente de idioma. Para cada caminho ordenado, concatena-se:

```text
caminho relativo + NUL (U+0000) + hash hexadecimal minúsculo + LF (U+000A)
```

A sequência inteira é codificada em UTF-8 e resumida com SHA-256. Não se inclui data de geração, nome da pasta ou caminho absoluto no agregado. A ordem de enumeração das pastas e a ordem das propriedades JSON não alteram o resultado.

O manifesto tem o esquema:

```text
versao: 1
algoritmo: "sha256"
geradoEm: data ISO 8601
hashAgregado: SHA-256 hexadecimal de 64 caracteres
arquivos: objeto { "caminho/relativo.js": "SHA-256 hexadecimal" }
```

A data indica quando a referência foi gerada; não é um carimbo de tempo certificado.

## Relatório JSON e códigos de saída

```bash
npm run --silent verificar -- --primeiro ../sistema-01-urna-autentica --segundo ../sistema-02-urna-adulterada --json
```

Ou execute diretamente para obter somente JSON na saída padrão:

```bash
node cli.js verificar --primeiro ../sistema-01-urna-autentica --segundo ../sistema-02-urna-adulterada --json
```

Esquema do relatório:

- `algoritmo`: `sha256`.
- `hashAgregadoEsperado`: agregado do manifesto carregado.
- `pastas`: duas entradas na mesma ordem de `--primeiro` e `--segundo`, cada uma com `diretorio` absoluto informativo, `hashAgregado` calculado, `status` e `divergencias`.
- `status`: `COMPATIVEL_COM_REFERENCIA` ou `DIVERGENTE_DA_REFERENCIA`.
- Cada divergência contém `caminho`, `tipo` (`ALTERADO`, `AUSENTE` ou `ADICIONAL`), `esperado` e `encontrado`. Um hash inexistente é representado por `null`.
- `conclusao`: primeira pasta corresponde, segunda pasta corresponde, ambas correspondem ou nenhuma corresponde, conforme os arquivos efetivamente analisados.

| Código | Significado |
| --- | --- |
| `0` | Operação concluída, inclusive quando há divergências. Consulte `status` e `conclusao`. |
| `2` | Erro operacional: argumentos inválidos, referência ausente/inválida, falha de leitura, link recusado ou geração não autorizada a substituir arquivo existente. |

Erros são enviados à saída de erro em português, inclusive em modo `--json`; não é emitido relatório parcial de compatibilidade. A CLI recusa argumentos desconhecidos ou duplicados.

## Testes

```bash
npm test
```

Os 23 casos originais de verificação usam árvores fictícias em diretórios temporários e cobrem: compatibilidade dupla, mudança de um byte, arquivo ausente/adicional, exclusão do estado mutável, determinismo do agregado, preservação dos arquivos e do manifesto, referências inválidas ou duplicadas, quatro conclusões possíveis, caminhos maliciosos, links externos/internos, diretório inválido, geração exclusiva, substituição explícita e opções/saídas da CLI. Os testes não regeneram a referência entregue nem gravam nas urnas reais.

A interface acrescenta 16 casos: 9 de upload/API e 7 do JavaScript do navegador. Cobrem arquivos modificados/adicionados/removidos, segurança de caminhos, limites, referência inválida, comparação das urnas entregues, seleção, filtragem, envio dos bytes, painéis, indicadores, bloqueio de envio duplicado e download JSON. A API é exercitada com fluxos HTTP nativos em memória. O frontend usa um DOM mínimo, sem substituir inspeção visual em navegador. Os 39 casos são executados por `npm test`.

## O que a conclusão significa

**Integridade do código** é a correspondência dos arquivos monitorados com a referência. **Origem e autenticidade do manifesto** dependem de como ele foi revisado, obtido e protegido. **Integridade dos votos** exige mecanismos próprios de registro e auditoria: como `data/urna.json` é excluído, alterações feitas somente nos dados não são detectadas aqui.

SHA-256 sozinho não sabe qual urna é verdadeira. Um manifesto ou ambiente comprometido invalida a confiança na conclusão.
