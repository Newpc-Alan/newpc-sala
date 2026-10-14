// NEWPC Sala · extensão do aluno · v0.2.0
// Service worker: liga o dispositivo à aula, envia presença e executa os comandos do professor.
//
// Estrutura no Realtime Database (projeto newpc-classroom):
//   aulas/{codigo}/professor, criadaEm
//   aulas/{codigo}/controle/encerrada        true quando o professor encerra
//   aulas/{codigo}/controle/bloqueioGeral    true/false para a turma inteira
//   aulas/{codigo}/controle/bloqueio/{id}    true/false para um aluno (sobrepõe o geral)
//   aulas/{codigo}/controle/comando          último comando para todos  {id, tipo, url}
//   aulas/{codigo}/controle/comandos/{id}    último comando para um aluno
//   aulas/{codigo}/alunos/{id}               presença que o aluno envia

const FIREBASE_URL = "https://newpc-classroom-default-rtdb.firebaseio.com";
const VERSAO = "0.2.0";
const INTERVALO_MS = 3000;          // consulta de comandos
const HEARTBEAT_A_CADA = 5;         // presença a cada 5 ciclos (15 s)
const URL_BLOQUEIO = chrome.runtime.getURL("bloqueio.html");

let cicloRodando = false;

// ---------- utilidades ----------

function esperar(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function estado() {
  return chrome.storage.local.get(["deviceId", "aula", "nome", "bloqueado", "executados"]);
}

async function obterDeviceId() {
  const d = await chrome.storage.local.get("deviceId");
  if (d.deviceId) return d.deviceId;
  const novo = "device_" + Date.now() + "_" + Math.random().toString(36).slice(2, 11);
  await chrome.storage.local.set({ deviceId: novo });
  return novo;
}

function obterEmail() {
  return new Promise((resolve) => {
    chrome.identity.getProfileUserInfo({ accountStatus: "ANY" }, (info) => {
      resolve((info && info.email) || "");
    });
  });
}

async function fb(caminho, metodo, corpo) {
  const opcoes = { method: metodo || "GET", headers: { "Content-Type": "application/json" } };
  if (corpo !== undefined) opcoes.body = JSON.stringify(corpo);
  const r = await fetch(`${FIREBASE_URL}/${caminho}.json`, opcoes);
  if (!r.ok) throw new Error(`Firebase ${r.status} em ${caminho}`);
  return r.json();
}

async function abaAtiva() {
  const [aba] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!aba) return null;
  return { titulo: (aba.title || "").slice(0, 120), url: (aba.url || "").slice(0, 300) };
}

// ---------- presença ----------

async function enviarPresenca() {
  const st = await estado();
  if (!st.aula) return;
  const id = await obterDeviceId();
  const email = await obterEmail();
  await fb(`aulas/${st.aula}/alunos/${id}`, "PATCH", {
    nome: st.nome || email || "Aluno sem nome",
    email: email,
    bloqueado: !!st.bloqueado,
    aba: await abaAtiva(),
    versao: VERSAO,
    ultimaAtividade: { ".sv": "timestamp" }
  });
}

// ---------- comandos e bloqueio ----------

async function marcarExecutado(idComando) {
  const st = await estado();
  const lista = (st.executados || []).filter((x) => x !== idComando);
  lista.push(idComando);
  await chrome.storage.local.set({ executados: lista.slice(-30) });
}

async function executarComando(cmd) {
  if (!cmd || !cmd.id) return;
  const st = await estado();
  if ((st.executados || []).includes(cmd.id)) return;
  await marcarExecutado(cmd.id);

  if (cmd.tipo === "abrirLink" && /^https?:\/\//i.test(cmd.url || "")) {
    await chrome.tabs.create({ url: cmd.url, active: true });
    console.log("[NEWPC Sala] Link aberto:", cmd.url);
  }
}

async function verificarControle() {
  const st = await estado();
  if (!st.aula) return;
  const id = await obterDeviceId();
  const controle = await fb(`aulas/${st.aula}/controle`);

  if (!controle || controle.encerrada) {
    console.log("[NEWPC Sala] Aula encerrada pelo professor.");
    await sairDaAula(false);
    return;
  }

  // bloqueio individual sobrepõe o geral
  const individual = controle.bloqueio ? controle.bloqueio[id] : undefined;
  const deveBloquear = typeof individual === "boolean" ? individual : !!controle.bloqueioGeral;
  await aplicarBloqueio(deveBloquear);

  // comandos: geral e individual, na ordem em que foram criados
  const meu = controle.comandos ? controle.comandos[id] : null;
  const fila = [controle.comando, meu].filter((c) => c && c.id).sort((a, b) => (a.ts || 0) - (b.ts || 0));
  for (const c of fila) await executarComando(c);
}

async function aplicarBloqueio(ligar) {
  const st = await estado();
  if (ligar !== !!st.bloqueado) await chrome.storage.local.set({ bloqueado: ligar });
  if (ligar) await garantirTelaBloqueio();
  else if (st.bloqueado) await fecharTelaBloqueio();
}

