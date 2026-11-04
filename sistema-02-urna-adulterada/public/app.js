const formulario = document.querySelector('#formulario');
const opcoes = document.querySelector('#opcoes');
const confirmar = document.querySelector('#confirmar');
const encerrar = document.querySelector('#encerrar');
const verResultado = document.querySelector('#verResultado');
const mensagem = document.querySelector('#mensagem');
const situacao = document.querySelector('#situacao');
let encerrada = false;
let ocupada = true;
let disponivel = false;

function atualizarControles() {
  opcoes.disabled = ocupada || encerrada || !disponivel;
  confirmar.disabled = ocupada || encerrada || !disponivel;
  encerrar.disabled = ocupada || encerrada || !disponivel;
  verResultado.hidden = !encerrada;
  verResultado.disabled = ocupada;
  situacao.textContent = encerrada ? 'Votação encerrada.' :
    (disponivel ? 'Votação aberta.' : 'Urna indisponível. Recarregue a página para tentar novamente.');
  formulario.setAttribute('aria-busy', String(ocupada));
}

async function requisitar(caminho, corpo) {
  const resposta = await fetch(caminho, corpo === undefined ? {} : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo),
  });
  const dados = await resposta.json();
  if (!resposta.ok) throw new Error(dados.mensagem || 'Não foi possível concluir a operação.');
  return dados;
}

async function sincronizarEstado() {
  const estado = await requisitar('/api/estado');
  encerrada = estado.encerrada;
  disponivel = true;
}

async function executarOperacao(operacao) {
  if (ocupada) return;
  ocupada = true;
  mensagem.textContent = '';
  atualizarControles();
  try { await operacao(); }
  catch (erro) {
    mensagem.textContent = erro instanceof TypeError ? 'Não foi possível conectar à urna.' : erro.message;
    try { await sincronizarEstado(); } catch { disponivel = false; }
  } finally { ocupada = false; atualizarControles(); }
}

formulario.addEventListener('submit', (evento) => {
  evento.preventDefault();
  const candidatoId = new FormData(formulario).get('candidatoId');
  if (!candidatoId || encerrada) return;
  void executarOperacao(async () => {
    const resposta = await requisitar('/api/votar', { candidatoId });
    mensagem.textContent = resposta.mensagem;
    formulario.reset();
  });
});
encerrar.addEventListener('click', () => {
  void executarOperacao(async () => {
    const resposta = await requisitar('/api/encerrar', {});
    encerrada = resposta.encerrada;
    mensagem.textContent = resposta.mensagem;
  });
});
verResultado.addEventListener('click', () => {
  void executarOperacao(async () => {
    const resultado = await requisitar('/api/resultado');
    const apuracao = document.querySelector('#apuracao');
    apuracao.replaceChildren();
    for (const [candidatoId, nome] of [['flavio_bolsonaro', 'Flávio Bolsonaro'], ['lula', 'Lula']]) {
      const linha = document.createElement('tr');
      const porcentagem = resultado.total ? resultado[candidatoId] / resultado.total * 100 : 0;
      for (const texto of [nome, resultado[candidatoId], `${porcentagem.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`]) {
        const celula = document.createElement('td');
        celula.textContent = texto;
        linha.append(celula);
      }
      apuracao.append(linha);
    }
    document.querySelector('#total').textContent = `Total geral: ${resultado.total} voto(s).`;
    document.querySelector('#conclusao').textContent = resultado.lula === resultado.flavio_bolsonaro
      ? 'Empate entre as duas opções.'
      : `Maior votação: ${resultado.lula > resultado.flavio_bolsonaro ? 'Lula' : 'Flávio Bolsonaro'}.`;
    document.querySelector('#resultado').hidden = false;
    mensagem.textContent = 'Resultado carregado.';
  });
});
async function iniciarInterface() {
  try { await sincronizarEstado(); }
  catch { mensagem.textContent = 'Não foi possível carregar a urna.'; }
  finally { ocupada = false; atualizarControles(); }
}
void iniciarInterface();
