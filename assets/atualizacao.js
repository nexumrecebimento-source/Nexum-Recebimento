/* Avisa quando há versão nova publicada e recarrega com um toque */
(function () {
  const BASE = document.currentScript.src.replace(/atualizacao\.js.*$/, "");
  let atual = null;
  async function verificar() {
    try {
      const r = await fetch(BASE + "versao.json?t=" + Date.now(), { cache: "no-store" });
      if (!r.ok) return;
      const v = (await r.json()).v;
      if (atual === null) { atual = v; return; }
      if (v !== atual) mostrar();
    } catch (e) { }
  }
  function mostrar() {
    if (document.getElementById("avisoVersao")) return;
    const d = document.createElement("div");
    d.id = "avisoVersao";
    d.setAttribute("role", "status");
    d.style.cssText = "position:fixed;left:50%;transform:translateX(-50%);top:calc(10px + env(safe-area-inset-top,0px));z-index:80;background:var(--accent,#b8570c);color:var(--accent-ink,#fff);padding:10px 14px;border-radius:8px;display:flex;gap:12px;align-items:center;font:600 .9rem system-ui,sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.25);max-width:92%";
    d.innerHTML = '<span>Nova versão do app disponível</span><button type="button" style="border:0;border-radius:6px;padding:7px 12px;font:700 .85rem system-ui,sans-serif;cursor:pointer;background:#fff;color:#1b262d">Atualizar</button>';
    d.querySelector("button").onclick = async () => {
      try { if (navigator.serviceWorker) { const regs = await navigator.serviceWorker.getRegistrations(); await Promise.all(regs.map(r => r.update())); } } catch (e) { }
      location.reload();
    };
    document.body.appendChild(d);
  }
  verificar();
  setInterval(verificar, 3 * 60 * 1000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) verificar(); });
})();
