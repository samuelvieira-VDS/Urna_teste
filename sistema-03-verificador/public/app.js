const formulario = document.querySelector('#formulario');
const primeiro = document.querySelector('#primeiro');
const segundo = document.querySelector('#segundo');
const verificar = document.querySelector('#verificar');
const baixar = document.querySelector('#baixar');
const mensagem = document.querySelector('#mensagem');
const resultados = document.querySelector('#resultados');
let configuracao;
let relatorioAtual;
let ocupada = false;

function informar(texto, classe = 'inconclusivo') {
  mensagem.textContent = texto;
  mensagem.className = `mensagem ${classe}`;
}

function atualizarControles() {
  primeiro.disabled = ocupada;
  segundo.disabled = ocupada;
  verificar.disabled = ocupada || !configuracao || !primeiro.files.length || !segundo.files.length;
  baixar.disabled = ocupada || !relatorioAtual;
  formulario.setAttribute('aria-busy', String(ocupada));
  verificar.textContent = ocupada ? 'Verificando…' : 'Verificar Autenticidade';
}

function obterCaminho(arquivo) {
  const relativo = arquivo.webkitRelativePath;
  if (!relativo || !relativo.includes('/')) throw new Error('Selecione a pasta completa em um navegador com suporte à seleção de diretórios.');
  return relativo.slice(relativo.indexOf('/') + 1);
}

function monitorarCaminho(caminho) {
  const partes = caminho.split('/');
  if (partes.some((parte) => configuracao.pastasExcluidas.includes(parte) || parte === '.env' ||
      parte.startsWith('.env.') || parte === 'manifesto-confiavel.json' || /(?:\.log|\.tmp|\.temp|\.swp|~)(?:\.|$)/i.test(parte))) return false;
  return configuracao.extensoes.some((extensao) => caminho.endsWith(extensao));
}

function listarSelecao(campo) {
  return Array.from(campo.files).map((arquivo) => ({ arquivo, caminho: obterCaminho(arquivo) }))
    .filter(({ caminho }) => monitorarCaminho(caminho));
}

function atualizarSelecao() {
  relatorioAtual = undefined;
  resultados.hidden = true;
  for (const [campo, seletor] of [[primeiro, '#resumoPrimeiro'], [segundo, '#resumoSegundo']]) {
    const resumo = document.querySelector(seletor);
    try {
      const arquivos = configuracao ? listarSelecao(campo) : [];
      resumo.textContent = campo.files.length ? `${campo.files[0].webkitRelativePath.split('/')[0]} · ${arquivos.length} arquivo(s) monitorado(s).` : 'Nenhuma pasta selecionada.';
    } catch (erro) { resumo.textContent = erro.message; }
  }
  informar('Selecione as duas pastas e inicie a verificação.');
  atualizarControles();
}

function codificarBytes(bytes) {
  let binario = '';
  for (let indice = 0; indice < bytes.length; indice += 8192) binario += String.fromCharCode(...bytes.subarray(indice, indice + 8192));
  return btoa(binario);
}

async function prepararEnvio() {
  let total = 0;
  const sistemas = [];
  for (const campo of [primeiro, segundo]) {
    const selecionados = listarSelecao(campo);
    if (!selecionados.length) throw new Error('Cada pasta deve conter arquivos de código monitorados.');
    if (selecionados.length > configuracao.limites.arquivosPorSistema) throw new Error('A pasta excede o limite de arquivos monitorados.');
    for (const { arquivo } of selecionados) {
      total += arquivo.size;
      if (arquivo.size > configuracao.limites.bytesPorArquivo || total > configuracao.limites.bytesTotais) throw new Error('Os arquivos excedem os limites de tamanho indicados na página.');
    }
    sistemas.push({ nome: campo.files[0].webkitRelativePath.split('/')[0], selecionados });
  }
  const preparados = [];
  for (const sistema of sistemas) {
    const arquivos = [];
    for (const { arquivo, caminho } of sistema.selecionados) {
      arquivos.push({ caminho, conteudoBase64: codificarBytes(new Uint8Array(await arquivo.arrayBuffer())) });
    }
    preparados.push({ nome: sistema.nome, arquivos });
  }
  return { sistemas: preparados };
}

function criarElemento(tipo, texto, classe) {
  const elemento = document.createElement(tipo);
  if (texto !== undefined) elemento.textContent = texto;
  if (classe) elemento.className = classe;
  return elemento;
}

