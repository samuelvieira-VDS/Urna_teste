# Alterações no Sistema 3 — Verificador de Autenticidade

Atualize o Sistema 3, desenvolvido em Node.js, para incluir uma **interface gráfica web**, permitindo que o usuário realize todas as verificações pelo navegador, sem precisar utilizar o terminal.

**IMPORTANTE:** mantenha todas as funcionalidades existentes. Não recrie o projeto do zero. Apenas implemente as alterações solicitadas.

## 1. Interface gráfica

Crie uma interface moderna, responsiva e totalmente em português brasileiro, utilizando HTML, CSS e JavaScript.

A interface deverá conter:

- Título: "Sistema de Verificação de Autenticidade".
- Campo para selecionar o diretório ou enviar os arquivos do Sistema 1 — Urna Autêntica.
- Campo para selecionar o diretório ou enviar os arquivos do Sistema 2 — Urna Adulterada.
- Botão "Verificar Autenticidade".
- Área para apresentar os resultados.
- Área para visualizar os hashes SHA-256.
- Botão para baixar o relatório da verificação.

## 2. Funcionamento da verificação

Ao clicar em "Verificar Autenticidade", o sistema deverá:

1. Receber os arquivos das duas urnas.
2. Calcular o hash SHA-256 de cada arquivo relevante.
3. Comparar os hashes com um manifesto de referência confiável, gerado previamente a partir do Sistema 1 original.
4. Identificar quais arquivos estão íntegros e quais foram modificados.
5. Identificar arquivos adicionados ou removidos.
6. Apresentar os resultados na interface.

O manifesto confiável deve ser protegido contra alterações não autorizadas. Não considere um manifesto enviado junto com os arquivos analisados automaticamente confiável.

## 3. Apresentação dos resultados

A interface deverá apresentar dois painéis:

**Sistema 1 — Urna Autêntica**

- Status da verificação.
- Quantidade de arquivos verificados.
- Hashes calculados.
- Arquivos modificados, caso existam.

**Sistema 2 — Urna Adulterada**

- Status da verificação.
- Quantidade de arquivos verificados.
- Hashes calculados.
- Lista de arquivos que não correspondem à referência.

Utilize indicadores visuais:

- Verde: arquivos correspondem à referência confiável.
- Vermelho: diferenças de integridade identificadas.
- Amarelo: verificação inconclusiva ou referência indisponível.

## 4. Identificação de alterações

Quando encontrar diferenças, apresente:

- Nome do arquivo.
- Caminho relativo.
- Hash SHA-256 esperado.
- Hash SHA-256 encontrado.
- Tipo de diferença: modificado, adicionado ou removido.

Não afirme que houve fraude apenas porque os hashes são diferentes. Informe que houve uma alteração e que ela precisa ser analisada.

## 5. Exportação de relatório

Adicione o botão "Baixar Relatório".

O relatório deverá conter:

- Data e hora da verificação.
- Sistemas analisados.
- Hashes SHA-256.
- Resultado da comparação.
- Arquivos modificados, adicionados ou removidos.
- Conclusão sobre a correspondência com a versão de referência.

Utilize o formato JSON.

## 6. Organização do projeto

Mantenha o backend em Node.js e utilize a estrutura já existente sempre que possível.

A interface deverá ser acessível em:

http://localhost:3003

Crie as rotas necessárias para receber os arquivos, executar as verificações e retornar os resultados ao frontend.

Implemente validações de tamanho, quantidade e tipo de arquivos, tratamento seguro de caminhos e proteção contra uploads maliciosos.

## 7. Padronização do código

Todo o código criado deverá utilizar português brasileiro nos identificadores definidos pelo projeto.

Exemplos:

- `calcularHashArquivo()`
- `verificarAutenticidade()`
- `compararHashes()`
- `identificarArquivosAlterados()`
- `gerarRelatorio()`
- `exibirResultado()`

Também utilize português nos nomes das variáveis, classes, comentários, mensagens e textos da interface.

Mantenha em inglês apenas as palavras reservadas do JavaScript, métodos nativos, nomes obrigatórios de bibliotecas e convenções técnicas que não possam ser traduzidas.

## 8. Requisitos finais

- O sistema deve funcionar completamente pelo navegador.
- Não deve modificar os arquivos das urnas durante a verificação.
- Deve continuar utilizando SHA-256.
- Deve distinguir integridade de autenticidade: hashes iguais, isoladamente, não comprovam que um sistema é legítimo.
- Deve funcionar localmente, sem depender de serviços externos.
- Deve manter as funcionalidades já implementadas.
- Deve exibir mensagens de erro claras e amigáveis.

**Objetivo final:** permitir que qualquer usuário selecione os arquivos das duas versões da urna e descubra visualmente qual delas corresponde ao código original de referência e quais arquivos foram alterados, sem precisar conhecer programação ou utilizar comandos no terminal.