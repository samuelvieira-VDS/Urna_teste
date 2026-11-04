# Três sistemas Node.js: urna, adulteração simulada e verificação por hash

Este pacote contém **três prompts de implementação** para entregar a uma IA de programação, um para cada projeto. Todos devem funcionar **somente como demonstração educacional**, com votos fictícios e sem ligação com eleições, urnas ou bases de dados reais.

## Idioma e nomenclatura obrigatórios

**Os três prompts foram padronizados para exigir código próprio em português brasileiro.** A IA de programação deve usar nomes em português para **funções, métodos, classes, variáveis, parâmetros, constantes, propriedades internas, testes e comentários**, além de todas as mensagens, textos de interface e documentos. Não use acentos nos identificadores JavaScript; prefira `camelCase`, `PascalCase` e `MAIUSCULAS_COM_SUBLINHADO` conforme o tipo.

Exemplos: `registrarVoto()`, `encerrarVotacao()`, `calcularResultado()`, `adicionarVotosFicticios()`, `calcularHashArquivo()` e `verificarIntegridade()`.

Exceções: palavras reservadas e APIs do JavaScript/Node.js/Express, nomes de dependências, caminhos já especificados, scripts npm, rotas HTTP e campos/IDs previamente fixados (`candidatoId`, `flavio_bolsonaro`, `hashAgregado`, etc.). Esses elementos são preservados para manter compatibilidade entre projetos. **O segundo sistema não deve renomear nada do primeiro:** apenas muda a lógica dentro de `src/votacao.js`.

## Arquivos

1. [`01_URNA_AUTENTICA.md`](01_URNA_AUTENTICA.md) — instruções para construir a urna original, com os candidatos **Flávio Bolsonaro** e **Lula**, votação, encerramento e apuração.
2. [`02_URNA_ADULTERADA.md`](02_URNA_ADULTERADA.md) — instruções para criar uma **cópia deliberadamente modificada** que acrescenta votos fictícios indevidos a um dos candidatos. A alteração deve ser feita apenas na lógica de votação, para que o verificador localize precisamente a diferença.
3. [`03_VERIFICADOR_HASH.md`](03_VERIFICADOR_HASH.md) — instruções para construir um verificador Node.js que compara **hashes SHA-256 dos arquivos-fonte** com um manifesto de referência criado a partir da urna original.

## Ordem de uso recomendada

1. Entregue à IA o arquivo `01_URNA_AUTENTICA.md`, e peça que desenvolva o projeto `sistema-01-urna-autentica/` por completo, incluindo testes.
2. Após validar a primeira versão, entregue `02_URNA_ADULTERADA.md` **junto com o código gerado no passo 1**. A segunda versão deve ser uma cópia da primeira, modificando somente `src/votacao.js`.
3. Entregue `03_VERIFICADOR_HASH.md` à IA, com acesso às duas pastas, para gerar `sistema-03-verificador/`.
4. **Antes de executar o verificador**, crie a referência de confiança a partir do código original, com um comando explícito. Nunca gere a referência a partir da versão adulterada nem a regenere automaticamente a cada verificação.

## Estrutura final esperada

```text
projeto-demonstracao/
├── sistema-01-urna-autentica/
│   ├── package.json
│   ├── server.js
│   ├── src/
│   │   ├── votacao.js
│   │   └── armazenamento.js
│   ├── public/
│   │   ├── index.html
│   │   ├── app.js
│   │   └── style.css
│   ├── data/
│   │   └── urna.json              # dados mutáveis; não entram no hash do código
│   └── tests/
├── sistema-02-urna-adulterada/     # mesmos caminhos relativos da urna original
│   └── ...                        # só src/votacao.js deve ter código diferente
└── sistema-03-verificador/
    ├── package.json
    ├── cli.js
    ├── src/
    ├── referencia/
    │   └── manifesto-confiavel.json  # criado explicitamente a partir da urna original
    └── tests/
```

A IA pode criar arquivos adicionais necessários (como `.gitignore` e documentação), mas deve manter os caminhos principais e garantir que as duas urnas tenham **a mesma árvore de arquivos monitorados**, com a única mudança proposital no **código de produção** em `src/votacao.js`. Os testes em `tests/` podem diferir e ficam fora da comparação de hash.

## Comandos que os projetos devem oferecer

```bash
# Na urna original
cd sistema-01-urna-autentica
npm install
npm test
npm start                      # porta 3001 por padrão

# Na urna adulterada, em outro terminal (Linux/macOS)
cd sistema-02-urna-adulterada
npm install
npm test
PORT=3002 npm start

# No verificador, quando os três projetos estiverem prontos
cd sistema-03-verificador
npm install
npm test
npm run gerar-referencia -- --diretorio ../sistema-01-urna-autentica
npm run verificar -- --primeiro ../sistema-01-urna-autentica --segundo ../sistema-02-urna-adulterada
```

No PowerShell, defina a porta com `$env:PORT=3002; npm start`.

## Resultado esperado

O verificador deve dizer que **a pasta original corresponde ao manifesto confiável** e que **a pasta adulterada não corresponde**, indicando `src/votacao.js` e os respectivos hashes como evidência. Se ambas divergirem, ou se ambas forem idênticas à referência, deve informar isso com precisão em vez de adivinhar qual é legítima.

**Limitação importante:** um hash sozinho detecta diferenças em relação a um valor previamente confiável; ele **não prova sozinho quem criou o programa nem se uma eleição foi correta**. Este exercício autentica a **integridade dos arquivos de código monitorados**. O arquivo mutável `data/urna.json` é excluído da comparação para que votos normais não invalidem o hash do programa. Fraudes feitas apenas nos dados exigiriam auditoria adicional de votos, não contemplada neste teste.

Não utilize o sistema em eleições reais. Os nomes dos candidatos servem exclusivamente como opções de uma simulação técnica, sem alegações sobre qualquer pessoa ou disputa real.