async function garantirTelaBloqueio() {
  const abas = await chrome.tabs.query({ url: URL_BLOQUEIO });
  if (abas.length) {
    const aba = abas[0];
    await chrome.tabs.update(aba.id, { active: true });
    await chrome.windows.update(aba.windowId, { focused: true, state: "fullscreen" });
    // fecha cópias extras
    for (const extra of abas.slice(1)) chrome.tabs.remove(extra.id).catch(() => {});
  } else {
    await chrome.windows.create({ url: URL_BLOQUEIO, type: "popup", state: "fullscreen", focused: true });
  }
}

async function fecharTelaBloqueio() {
  const abas = await chrome.tabs.query({ url: URL_BLOQUEIO });
  for (const a of abas) await chrome.tabs.remove(a.id).catch(() => {});
}

// Enquanto bloqueado, qualquer tentativa de sair da tela de bloqueio volta para ela.
let reforcoAgendado = false;
async function reforcarBloqueio() {
  if (reforcoAgendado) return;
  reforcoAgendado = true;
  await esperar(300);
  reforcoAgendado = false;
  const st = await estado();
  if (!st.bloqueado) return;
  const [ativa] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (ativa && ativa.url === URL_BLOQUEIO) return;
  await garantirTelaBloqueio();
}

chrome.tabs.onActivated.addListener(reforcarBloqueio);
chrome.windows.onFocusChanged.addListener(reforcarBloqueio);
chrome.tabs.onRemoved.addListener(reforcarBloqueio);
chrome.tabs.onCreated.addListener(async (aba) => {
  const st = await estado();
  if (st.bloqueado && aba.pendingUrl !== URL_BLOQUEIO && aba.url !== URL_BLOQUEIO) {
    chrome.tabs.remove(aba.id).catch(() => {});
  }
});

// ---------- ciclo principal ----------

async function ciclo() {
  if (cicloRodando) return;
  cicloRodando = true;
  let volta = 0;
  try {
    // cada volta chama a API de storage, o que mantém o service worker acordado durante a aula
    while ((await estado()).aula) {
      try {
        await verificarControle();
        if (volta % HEARTBEAT_A_CADA === 0) await enviarPresenca();
      } catch (e) {
        console.warn("[NEWPC Sala] Falha no ciclo:", e.message);
      }
      volta++;
      await esperar(INTERVALO_MS);
    }
  } finally {
    cicloRodando = false;
  }
}

// ---------- entrar e sair da aula ----------

async function entrarNaAula(codigo, nome) {
  codigo = String(codigo || "").replace(/\D/g, "");
  if (codigo.length !== 6) return { ok: false, erro: "O número da aula tem 6 dígitos." };

  let aula;
  try {
    aula = await fb(`aulas/${codigo}`);
  } catch (e) {
    return { ok: false, erro: "Sem conexão com o servidor. Verifique a internet." };
  }
  if (!aula) return { ok: false, erro: "Aula não encontrada. Confira o número com o professor." };
  if (aula.controle && aula.controle.encerrada) return { ok: false, erro: "Esta aula já foi encerrada." };

  // comandos que já existiam antes de o aluno entrar não são reexecutados
  const id = await obterDeviceId();
  const antigos = [];
  if (aula.controle && aula.controle.comando) antigos.push(aula.controle.comando.id);
  if (aula.controle && aula.controle.comandos && aula.controle.comandos[id]) antigos.push(aula.controle.comandos[id].id);

  await chrome.storage.local.set({ aula: codigo, nome: (nome || "").trim().slice(0, 60), executados: antigos, bloqueado: false });
  await enviarPresenca().catch(() => {});
  ciclo();
  return { ok: true, professor: aula.professor || "" };
}

async function sairDaAula(avisarServidor) {
  const st = await estado();
  const id = await obterDeviceId();
  if (avisarServidor && st.aula) {
    await fb(`aulas/${st.aula}/alunos/${id}`, "DELETE").catch(() => {});
  }
  await chrome.storage.local.set({ aula: null, bloqueado: false, executados: [] });
  await fecharTelaBloqueio();
}

chrome.runtime.onMessage.addListener((msg, _remetente, responder) => {
  (async () => {
    if (msg.tipo === "entrar") return entrarNaAula(msg.aula, msg.nome);
    if (msg.tipo === "sair") {
      const st = await estado();
      if (st.bloqueado) return { ok: false, erro: "Tela bloqueada pelo professor." };
      await sairDaAula(true);
      return { ok: true };
    }
    if (msg.tipo === "status") {
      const st = await estado();
      return { ok: true, aula: st.aula || null, nome: st.nome || "", bloqueado: !!st.bloqueado, email: await obterEmail() };
    }
    return { ok: false, erro: "Mensagem desconhecida." };
  })().then(responder);
  return true; // resposta assíncrona
});

// ---------- inicialização ----------

chrome.alarms.create("vigia", { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === "vigia") ciclo(); // religa o ciclo se o Chrome tiver hibernado o service worker
});
chrome.runtime.onStartup.addListener(ciclo);
chrome.runtime.onInstalled.addListener(ciclo);
ciclo();
