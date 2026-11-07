/* Nexum — canto superior: notificações (sino) e menu do usuário (iniciais, perfil, configurações, sair).
   Uso: NXTOPO.notificacoes([{icone, texto, n, tom, acao}]); NXTOPO.configurar(fn) */
(function () {
  const PERFIL = { admin: "Administrador", escritorio: "Administrador", consulta: "Consulta", campo: "Campo" };
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const ic = (n) => window.NXUI ? window.NXUI.icon(n) : "";
  let notifs = [], abrirConfig = null, el = null;

  function iniciais(nome) { const p = String(nome || "").trim().split(/\s+/).filter(Boolean); return ((p[0] || "?")[0] + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase(); }
  function nome() { return window.NXNUVEM && window.NXNUVEM.nome ? window.NXNUVEM.nome() : ""; }
  function email() { const u = window.NXNUVEM && window.NXNUVEM.usuario && window.NXNUVEM.usuario(); return u ? u.email : ""; }
  function perfil() { return window.NXNUVEM && window.NXNUVEM.perfil ? window.NXNUVEM.perfil() : ""; }

  function montar() {
    if (el) return el;
    const bar = document.querySelector(".hbar"); if (!bar) return null;
    el = document.createElement("div"); el.className = "tp";
    el.innerHTML = `<button type="button" class="tp-b tp-sino" id="tpSino" aria-label="Notificações" aria-haspopup="true"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg><span class="tp-n" id="tpN" hidden></span></button>
      <button type="button" class="tp-av" id="tpAv" aria-label="Perfil e opções" aria-haspopup="true"><span id="tpIni">·</span></button>
      <div class="tp-pop" id="tpPopN" hidden role="dialog" aria-label="Notificações"></div>
      <div class="tp-pop" id="tpPopU" hidden role="dialog" aria-label="Perfil"></div>`;
    const old = document.getElementById("badgeDemo"); if (old) old.hidden = true;
    bar.appendChild(el);
    const fechar = () => { el.querySelector("#tpPopN").hidden = true; el.querySelector("#tpPopU").hidden = true; };
    el.querySelector("#tpSino").onclick = e => { e.stopPropagation(); const p = el.querySelector("#tpPopN"), v = p.hidden; fechar(); if (v) { renderN(); p.hidden = false; } };
    el.querySelector("#tpAv").onclick = e => { e.stopPropagation(); const p = el.querySelector("#tpPopU"), v = p.hidden; fechar(); if (v) { renderU(); p.hidden = false; } };
    document.addEventListener("click", e => { if (!el.contains(e.target)) fechar(); });
    document.addEventListener("keydown", e => { if (e.key === "Escape") fechar(); });
    el._fechar = fechar;
    return el;
  }
  function renderN() {
    const p = el.querySelector("#tpPopN"), ativos = notifs.filter(x => x.n);
    p.innerHTML = `<div class="tp-h">Notificações</div>` + (ativos.length ? ativos.map((x, i) => `<button type="button" class="tp-it ${x.tom || ""}" data-i="${notifs.indexOf(x)}"><span class="tp-ic">${ic(x.icone || "alert")}</span><span class="tp-tx">${esc(x.texto)}</span><b>${x.n}</b></button>`).join("")
      : `<div class="tp-vazio">Tudo em ordem por aqui. ✓</div>`);
    p.querySelectorAll("[data-i]").forEach(b => b.onclick = () => { el._fechar(); const x = notifs[+b.dataset.i]; if (x && x.acao) x.acao(); });
  }
  function renderU() {
    const p = el.querySelector("#tpPopU"), pf = perfil();
    p.innerHTML = `<div class="tp-user"><span class="tp-av big">${esc(iniciais(nome()))}</span><div><b>${esc(nome() || "Usuário")}</b><small>${esc(email())}</small><span class="tp-pf">${esc(PERFIL[pf] || pf || "Modo local")}</span></div></div>
      ${abrirConfig ? `<button type="button" class="tp-it" id="tpCfg"><span class="tp-ic">${ic("doc")}</span><span class="tp-tx">Configurações</span></button>` : ""}
      ${email() ? `<button type="button" class="tp-it" id="tpSenha"><span class="tp-ic">${ic("shield")}</span><span class="tp-tx">Trocar minha senha</span></button>` : ""}
      <button type="button" class="tp-it" id="tpAtual"><span class="tp-ic">${ic("undo")}</span><span class="tp-tx">Atualizar o app</span></button>
      ${email() ? `<button type="button" class="tp-it sair" id="tpSair"><span class="tp-ic">${ic("x")}</span><span class="tp-tx">Sair</span></button>` : ""}`;
    const on = (id, fn) => { const b = p.querySelector(id); if (b) b.onclick = () => { el._fechar(); fn(); }; };
    on("#tpCfg", () => abrirConfig && abrirConfig());
    on("#tpSenha", () => window.NXNUVEM.trocarSenha && window.NXNUVEM.trocarSenha());
    on("#tpAtual", () => location.reload());
    on("#tpSair", () => { if (confirm("Sair do Nexum?")) window.NXNUVEM.sair(); });
  }
  function atualizar() {
    if (!montar()) return;
    el.querySelector("#tpIni").textContent = nome() ? iniciais(nome()) : "N";
    const total = notifs.reduce((s, x) => s + (x.n || 0), 0), b = el.querySelector("#tpN");
    b.hidden = !total; b.textContent = total > 99 ? "99+" : total;
    if (!el.querySelector("#tpPopN").hidden) renderN();
  }
  window.addEventListener("nx-perfil", atualizar);
  window.NXTOPO = {
    notificacoes(l) { notifs = l || []; atualizar(); },
    configurar(fn) { abrirConfig = fn; },
    atualizar
  };
  if (document.readyState !== "loading") atualizar(); else document.addEventListener("DOMContentLoaded", atualizar);
})();