function exibirResultado(relatorio) {
  document.querySelector('#dataVerificacao').textContent = `Verificação realizada em ${new Date(relatorio.verificadoEm).toLocaleString('pt-BR')}`;
  document.querySelector('#conclusao').textContent = relatorio.conclusao;
  document.querySelector('#hashReferencia').textContent = relatorio.hashAgregadoEsperado;
  const paineis = document.querySelector('#paineis');
  paineis.replaceChildren();
  for (const [indice, sistema] of relatorio.sistemas.entries()) {
    const compativel = sistema.status === 'COMPATIVEL_COM_REFERENCIA';
    const painel = criarElemento('article', undefined, 'painel');
    painel.append(criarElemento('h3', `Sistema ${indice + 1} — ${indice === 0 ? 'Urna Autêntica' : 'Urna Adulterada'}`),
      criarElemento('p', `Pasta selecionada: ${sistema.nome}`),
      criarElemento('span', compativel ? '✓ Corresponde à referência' : '⚠ Diferenças de integridade identificadas', `selo ${compativel ? 'compativel' : 'divergente'}`),
      criarElemento('p', `${sistema.quantidadeArquivos} arquivo(s) verificado(s) · ${sistema.divergencias.length} diferença(s).`, 'contagem'),
      criarElemento('strong', 'SHA-256 agregado calculado'), criarElemento('code', sistema.hashAgregado, 'hash'));
    const detalhes = criarElemento('details');
    detalhes.open = true;
    detalhes.append(criarElemento('summary', 'Arquivos e hashes SHA-256'));
    const recipiente = criarElemento('div', undefined, 'tabela');
    const tabela = criarElemento('table');
    tabela.append(criarElemento('caption', 'Todos os arquivos monitorados, incluindo os ausentes da seleção.'));
    const cabecalho = criarElemento('thead');
    const titulos = criarElemento('tr');
    for (const texto of ['Arquivo / caminho relativo', 'Situação', 'SHA-256 esperado', 'SHA-256 encontrado']) {
      const coluna = criarElemento('th', texto); coluna.scope = 'col'; titulos.append(coluna);
    }
    cabecalho.append(titulos); tabela.append(cabecalho);
    const corpo = criarElemento('tbody');
    const tipos = { INTEGRO: 'Íntegro', ALTERADO: 'Modificado', ADICIONAL: 'Adicionado', AUSENTE: 'Removido' };
    for (const arquivo of sistema.arquivos) {
      const linha = criarElemento('tr');
      const caminho = criarElemento('td');
      caminho.append(criarElemento('strong', arquivo.nome), criarElemento('br'), criarElemento('code', arquivo.caminho));
      linha.append(caminho, criarElemento('td', tipos[arquivo.tipo]));
      for (const resumo of [arquivo.esperado, arquivo.encontrado]) {
        const celula = criarElemento('td'); celula.append(criarElemento('code', resumo ?? 'Ausente')); linha.append(celula);
      }
      corpo.append(linha);
    }
    tabela.append(corpo); recipiente.append(tabela); detalhes.append(recipiente); painel.append(detalhes); paineis.append(painel);
  }
  resultados.hidden = false;
}

formulario.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  if (ocupada || verificar.disabled) return;
  ocupada = true; relatorioAtual = undefined; resultados.hidden = true; atualizarControles();
  informar('Lendo os arquivos e comparando com a referência confiável…');
  try {
    const corpo = await prepararEnvio();
    const resposta = await fetch('/api/verificar', { method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Token-Verificacao': configuracao.token }, body: JSON.stringify(corpo) });
    const dados = await resposta.json();
    if (!resposta.ok) throw new Error(dados.mensagem || 'Não foi possível concluir a verificação.');
    relatorioAtual = dados;
    exibirResultado(dados);
    const todasCompativeis = dados.sistemas.every((sistema) => sistema.status === 'COMPATIVEL_COM_REFERENCIA');
    informar(todasCompativeis ? 'Verificação concluída: as duas pastas correspondem à referência.' :
      'Verificação concluída: foram identificadas alterações que precisam ser analisadas.', todasCompativeis ? 'compativel' : 'divergente');
  } catch (erro) { informar(erro instanceof TypeError ? 'Não foi possível conectar ao servidor local. Verifique se ele está em execução.' : erro.message); }
  finally { ocupada = false; atualizarControles(); }
});

baixar.addEventListener('click', () => {
  if (!relatorioAtual || ocupada) return;
  const arquivo = new Blob([JSON.stringify(relatorioAtual, null, 2)], { type: 'application/json;charset=utf-8' });
  const endereco = URL.createObjectURL(arquivo);
  const ligacao = criarElemento('a'); ligacao.href = endereco;
  ligacao.download = `relatorio-verificacao-${relatorioAtual.verificadoEm.replace(/[:.]/g, '-')}.json`;
  document.body.append(ligacao); ligacao.click(); ligacao.remove();
  setTimeout(() => URL.revokeObjectURL(endereco), 1000);
});
primeiro.addEventListener('change', atualizarSelecao);
segundo.addEventListener('change', atualizarSelecao);

async function iniciarInterface() {
  try {
    const resposta = await fetch('/api/configuracao');
    if (!resposta.ok) throw new Error('Não foi possível carregar a configuração. Recarregue a página.');
    configuracao = await resposta.json();
    const limites = configuracao.limites;
    document.querySelector('#limites').textContent = `Até ${limites.arquivosPorSistema} arquivos por sistema · ${limites.bytesPorArquivo / 1024 / 1024} MiB por arquivo · ${limites.bytesTotais / 1024 / 1024} MiB no total.`;
    atualizarSelecao();
  } catch { informar('Servidor indisponível. Recarregue a página com o servidor local em execução.'); }
}
void iniciarInterface();
