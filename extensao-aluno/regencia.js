// Portal Maestro · janela da Afinação e do Compasso
const $ = (id) => document.getElementById(id);
let estadoAtual = { afinacao: null, compasso: null };
let duracaoTotal = null;      // para a barra de progresso
let compassoAtualId = null;
let avisouFim = false;
let enviando = false;

function formatar(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
}

function bipe() {
  try {
    const ctx = new AudioContext();
    [0, 0.35, 0.7].forEach((t) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.25);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + t);
      o.stop(ctx.currentTime + t + 0.3);
    });
  } catch (e) { /* sem áudio disponível */ }
}

function render() {
  const { afinacao, compasso } = estadoAtual;

  // Afinação
  $("blocoAfinacao").hidden = !afinacao;
  if (afinacao) {
    $("pergunta").textContent = afinacao.pergunta;
    $("opcoes").hidden = false;
    $("enviado").hidden = true;
  }

  // Compasso
  $("blocoCompasso").hidden = !compasso;
  if (compasso) {
    if (compasso.id !== compassoAtualId) {
      compassoAtualId = compasso.id;
      duracaoTotal = Math.max(1000, compasso.fimLocal - Date.now());
      avisouFim = false;
    }
    $("tituloAtv").textContent = compasso.titulo;
  }

  if (!afinacao && !compasso) window.close();
}

function tick() {
  const c = estadoAtual.compasso;
  if (!c) return;
  const resta = c.fimLocal - Date.now();
  $("tempo").textContent = resta > 0 ? formatar(resta) : "TEMPO!";
  $("barra").style.width = Math.max(0, Math.min(100, (resta / duracaoTotal) * 100)) + "%";
  $("blocoCompasso").classList.toggle("fim", resta <= 0);
  if (resta <= 0 && !avisouFim) {
    avisouFim = true;
    bipe();
  }
}

const acoes = {
  async responder(el) {
    if (enviando || !estadoAtual.afinacao) return;
    enviando = true;
    const r = await chrome.runtime.sendMessage({ tipo: "afinacao", id: estadoAtual.afinacao.id, valor: el.dataset.valor });
    enviando = false;
    if (r && r.ok) {
      $("opcoes").hidden = true;
      $("enviado").hidden = false;
      // o background limpa a pergunta; a janela se ajusta (ou fecha) pelo storage
    } else {
      $("enviado").hidden = false;
      $("enviado").textContent = (r && r.erro) || "Não foi possível enviar.";
    }
  }
};

document.addEventListener("click", (e) => {
  const alvo = e.target.closest("[data-action]");
  if (alvo && acoes[alvo.dataset.action]) acoes[alvo.dataset.action](alvo);
});

chrome.storage.onChanged.addListener((mudancas, area) => {
  if (area === "local" && mudancas.regencia) {
    estadoAtual = mudancas.regencia.newValue || { afinacao: null, compasso: null };
    // mostra o "enviado" por um instante antes de esconder a pergunta
    setTimeout(render, $("enviado").hidden ? 0 : 1200);
  }
});

chrome.storage.local.get("regencia", (d) => {
  estadoAtual = d.regencia || { afinacao: null, compasso: null };
  render();
  tick();
});
setInterval(tick, 250);
