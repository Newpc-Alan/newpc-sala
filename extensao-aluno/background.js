// Portal Maestro · extensão do aluno · v0.4.2
// Service worker: liga o dispositivo à aula, envia presença e executa os comandos do professor.
//
// Estrutura no Realtime Database (projeto newpc-sala):
//   aulas/{codigo}/professor, criadaEm
//   aulas/{codigo}/controle/encerrada        true quando o professor encerra
//   aulas/{codigo}/controle/bloqueioGeral    true/false para a turma inteira
//   aulas/{codigo}/controle/bloqueio/{id}    true/false para um aluno (sobrepõe o geral)
//   aulas/{codigo}/controle/comando          último comando para todos  {id, tipo, url}
//   aulas/{codigo}/controle/comandos/{id}    último comando para um aluno
//   aulas/{codigo}/alunos/{id}               presença que o aluno envia
//
// Política da escola (Google Admin Console → Apps e extensões → esta extensão → Política):
//   { "entradaObrigatoria": { "Value": true } }
//   true  → o aluno só usa o Chrome depois de entrar numa aula (tela de entrada travada)
//   false → a tela de entrada abre ao ligar, mas o aluno pode fechar (padrão)

const FIREBASE_URL = "https://newpc-sala-default-rtdb.firebaseio.com";
const VERSAO = "0.4.2";
const INTERVALO_MS = 3000;          // consulta de comandos
const HEARTBEAT_A_CADA = 5;         // presença a cada 5 ciclos (15 s)
const URL_BLOQUEIO = chrome.runtime.getURL("bloqueio.html");
const URL_ENTRADA = chrome.runtime.getURL("entrar.html");

let cicloRodando = false;

// ---------- utilidades ----------

function esperar(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function estado() {
  return chrome.storage.local.get(["deviceId", "aula", "nome", "bloqueado", "executados"]);
}

async function entradaObrigatoria() {
  try {
    const p = await chrome.storage.managed.get("entradaObrigatoria");
    return p.entradaObrigatoria === true;
  } catch (e) {
    return false; // sem política da escola (instalação manual)
  }
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
    console.log("[Portal Maestro] Link aberto:", cmd.url);
  }
}

async function verificarControle() {
  const st = await estado();
  if (!st.aula) return;
  const id = await obterDeviceId();
  const controle = await fb(`aulas/${st.aula}/controle`);

  if (!controle || controle.encerrada) {
    console.log("[Portal Maestro] Aula encerrada pelo professor.");
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
  if (ligar) await garantirTela(URL_BLOQUEIO, true);
  else if (st.bloqueado) await fecharTela(URL_BLOQUEIO);
}

// ---------- telas da extensão (bloqueio e entrada) ----------

// Abre a tela (ou traz para frente). "travada" = janela própria em tela cheia.
async function garantirTela(url, travada) {
  const abas = await chrome.tabs.query({ url });
  if (abas.length) {
    const aba = abas[0];
    await chrome.tabs.update(aba.id, { active: true });
    await chrome.windows.update(aba.windowId, travada ? { focused: true, state: "fullscreen" } : { focused: true });
    for (const extra of abas.slice(1)) chrome.tabs.remove(extra.id).catch(() => {});
  } else if (travada) {
    await chrome.windows.create({ url, type: "popup", state: "fullscreen", focused: true });
  } else {
    await chrome.tabs.create({ url, active: true });
  }
}

async function fecharTela(url) {
  const abas = await chrome.tabs.query({ url });
  for (const a of abas) await chrome.tabs.remove(a.id).catch(() => {});
}

// Qual tela deve ficar na frente agora (ou null se nenhuma é obrigatória).
async function telaObrigatoria() {
  const st = await estado();
  if (st.bloqueado) return URL_BLOQUEIO;
  if (!st.aula && (await entradaObrigatoria())) return URL_ENTRADA;
  return null;
}

// Abre a tela de entrada quando o aluno liga o Chromebook / abre o Chrome.
async function abrirEntradaAoIniciar() {
  const st = await estado();
  if (st.aula) return;
  await garantirTela(URL_ENTRADA, await entradaObrigatoria());
}

// Enquanto uma tela é obrigatória, qualquer tentativa de sair dela volta para ela.
let reforcoAgendado = false;
async function reforcarTela() {
  if (reforcoAgendado) return;
  reforcoAgendado = true;
  await esperar(300);
  reforcoAgendado = false;
  const url = await telaObrigatoria();
  if (!url) return;
  const [ativa] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (ativa && ativa.url === url) return;
  await garantirTela(url, true);
}

chrome.tabs.onActivated.addListener(reforcarTela);
chrome.windows.onFocusChanged.addListener(reforcarTela);
chrome.tabs.onRemoved.addListener(reforcarTela);
chrome.tabs.onCreated.addListener(async (aba) => {
  const url = await telaObrigatoria();
  const destino = aba.pendingUrl || aba.url;
  if (url && destino !== URL_BLOQUEIO && destino !== URL_ENTRADA) {
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
        console.warn("[Portal Maestro] Falha no ciclo:", e.message);
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
  if (!String(nome || "").trim()) return { ok: false, erro: "Digite seu nome." };

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

  await chrome.storage.local.set({ aula: codigo, nome: String(nome).trim().slice(0, 60), executados: antigos, bloqueado: false });
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
  await fecharTela(URL_BLOQUEIO);
  // com entrada obrigatória, ao sair/encerrar a tela de entrada volta
  if (await entradaObrigatoria()) await garantirTela(URL_ENTRADA, true);
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
      return {
        ok: true, aula: st.aula || null, nome: st.nome || "", bloqueado: !!st.bloqueado,
        email: await obterEmail(), obrigatoria: await entradaObrigatoria()
      };
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
chrome.runtime.onStartup.addListener(() => {
  ciclo();
  abrirEntradaAoIniciar();
});
chrome.runtime.onInstalled.addListener(() => {
  ciclo();
  abrirEntradaAoIniciar();
});
chrome.storage.onChanged.addListener((_mudancas, area) => {
  if (area === "managed") reforcarTela(); // escola mudou a política
});
ciclo();
