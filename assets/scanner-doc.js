/* Nexum — escanear documento (certificado) pelo celular, sem biblioteca externa.
   Câmera nativa (foco e resolução máximos) → recorte automático da folha → ajuste dos 4 cantos com o dedo →
   correção de perspectiva → realce de documento (cor ou preto e branco) → várias páginas.
   Uso: NXSCAN.escanear({ titulo }) → Promise<File[]> (vazio se cancelar) */
(function () {
  const css = `
.nxs{position:fixed;inset:0;z-index:9999;background:#0b1220;color:#fff;display:flex;flex-direction:column;font-family:inherit}
.nxs-top{display:flex;align-items:center;gap:10px;padding:12px 14px;padding-top:max(12px,env(safe-area-inset-top))}
.nxs-top b{flex:1;font-size:1rem}.nxs-top button{background:none;border:0;color:#9cc4ff;font:600 .95rem inherit;padding:6px}
.nxs-st{padding:0 14px 8px;font-size:.84rem;color:#c9d6ea}
.nxs-area{position:relative;flex:1;min-height:0;display:grid;place-items:center;overflow:hidden;touch-action:none}
.nxs-area canvas{max-width:100%;max-height:100%;display:block}
.nxs-area svg{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}
.nxs-h{position:absolute;width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:50%;border:3px solid #2d8cff;background:rgba(45,140,255,.25);touch-action:none;cursor:grab}
.nxs-bar{display:flex;gap:8px;flex-wrap:wrap;padding:12px 14px;padding-bottom:max(12px,env(safe-area-inset-bottom));background:#0f1a2e}
.nxs-bar button{flex:1 1 140px;min-height:48px;border-radius:12px;border:1px solid #33496d;background:#16243d;color:#fff;font:700 .92rem inherit}
.nxs-bar button.pri{background:#2d8cff;border-color:#2d8cff}
.nxs-seg{display:flex;gap:6px;padding:0 14px 8px}.nxs-seg button{flex:1;min-height:38px;border-radius:999px;border:1px solid #33496d;background:none;color:#c9d6ea;font:600 .82rem inherit}
.nxs-seg button[aria-pressed="true"]{background:#fff;color:#0b1220;border-color:#fff}
.nxs-pags{display:flex;gap:6px;padding:0 14px 8px;overflow-x:auto}.nxs-pags img{height:54px;border-radius:4px;border:1px solid #33496d}`;
  let estilo = false;
  const $c = (t, cls, html) => { const e = document.createElement(t); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

  function tirarFoto() {
    return new Promise(res => {
      const inp = document.createElement("input"); inp.type = "file"; inp.accept = "image/*"; inp.setAttribute("capture", "environment");
      inp.style.cssText = "position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0";
      let feito = false;
      inp.onchange = () => { feito = true; const f = inp.files[0]; setTimeout(() => inp.remove(), 500); res(f || null); };
      /* se a pessoa fechar a câmera sem foto, o foco volta para a página */
      const volta = () => setTimeout(() => { if (!feito) { inp.remove(); res(null); } window.removeEventListener("focus", volta); }, 1200);
      window.addEventListener("focus", volta);
      document.body.appendChild(inp); inp.click();
    });
  }
  function carregar(file) {
    return new Promise((ok, err) => { const u = URL.createObjectURL(file), im = new Image(); im.onload = () => { URL.revokeObjectURL(u); ok(im); }; im.onerror = () => { URL.revokeObjectURL(u); err(new Error("imagem")); }; im.src = u; });
  }
  /* acha a folha: maior região clara (Otsu) e seus 4 cantos extremos */
  function detectar(cv) {
    const W = 320, k = W / cv.width, H = Math.round(cv.height * k), t = document.createElement("canvas"); t.width = W; t.height = H;
    const x = t.getContext("2d"); x.drawImage(cv, 0, 0, W, H); const d = x.getImageData(0, 0, W, H).data, g = new Uint8Array(W * H), hist = new Array(256).fill(0);
    for (let i = 0; i < W * H; i++) { const v = (d[i * 4] * .3 + d[i * 4 + 1] * .59 + d[i * 4 + 2] * .11) | 0; g[i] = v; hist[v]++; }
    let sum = 0; for (let i = 0; i < 256; i++) sum += i * hist[i];
    let sB = 0, wB = 0, best = 0, thr = 128; for (let i = 0; i < 256; i++) { wB += hist[i]; if (!wB) continue; const wF = W * H - wB; if (!wF) break; sB += i * hist[i]; const mB = sB / wB, mF = (sum - sB) / wF, v = wB * wF * (mB - mF) ** 2; if (v > best) { best = v; thr = i; } }
    const lab = new Int32Array(W * H).fill(-1); let melhor = null;
    for (let s = 0; s < W * H; s++) {
      if (g[s] <= thr || lab[s] !== -1) continue;
      const fila = [s]; lab[s] = s; let n = 0, tl = null, tr = null, bl = null, br = null;
      while (fila.length) {
        const p = fila.pop(), px = p % W, py = (p / W) | 0; n++;
        if (!tl || px + py < tl[0] + tl[1]) tl = [px, py]; if (!br || px + py > br[0] + br[1]) br = [px, py];
        if (!tr || px - py > tr[0] - tr[1]) tr = [px, py]; if (!bl || px - py < bl[0] - bl[1]) bl = [px, py];
        const viz = [p - 1, p + 1, p - W, p + W];
        for (const q of viz) { if (q < 0 || q >= W * H) continue; if ((q === p - 1 && px === 0) || (q === p + 1 && px === W - 1)) continue; if (g[q] > thr && lab[q] === -1) { lab[q] = s; fila.push(q); } }
      }
      if (!melhor || n > melhor.n) melhor = { n, c: [tl, tr, br, bl] };
    }
    if (!melhor || melhor.n < W * H * 0.12) return [[.06, .06], [.94, .06], [.94, .94], [.06, .94]].map(([a, b]) => [a * cv.width, b * cv.height]);
    return melhor.c.map(([a, b]) => [a / k, b / k]);
  }
  /* homografia: retângulo de saída → quadrilátero da foto */
  function homografia(src, w, h) {
    const dst = [[0, 0], [w, 0], [w, h], [0, h]], A = [], B = [];
    for (let i = 0; i < 4; i++) { const [x, y] = dst[i], [u, v] = src[i]; A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); B.push(u); A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); B.push(v); }
    for (let c = 0; c < 8; c++) { let m = c; for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[m][c])) m = r;[A[c], A[m]] = [A[m], A[c]];[B[c], B[m]] = [B[m], B[c]];
      for (let r = 0; r < 8; r++) { if (r === c) continue; const f = A[r][c] / A[c][c]; for (let k = c; k < 8; k++) A[r][k] -= f * A[c][k]; B[r] -= f * B[c]; } }
    return B.map((b, i) => b / A[i][i]);
  }
  function retificar(cv, q, modo) {
    const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
    let w = Math.max(dist(q[0], q[1]), dist(q[3], q[2])), h = Math.max(dist(q[0], q[3]), dist(q[1], q[2]));
    const s = Math.min(1, 1800 / Math.max(w, h)); w = Math.round(w * s); h = Math.round(h * s);
    const [a, b, c, d, e, f, g, hh] = homografia(q, w, h);
    const sd = cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data, SW = cv.width, SH = cv.height;
    const out = document.createElement("canvas"); out.width = w; out.height = h; const ox = out.getContext("2d"), od = ox.createImageData(w, h), o = od.data;
    const lum = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const den = g * x + hh * y + 1, u = (a * x + b * y + c) / den, v = (d * x + e * y + f) / den;
      const xi = Math.min(SW - 1, Math.max(0, u | 0)), yi = Math.min(SH - 1, Math.max(0, v | 0)), si = (yi * SW + xi) * 4, di = (y * w + x) * 4;
      o[di] = sd[si]; o[di + 1] = sd[si + 1]; o[di + 2] = sd[si + 2]; o[di + 3] = 255; lum[y * w + x] = (sd[si] * .3 + sd[si + 1] * .59 + sd[si + 2] * .11) | 0;
    }
    /* realce de documento: estica o contraste (fundo branco, texto escuro); "pb" = preto e branco */
    if (modo !== "original") {
      const hst = new Array(256).fill(0); for (let i = 0; i < lum.length; i++) hst[lum[i]]++;
      const pct = p => { let acc = 0, alvo = lum.length * p; for (let i = 0; i < 256; i++) { acc += hst[i]; if (acc >= alvo) return i; } return 255; };
      const lo = pct(.04), hi = Math.max(lo + 30, pct(.80));
      for (let i = 0; i < lum.length; i++) {
        const di = i * 4;
        if (modo === "pb") { let v = (lum[i] - lo) * 255 / (hi - lo); v = v > 200 ? 255 : v < 0 ? 0 : v * .9; o[di] = o[di + 1] = o[di + 2] = v; }
        else for (let k = 0; k < 3; k++) { let v = (o[di + k] - lo) * 255 / (hi - lo); o[di + k] = v < 0 ? 0 : v > 255 ? 255 : v; }
      }
    }
    ox.putImageData(od, 0, 0); return out;
  }
  function escanear(opt) {
    opt = opt || {};
    if (!estilo) { const s = document.createElement("style"); s.textContent = css; document.head.appendChild(s); estilo = true; }
    return new Promise(resolve => {
      const pags = [], ui = $c("div", "nxs");
      ui.innerHTML = `<div class="nxs-top"><button type="button" data-x>✕ Cancelar</button><b>${opt.titulo || "Escanear documento"}</b></div>
        <div class="nxs-st" data-st>Abrindo a câmera… Fotografe a folha inteira sobre um fundo escuro, com boa luz.</div>
        <div class="nxs-pags" data-pags></div>
        <div class="nxs-area" data-area><canvas data-cv></canvas><svg data-svg><polygon data-pol fill="rgba(45,140,255,.15)" stroke="#2d8cff" stroke-width="2"/></svg></div>
        <div class="nxs-seg" data-seg hidden><button type="button" data-m="cor" aria-pressed="true">Documento (cor)</button><button type="button" data-m="pb" aria-pressed="false">Preto e branco</button><button type="button" data-m="original" aria-pressed="false">Original</button></div>
        <div class="nxs-bar" data-bar></div>`;
      document.body.appendChild(ui); document.body.style.overflow = "hidden";
      const q = s => ui.querySelector(s), area = q("[data-area]"), cvv = q("[data-cv]"), pol = q("[data-pol]");
      let foto = null, cantos = null, modo = "cor", handles = [], prev = null;
      const fim = r => { ui.remove(); document.body.style.overflow = ""; resolve(r); };
      q("[data-x]").onclick = () => fim([]);
      const bar = html => { q("[data-bar]").innerHTML = html; };
      const escala = () => { const r = cvv.getBoundingClientRect(), a = area.getBoundingClientRect(); return { k: r.width / cvv.width, ox: r.left - a.left, oy: r.top - a.top }; };
      function desenharCantos() {
        const { k, ox, oy } = escala();
        pol.setAttribute("points", cantos.map(([x, y]) => (ox + x * k) + "," + (oy + y * k)).join(" "));
        handles.forEach((h, i) => { h.style.left = (ox + cantos[i][0] * k) + "px"; h.style.top = (oy + cantos[i][1] * k) + "px"; });
      }
      function editar() {
        q("[data-seg]").hidden = true; q("[data-svg]").style.display = ""; prev = null;
        cvv.width = foto.width; cvv.height = foto.height; cvv.getContext("2d").drawImage(foto, 0, 0);
        handles.forEach(h => h.remove()); handles = cantos.map((_, i) => { const h = $c("div", "nxs-h"); area.appendChild(h);
          h.onpointerdown = e => { e.preventDefault(); h.setPointerCapture(e.pointerId);
            h.onpointermove = ev => { const r = cvv.getBoundingClientRect(), k = cvv.width / r.width; cantos[i] = [Math.min(cvv.width, Math.max(0, (ev.clientX - r.left) * k)), Math.min(cvv.height, Math.max(0, (ev.clientY - r.top) * k))]; desenharCantos(); };
            h.onpointerup = () => { h.onpointermove = null; }; };
          return h; });
        requestAnimationFrame(desenharCantos);
        q("[data-st]").textContent = "Confira o recorte: arraste os círculos azuis até os cantos da folha.";
        bar(`<button type="button" data-refaz>Tirar de novo</button><button type="button" class="pri" data-ok>Recortar</button>`);
        q("[data-refaz]").onclick = nova; q("[data-ok]").onclick = mostrar;
      }
      function mostrar() {
        q("[data-st]").textContent = "Ajustando a página…";
        setTimeout(() => {
          prev = retificar(foto, cantos, modo); handles.forEach(h => h.remove()); handles = []; q("[data-svg]").style.display = "none";
          cvv.width = prev.width; cvv.height = prev.height; cvv.getContext("2d").drawImage(prev, 0, 0);
          q("[data-seg]").hidden = false; q("[data-st]").textContent = `Página ${pags.length + 1} pronta. Tem mais páginas? Escaneie a próxima.`;
          bar(`<button type="button" data-volta>Ajustar recorte</button><button type="button" data-mais>+ Outra página</button><button type="button" class="pri" data-fim>Concluir (${pags.length + 1} pág.)</button>`);
          q("[data-volta]").onclick = editar;
          q("[data-mais]").onclick = async () => { await guardar(); nova(); };
          q("[data-fim]").onclick = async () => { await guardar(); fim(pags); };
        }, 30);
      }
      q("[data-seg]").querySelectorAll("[data-m]").forEach(b => b.onclick = () => { modo = b.dataset.m; q("[data-seg]").querySelectorAll("[data-m]").forEach(x => x.setAttribute("aria-pressed", String(x === b))); mostrar(); });
      function guardar() {
        return new Promise(ok => prev.toBlob(bl => { const f = new File([bl], `certificado-pag${pags.length + 1}.jpg`, { type: "image/jpeg" }); pags.push(f);
          const th = document.createElement("img"); th.src = URL.createObjectURL(bl); q("[data-pags]").appendChild(th); ok(); }, "image/jpeg", .85));
      }
      async function nova() {
        q("[data-st]").textContent = "Abrindo a câmera… Fotografe a folha inteira sobre um fundo escuro, com boa luz.";
        const f = await tirarFoto();
        if (!f) { if (!foto) return fim(pags); q("[data-st]").textContent = "Nenhuma foto tirada."; if (prev) mostrar(); else editar(); return; }
        try {
          const im = await carregar(f), s = Math.min(1, 2400 / Math.max(im.width, im.height)), c = document.createElement("canvas");
          c.width = Math.round(im.width * s); c.height = Math.round(im.height * s); c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
          foto = c; cantos = detectar(c); modo = "cor"; q("[data-seg]").querySelectorAll("[data-m]").forEach(x => x.setAttribute("aria-pressed", String(x.dataset.m === "cor"))); editar();
        } catch (e) { q("[data-st]").textContent = "Não consegui abrir a foto. Tente de novo."; bar(`<button type="button" class="pri" data-refaz>Tirar foto</button>`); q("[data-refaz]").onclick = nova; }
      }
      window.addEventListener("resize", () => { if (handles.length) desenharCantos(); });
      nova();
    });
  }
  window.NXSCAN = { escanear, _detectar: detectar, _retificar: retificar };
})();
