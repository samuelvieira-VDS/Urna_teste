# PROMPT 02 — Criar uma urna adulterada para demonstrar fraude e detecção

## Papel da IA

Você é um(a) engenheiro(a) de software de segurança realizando um **experimento local e controlado**. A partir do código pronto de `sistema-01-urna-autentica`, construa o projeto `sistema-02-urna-adulterada` com **uma modificação intencional na contagem de votos fictícios**. O objetivo é permitir que o Projeto 03 detecte que o código foi adulterado por comparação de hashes SHA-256.

**Atenção:** este é um laboratório educacional isolado. Não adapte o projeto a urnas, equipamentos eleitorais, sites ou dados reais. Não alegue que fraude efetiva ocorreu em qualquer eleição. Mantenha o aviso visível **"Simulação educacional — não é uma eleição real"**.

## Padrão obrigatório de nomenclatura em português brasileiro

**Todos os identificadores criados pela IA devem estar em português brasileiro (pt-BR)**: nomes de funções, métodos, classes, variáveis, parâmetros, constantes e propriedades internas, bem como comentários, testes, erros, documentação e mensagens exibidas ao usuário. Use `camelCase` para funções, métodos e variáveis, `PascalCase` para classes e `MAIUSCULAS_COM_SUBLINHADO` para constantes. Não use acentos ou cedilha nos identificadores JavaScript.

**Preserve integralmente os nomes em português já existentes no Projeto 01.** Ao acrescentar a lógica de adulteração demonstrativa em `src/votacao.js`, use nomes como `CANDIDATO_FAVORECIDO`, `QUANTIDADE_VOTOS_EXTRAS`, `adicionarVotosFicticios()` e `registrarVoto()`, caso sejam necessários. Não renomeie funções nem refatore outros arquivos: a única modificação de código monitorado deve continuar sendo `src/votacao.js`.

São **exceções**, e não precisam ser traduzidos: sintaxe JavaScript, métodos nativos/de bibliotecas (`app.post`, `JSON.parse`, etc.), pacotes, scripts npm, nomes de arquivos, rotas, IDs, variáveis de ambiente e nomes de campos fixados pelo contrato da API, inclusive `candidatoId`. Evite nomes próprios de funções em inglês como `addExtraVotes()` e `registerVote()`.

## Dependência obrigatória

A IA deve receber a pasta **completa** do Projeto 01 já implementado. **Copie-a**, mantendo nomes, caminhos, dependências, interface, endpoints e armazenamento iguais. Os testes podem ser adaptados em `tests/` para demonstrar o comportamento adulterado; essa pasta não será incluída na verificação de integridade do código executado. **Não reescreva a aplicação do zero.** Se a pasta original não estiver disponível, solicite seus arquivos em vez de inventar uma segunda implementação incompatível.

## Regra de adulteração específica

Modifique **somente `src/votacao.js`** no código de execução da urna. Ao processar cada `POST /api/votar` válido, enquanto a votação estiver aberta:

1. Registre o **1 voto legítimo** do candidato selecionado, como na versão original.
2. Registre também **2 votos fictícios extras** para o candidato favorecido, independentemente de quem recebeu o voto legítimo.
3. Para tornar o exercício reproduzível, configure o candidato favorecido como **`flavio_bolsonaro`** nesta demonstração. Opcionalmente, permita trocar o favorecido por `lula` com `CANDIDATO_FAVORECIDO`, mas mantenha a mudança de comportamento implementada em `src/votacao.js` e não em outros arquivos.
4. Faça a operação em uma única atualização de estado persistido, respeitando a mesma proteção de concorrência do Projeto 01. Não permita extras quando o pedido for inválido ou quando a votação estiver encerrada.
5. Continue apresentando na interface os totais persistidos, já inflados; **não acrescente avisos de fraude somente nesta interface**, pois isso mudaria outros arquivos e prejudicaria o experimento comparativo. O fato da alteração ser intencional deve estar documentado **neste prompt, em uma documentação externa ao código monitorado ou no relatório de testes**.

**Exemplo obrigatório para testes:** partindo de zero, se uma pessoa votar uma vez em Lula, o estado adulterado deve ficar `lula=1` e `flavio_bolsonaro=2`, total `3`. Se votar depois em Flávio Bolsonaro, deve ficar `lula=1` e `flavio_bolsonaro=5`, total `6`. Na urna autêntica, esses mesmos dois votos somariam `lula=1`, `flavio_bolsonaro=1`, total `2`.

## Restrições para a verificação por hash funcionar

- `server.js`, `src/armazenamento.js`, `public/index.html`, `public/app.js`, `public/style.css`, `package.json` e demais fontes monitoradas devem continuar **idênticos byte a byte** aos arquivos correspondentes da versão autêntica.
- `src/votacao.js` deve ser a **única diferença proposital entre os arquivos de código executados pela urna**. Testes em `tests/` e documentação em `.md` podem ser adaptados e são excluídos pelo verificador.
- **Não altere o código da versão original**, não renomeie funções, IDs de candidato, endpoints ou arquivos.
- O aplicativo adulterado deve rodar em uma segunda porta via ambiente, por exemplo `PORT=3002 npm start` (Linux/macOS) ou `$env:PORT=3002; npm start` (PowerShell). Não altere `server.js` para usar outra porta.
- É permitido que as pastas `data/` dos dois sistemas tenham votos diferentes, pois esses dados mutáveis **não fazem parte do hash dos arquivos-fonte**.
- Não instale novos pacotes nem gere outros arquivos monitorados diferentes durante a cópia. Adapte os testes dentro de `tests/`, que o Projeto 03 excluirá do hash; o comando `npm test` deve passar com os novos resultados esperados.

## Comportamento e API

Mantenha exatamente a API da urna original:

- `GET /api/estado`
- `POST /api/votar` com `{ "candidatoId": "lula" }` ou `{ "candidatoId": "flavio_bolsonaro" }`
- `POST /api/encerrar`
- `GET /api/resultado`

O navegador deve permitir votar, encerrar, visualizar resultados e persistir contagens como antes. A mudança deve aparecer **na apuração numérica**, não em propaganda, textos eleitorais ou interface política.

## Testes obrigatórios

- Com estado zerado, votar em Lula gera `Lula +1`, `Flávio Bolsonaro +2`.
- Com estado zerado, votar em Flávio Bolsonaro gera `Flávio Bolsonaro +3`, `Lula +0`.
- Dois votos válidos acrescentam **6 votos contados**, sendo **2 votos legítimos e 4 fictícios** no total.
- Voto inválido não gera acréscimo; depois de encerrar, nenhum voto legítimo ou extra é adicionado.
- Persistência, concorrência e interface continuam funcionando.
- `src/votacao.js` tem SHA-256 diferente do original; demais arquivos de código monitorados devem ter SHA-256 idêntico ao original.

## Entrega esperada

1. Pasta `sistema-02-urna-adulterada/` pronta para iniciar.
2. Demonstração reproduzível do exemplo numérico acima.
3. Comandos de execução e teste.
4. Relatório em `README.md` ou `tests/`, **fora dos arquivos monitorados**, listando precisamente o que foi adulterado e por quê. Não esconda o caráter demonstrativo do projeto.
5. Confirmação automatizada de que somente `src/votacao.js` difere entre as duas árvores de código monitorado.

## Relação com o Projeto 03

O Projeto 03 deve apontar a diferença de hash em `src/votacao.js`, declarar a cópia autêntica **compatível** com o manifesto confiável e a cópia adulterada **incompatível**. A referência precisa ser gerada **somente depois** de revisar e validar o Projeto 01; nunca a partir do Projeto 02.
