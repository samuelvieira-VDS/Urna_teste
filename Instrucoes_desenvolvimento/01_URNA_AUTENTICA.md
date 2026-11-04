# PROMPT 01 — Construir uma urna de votação original em Node.js

## Papel da IA

Você é um(a) engenheiro(a) de software full-stack. Implemente um **projeto Node.js completo e executável**, chamado `sistema-01-urna-autentica`, para uma **simulação educacional de votação**. Gere os arquivos de código, testes e instruções de execução; não entregue apenas pseudocódigo ou uma descrição.

**Contexto:** a urna terá duas opções fictícias de voto identificadas pelos nomes **Flávio Bolsonaro** e **Lula (Luiz Inácio Lula da Silva)**. Trata-se de um exercício local de programação e integridade de software; os votos não representam eleições ou pesquisas reais.

## Padrão obrigatório de nomenclatura em português brasileiro

**Exigência de implementação:** escreva os identificadores criados para este projeto em **português brasileiro (pt-BR)**. Isso inclui nomes de **funções, métodos, classes, variáveis, constantes, parâmetros, propriedades internas, testes e comentários**, além de mensagens para o usuário, mensagens de erro, documentação e textos da interface. Use nomes descritivos e `camelCase` para funções, métodos e variáveis, `PascalCase` para classes e `MAIUSCULAS_COM_SUBLINHADO` para constantes globais. **Não utilize acentos ou cedilha nos identificadores** de JavaScript para facilitar compatibilidade e leitura.

Exemplos de nomenclatura que a IA deverá adotar quando essas operações existirem:

```js
function validarCandidato(candidatoId) { /* ... */ }
async function registrarVoto(candidatoId) { /* ... */ }
async function encerrarVotacao() { /* ... */ }
function calcularResultado(estadoDaUrna) { /* ... */ }
async function lerEstadoDaUrna() { /* ... */ }
async function salvarEstadoDaUrna(estadoDaUrna) { /* ... */ }
function exibirResultado(resultado) { /* ... */ }
const CANDIDATOS_PERMITIDOS = ["flavio_bolsonaro", "lula"];
```

**Exceções necessárias:** mantenha em sua forma original as palavras reservadas do JavaScript (`const`, `function`, `return`, `async`, `await`, etc.), os métodos de APIs externas ou nativas (`app.get`, `app.post`, `JSON.stringify`, `express.json`, etc.), as dependências e scripts npm (`start`, `test`), os caminhos dos arquivos, as rotas HTTP, os IDs dos candidatos, as variáveis de ambiente (`PORT`) e as chaves fixas de JSON/API já definidas neste documento (por exemplo, `candidatoId`). **Não traduza contratos técnicos que precisam continuar idênticos entre os três sistemas.**

Na revisão final, verifique que não restaram nomes de funções ou métodos próprios do projeto em inglês, como `registerVote()`, `getResults()`, `saveState()` ou `checkCandidate()`. Todos os testes e exemplos da documentação também devem respeitar a nomenclatura em português.

## Requisitos de tecnologia

- Node.js 20 ou superior, JavaScript, Express, HTML, CSS e JavaScript puro no navegador. Use `node:crypto` apenas se necessário; não use serviços externos nem banco de dados remoto.
- Servidor iniciado por `npm start`, usando `process.env.PORT || 3001`.
- Interface em português do Brasil, simples, responsiva e acessível.
- Testes automatizados via `npm test` (por exemplo, `node:test`).
- Dados persistentes em `data/urna.json`; crie o arquivo e a pasta automaticamente se ausentes.
- Evite configurações de desenvolvimento que mudem os arquivos-fonte automaticamente em tempo de execução.

## Estrutura obrigatória

```text
sistema-01-urna-autentica/
├── package.json
├── server.js
├── src/
│   ├── votacao.js          # regra de votação; este será o arquivo adulterado no Projeto 02
│   └── armazenamento.js    # leitura, gravação atômica e serialização de escritas
├── public/
│   ├── index.html
│   ├── app.js
│   └── style.css
├── data/
│   └── urna.json
├── tests/
│   └── votacao.test.js
├── .gitignore
└── README.md
```

Você pode acrescentar testes e arquivos auxiliares, mas preserve esses caminhos. **O arquivo `src/votacao.js` deve concentrar a regra que credita exatamente um voto por solicitação válida.** Isso permitirá que o Projeto 02 seja uma cópia com uma única adulteração facilmente rastreável.

## Comportamento funcional

