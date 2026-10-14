// NEWPC Sala · popup do aluno
const $ = (id) => document.getElementById(id);

function enviar(msg) {
  return new Promise((resolve) => chrome.runtime.sendMessage(msg, resolve));
}

function mensagem(el, texto, tipo) {
  el.textContent = texto || "";
  el.className = "msg " + (tipo || "");
}

async function atualizar() {
  const st = await enviar({ tipo: "status" });
  $("rodape").textContent = st.email ? "Conta: " + st.email : "Conta do Chrome não identificada";
  if (st.aula) {
    $("telaEntrar").hidden = true;
    $("telaNaAula").hidden = false;
    $("numAula").textContent = st.aula;
    $("nomeAluno").textContent = st.nome || "";
    $("pillStatus").textContent = st.bloqueado ? "Tela bloqueada pelo professor" : "Conectado";
    $("pillStatus").classList.toggle("bloq", st.bloqueado);
    $("btnSair").disabled = st.bloqueado;
  } else {
    $("telaNaAula").hidden = true;
    $("telaEntrar").hidden = false;
    if (!$("nome").value && st.nome) $("nome").value = st.nome;
    $("codigo").focus();
  }
}

const acoes = {
  async entrar() {
    const codigo = $("codigo").value.trim();
    const nome = $("nome").value.trim();
    if (!/^\d{6}$/.test(codigo)) return mensagem($("msgEntrar"), "Digite os 6 números da aula.", "erro");
    if (!nome) return mensagem($("msgEntrar"), "Digite seu nome.", "erro");
    $("btnEntrar").disabled = true;
    mensagem($("msgEntrar"), "Conectando...");
    const r = await enviar({ tipo: "entrar", aula: codigo, nome });
    $("btnEntrar").disabled = false;
    if (!r.ok) return mensagem($("msgEntrar"), r.erro, "erro");
    mensagem($("msgEntrar"), "");
    atualizar();
  },
  async sair() {
    const r = await enviar({ tipo: "sair" });
    if (!r.ok) return mensagem($("msgAula"), r.erro, "erro");
    atualizar();
  }
};

document.addEventListener("click", (e) => {
  const alvo = e.target.closest("[data-action]");
  if (alvo && acoes[alvo.dataset.action]) acoes[alvo.dataset.action]();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !$("telaEntrar").hidden) acoes.entrar();
});

$("codigo").addEventListener("input", (e) => {
  e.target.value = e.target.value.replace(/\D/g, "").slice(0, 6);
});

atualizar();
