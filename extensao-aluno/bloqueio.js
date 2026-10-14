// Portal Maestro · tela de bloqueio
chrome.storage.local.get("nome", (d) => {
  if (d.nome) document.getElementById("nome").textContent = d.nome;
});
// bloqueia menu de contexto e atalhos comuns dentro da tela
document.addEventListener("contextmenu", (e) => e.preventDefault());
document.addEventListener("keydown", (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) e.preventDefault();
});