1. Tela inicial com título **"Urna de demonstração"**, aviso visível **"Simulação educacional — não é uma eleição real"**, as opções `flavio_bolsonaro` (nome: `Flávio Bolsonaro`) e `lula` (nome: `Lula`) e um botão **"Confirmar voto"**.
2. Uma escolha válida confirmada adiciona **exatamente 1 voto** ao candidato selecionado, nunca ao outro; apresente uma mensagem de confirmação. A interface deve evitar envios duplicados acidentais, desabilitando o botão durante o envio.
3. O usuário pode registrar diversos votos fictícios em sequência; não finja que há identificação real de eleitor ou garantia de voto único por pessoa.
4. Botão **"Encerrar votação"** que altera o estado da urna para encerrada. Depois disso, tentativas de votar devem ser rejeitadas no **servidor** com status apropriado.
5. Após o encerramento, exiba **"Ver resultado"** com quantidade de votos de cada candidato, total geral, porcentagem e indicação de empate ou maior votação. Todos os resultados devem ser calculados a partir dos dados persistidos, nunca simulados aleatoriamente.
6. Mantenha a contagem após reiniciar o processo Node.js. Para reiniciar a demonstração, disponibilize uma instrução de terminal que recrie `data/urna.json`, sem endpoint público de limpeza.
7. Não inclua imagens, slogans, cores de campanha ou mensagens que favoreçam qualquer candidato.

## Contrato da API HTTP

- `GET /api/estado` retorna `{ "encerrada": false, "candidatos": [{ "id": "flavio_bolsonaro", "nome": "Flávio Bolsonaro" }, { "id": "lula", "nome": "Lula" }] }` (com estado real).
- `POST /api/votar` recebe `{ "candidatoId": "lula" }` ou `{ "candidatoId": "flavio_bolsonaro" }`; valida o corpo e registra **um** voto. Responda com confirmação sem alterar o contrato entre os projetos.
- `POST /api/encerrar` encerra a demonstração e persiste o status.
- `GET /api/resultado` só disponibiliza a apuração quando a urna estiver encerrada; antes, retorne HTTP 409 com mensagem clara. Depois, retorne `{ "flavio_bolsonaro": 0, "lula": 0, "total": 0, "encerrada": true }` com valores reais (e percentuais, se desejar).
- Use HTTP 400 para candidato inválido; HTTP 409 para voto após encerramento; trate erros sem revelar detalhes internos.

## Persistência e integridade da lógica

O estado mínimo em `data/urna.json` é:

```json
{
  "encerrada": false,
  "votos": {
    "flavio_bolsonaro": 0,
    "lula": 0
  }
}
```

- Faça leitura e escrita de maneira segura para uso demonstrativo local (fila de gravações e arquivo temporário seguido de rename, ou equivalente), evitando perda em cliques simultâneos.
- Rejeite nomes de candidato desconhecidos, quantidades negativas e formatos incorretos. O cliente **não pode** enviar um número de votos, somente o ID da opção selecionada.
- Mantenha a lógica de `src/votacao.js` curta, testável e independente do HTML.
- Não modifique arquivos `.js`, `.html`, `.css`, `package.json` ou outros arquivos de código quando um voto for registrado: somente `data/urna.json` pode mudar.

## Testes obrigatórios

- Votar uma vez em Lula acrescenta `+1` a Lula e `+0` a Flávio Bolsonaro.
- Votar uma vez em Flávio Bolsonaro acrescenta `+1` a Flávio Bolsonaro e `+0` a Lula.
- Duas votações válidas totalizam dois votos; testes com requisições concorrentes não perdem incrementos.
- ID inválido é rejeitado e não modifica contagens.
- Depois do encerramento, não é possível votar; os resultados batem com os registros.
- Persistência continua correta depois da reinicialização de uma instância do serviço.

## O que entregar

1. Todos os arquivos-fonte implementados, com conteúdo completo e sem trechos omitidos.
2. `package.json` com scripts `start` e `test` operacionais.
3. README com comandos de instalação, execução, testes e como restaurar o estado fictício.
4. Resumo de como os requisitos foram testados.
5. Não acrescente qualquer lógica de aumento automático de votos: **esta versão é a referência íntegra do exercício**.

## Compatibilidade com os próximos projetos

O Projeto 02 copiará esta pasta e alterará **somente `src/votacao.js`** para inserir votos fictícios extras. O Projeto 03 calculará SHA-256 dos arquivos-fonte e os comparará a uma referência obtida **desta versão original, após validação**. Evite diferenças entre cópias por portas hard-coded: a porta deve vir de `PORT`.
