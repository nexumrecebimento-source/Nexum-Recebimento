/* Nexum — linhas luminosas discretas (mesma linguagem da capa) no topo e nos banners de boas-vindas */
(function () {
  const reduz = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const PRESETS = {
    topo: [{ n: 26, y0: 1.25, y1: -.15, arco: .05, amp: .35, f: 4.2, v: .12, fase: 2.4, ond: .10, alfa: .55, lw: .8 },
           { n: 16, y0: 1.1, y1: .1, arco: -.1, amp: .25, f: 3.1, v: -.09, fase: 3.2, ond: .12, alfa: .35, lw: .7 }],
    hero: [{ n: 36, y0: 1.3, y1: .55, arco: .02, amp: .18, f: 5.0, v: .16, fase: 2.6, ond: .05, alfa: .38, lw: .8 },
           { n: 22, y0: 1.2, y1: .75, arco: -.06, amp: .12, f: 3.4, v: -.12, fase: 3.6, ond: .06, alfa: .26, lw: .7 }]
  };
  const itens = [];
  function faixa(ctx, w, h, t, o) {
    for (let i = 0; i < o.n; i++) {
      const k = i / (o.n - 1), sp = Math.sin(k * Math.PI);
      ctx.beginPath();
      for (let s = 0; s <= 1.0001; s += 0.025) {
        const x = -0.1 * w + s * 1.2 * w;
        const base = h * (o.y0 + (o.y1 - o.y0) * s) - h * o.arco * Math.sin(Math.PI * s);
        const amp = h * o.amp * Math.sin(Math.PI * s) * (k - .5) * 2;
        const onda = Math.sin(s * o.f + t * o.v + k * o.fase) * h * o.ond * sp;
        const y = base + amp * Math.cos(s * 3.2 + t * o.v * .7) + onda;
        s === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      const a = (0.06 + 0.4 * sp * sp) * o.alfa, g = ctx.createLinearGradient(0, h, w, 0);
      g.addColorStop(0, "rgba(45,140,255,0)"); g.addColorStop(.4, `rgba(70,160,255,${a})`); g.addColorStop(.75, `rgba(120,225,255,${a * 1.1})`); g.addColorStop(1, "rgba(95,224,255,0)");
      ctx.strokeStyle = g; ctx.lineWidth = o.lw; ctx.stroke();
    }
  }
  function desenhar(it, t) {
    const cv = it.cv, w = cv.clientWidth, h = cv.clientHeight; if (!w || !h) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    const ctx = cv.getContext("2d"); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
    ctx.globalCompositeOperation = "lighter"; PRESETS[it.tipo].forEach(o => faixa(ctx, w, h, t, o)); ctx.globalCompositeOperation = "source-over";
  }
  function aplicar(el, tipo, anima) {
    if (!el || el.querySelector(":scope > .fx-box")) return;
    const box = document.createElement("div"); box.className = "fx-box"; box.setAttribute("aria-hidden", "true");
    const cv = document.createElement("canvas"); box.appendChild(cv); el.insertBefore(box, el.firstChild);
    const it = { el, cv, tipo, anima: anima && !reduz }; itens.push(it); desenhar(it, 0);
  }
  /* só anima o que está visível na tela; o topo fica parado (leve) */
  let ult = 0;
  function loop(ms) {
    if (ms - ult > 50) { ult = ms; itens.forEach(it => { if (it.anima && it.el.offsetParent !== null && !document.hidden) desenhar(it, ms / 1000); }); }
    requestAnimationFrame(loop);
  }
  window.addEventListener("resize", () => itens.forEach(it => desenhar(it, performance.now() / 1000)));
  function iniciar() {
    /* topo sem linhas: não pode competir com o texto das abas */
    document.querySelectorAll(".nx-hero:not(.hero-esc)").forEach(h => aplicar(h, "hero", true));
    requestAnimationFrame(loop);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar); else iniciar();
  window.NXFX = { aplicar };
})();
