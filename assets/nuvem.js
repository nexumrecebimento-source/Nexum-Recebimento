/* Nexum — modo nuvem (Firebase Auth + Firestore).
   Só liga quando assets/nuvem-config.js tiver o firebaseConfig. Troca o AMR.store local por um que
   sincroniza com o banco, mantendo a mesma interface (ouvir, salvar, salvarVarias, importar, excluir). */
(function () {
  const C = window.NEXUM_NUVEM_TESTE || window.NEXUM_NUVEM || {};
  if (!C.FIREBASE || !window.firebase || !window.AMR) return;
  const A = window.AMR, APP = window.NEXUM_APP || "escritorio";
  const SCRIPT = document.currentScript && document.currentScript.src;
  const url = p => { try { return new URL(p, SCRIPT).href; } catch (e) { return p; } };
  const USUARIOS = {}; Object.entries(C.USUARIOS || {}).forEach(([k, v]) => USUARIOS[k.trim().toLowerCase()] = v);

  firebase.initializeApp(C.FIREBASE);
  const auth = firebase.auth(), db = firebase.firestore();
  db.settings({ ignoreUndefinedProperties: true, merge: true });
  if (C.EMULADOR) { auth.useEmulator(C.EMULADOR.auth); db.useEmulator(C.EMULADOR.host, C.EMULADOR.port); }
  db.enablePersistence({ synchronizeTabs: true }).catch(() => { });
  auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(() => { });
  const FICHAS = db.collection("fichas"), ANEXOS = db.collection("anexos"), CONFIG = db.collection("config");

  let usuario = null, perfil = "";
  const PODE_EDITAR = () => perfil === "admin" || perfil === "escritorio" || perfil === "campo";
  const soLeitura = () => { const e = new Error("Seu acesso é só de consulta: não é possível alterar."); e.code = "consulta"; return e; };
  const nomeUsuario = () => usuario ? (USUARIOS[usuario.email.toLowerCase()] || {}).nome || usuario.email : "";
  const diaLocal = iso => { if (!iso) return ""; const d = new Date(iso); return isNaN(d) ? "" : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  const limpo = o => JSON.parse(JSON.stringify(o));
  const comTempo = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("sem resposta do servidor")), ms))]);

  /* ---------- lista de fichas (tempo real) ---------- */
  const ouvintes = new Set();
  let lista = [], pronto = false, liberar;
  const carregado = new Promise(r => liberar = r);
  function avisar() { const l = lista.slice(); ouvintes.forEach(fn => { try { fn(l); } catch (e) { console.error(e); } }); }
  let paradas = [];
  function assinar() {
    paradas.forEach(p => p()); paradas = [];
    const ok = () => { if (!pronto) { pronto = true; liberar(); } avisar(); };
    const erro = e => { console.error(e); toastN("Sem acesso aos dados: " + (e.code === "permission-denied" ? "seu usuário não tem permissão" : e.message), true); };
    if (APP === "campo") {
      /* celular: só o que interessa no campo — fichas de hoje e certificados pendentes */
      const partes = { hoje: new Map(), cert: new Map() };
      const juntar = () => { const m = new Map([...partes.cert, ...partes.hoje]); lista = [...m.values()]; ok(); atribuirPendentes(); };
      paradas.push(FICHAS.where("dia", "==", A.hoje()).onSnapshot(s => { partes.hoje = new Map(s.docs.map(d => [d.id, d.data()])); juntar(); }, erro));
      paradas.push(FICHAS.where("status", "==", "cert_pendente").onSnapshot(s => { partes.cert = new Map(s.docs.map(d => [d.id, d.data()])); juntar(); }, erro));
    } else {
      paradas.push(FICHAS.onSnapshot(s => { lista = s.docs.map(d => d.data()); ok(); }, erro));
    }
    paradas.push(CONFIG.doc("cadastros").onSnapshot(d => { if (d.exists && A.cadastros._substituir) A.cadastros._substituir(d.data()); }, () => { }));
  }
  /* o celular troca de dia sem fechar o app */
  let diaAssinado = A.hoje();
  setInterval(() => { if (usuario && APP === "campo" && A.hoje() !== diaAssinado) { diaAssinado = A.hoje(); assinar(); } }, 60000);

  /* ---------- numeração única entre todos os aparelhos ---------- */
  function maxLocal(ctr) { return lista.filter(f => A.ctrDe(f) === ctr && +f.numero).reduce((m, f) => Math.max(m, +f.numero), 0); }
  function reservarNumero(ctr) {
    const ref = CONFIG.doc("numeracao_" + ctr);
    const ini = ctr === "recleaner" ? (+A.cadastros.fichaInicial() || A.FICHA_INICIAL) : 1;
    return db.runTransaction(async t => {
      const d = await t.get(ref);
      const n = Math.max(d.exists ? +d.data().proximo || 0 : 0, ini, maxLocal(ctr) + 1);
      t.set(ref, { proximo: n + 1, em: new Date().toISOString() }, { merge: true });
      return n;
    });
  }
  let atribuindo = false;
  async function atribuirPendentes() {
    if (atribuindo || !navigator.onLine || !usuario) return;
    const minhas = lista.filter(f => f.numeroPendente && f.criadoPorEmail === usuario.email.toLowerCase());
    if (!minhas.length) return;
    atribuindo = true;
    try { for (const f of minhas) { const n = await comTempo(reservarNumero(A.ctrDe(f)), 10000); await FICHAS.doc(f.id).update({ numero: n, numeroPendente: false }); toastN(`Ficha sincronizada: recebeu o nº ${n}`); } }
    catch (e) { console.warn(e); } finally { atribuindo = false; }
  }
  window.addEventListener("online", () => setTimeout(atribuirPendentes, 1500));

  /* ---------- anexos: guardados à parte, em pedaços (limite de 1 MB por documento) ---------- */
  const PEDACO = 700000;
  function guardarAnexos(g) {
    g.anexos = g.anexos || { doc: [], cert: [] };
    ["doc", "cert"].forEach(k => (g.anexos[k] || []).forEach(a => {
      const conteudo = a.img || a.data;
      if (a.ref) { delete a.img; delete a.data; return; }
      if (!conteudo) return;
      const id = ANEXOS.doc().id, partes = [];
      for (let p = 0; p < conteudo.length; p += PEDACO) partes.push(conteudo.slice(p, p + PEDACO));
      const meta = { fichaId: g.id, tipo: k, nome: a.nome || "", campo: a.img ? "img" : "data", partes: partes.length, em: new Date().toISOString(), por: nomeUsuario() };
      /* cada pedaço num documento; não espera o servidor (no campo pode estar sem sinal: sobe quando voltar) */
      ANEXOS.doc(id).set(meta).catch(e => console.warn(e));
      partes.forEach((d, n) => ANEXOS.doc(id + "_" + n).set({ fichaId: g.id, d }).catch(e => console.warn(e)));
      a.ref = id; delete a.img; delete a.data;
    }));
    return g;
  }
  const cacheAnexo = new Map();
  async function carregarAnexo(a) {
    if (!a || a.img || a.data || !a.ref) return a;
    if (!cacheAnexo.has(a.ref)) cacheAnexo.set(a.ref, (async () => {
      const m = await ANEXOS.doc(a.ref).get(); if (!m.exists) return null;
      const meta = m.data(), ps = await Promise.all([...Array(meta.partes)].map((_, n) => ANEXOS.doc(a.ref + "_" + n).get()));
      return { campo: meta.campo, v: ps.map(p => p.exists ? p.data().d : "").join("") };
    })().catch(e => { cacheAnexo.delete(a.ref); throw e; }));
    const r = await cacheAnexo.get(a.ref);
    return r ? { ...a, [r.campo]: r.v } : a;
  }
  async function carregarAnexos(f) {
    if (!f || !f.anexos) return f;
    for (const k of ["doc", "cert"]) if (f.anexos[k]) f.anexos[k] = await Promise.all(f.anexos[k].map(a => carregarAnexo(a).catch(() => a)));
    return f;
  }

  /* ---------- duplicidade (consulta no banco, não só no que o aparelho tem) ---------- */
  async function mesmaChave(f) {
    const k = A.chaveDoc(f); if (!k) return [];
    try { const s = await comTempo(FICHAS.where("chave", "==", k).get(), 6000); return s.docs.map(d => d.data()); }
    catch (e) { return lista.filter(o => A.chaveDoc(o) === k); }
  }

  const store = {
    modo: "nuvem", carregado, carregarAnexo, carregarAnexos,
    ouvir(fn) { ouvintes.add(fn); if (pronto) fn(lista.slice()); return () => ouvintes.delete(fn); },
    async salvar(f) {
      await carregado; if (!PODE_EDITAR()) throw soLeitura();
      f = A.autoStatus(limpo(f)); f.contrato = A.ctrDe(f);
      const dup = A.duplicada(f, await mesmaChave(f));
      if (dup) { const e = new Error(A.msgDuplicada(f, dup)); e.code = "duplicada"; e.outra = dup; throw e; }
      const agora = new Date().toISOString();
      const existente = f.id && lista.find(o => o.id === f.id);
      if (!existente && !f.criadoEm) {
        f.id = f.id || "f" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        f.criadoEm = agora; f.criadoPor = f.criadoPor || nomeUsuario(); f.criadoPorEmail = usuario.email.toLowerCase();
        f.dia = diaLocal(agora);
        if (!f.numero) {
          try { if (!navigator.onLine) throw new Error("offline"); f.numero = await comTempo(reservarNumero(f.contrato), 8000); f.numeroPendente = false; }
          catch (e) { f.numero = null; f.numeroPendente = true; }
        }
      }
      f.atualizadoEm = agora; f.atualizadoPor = nomeUsuario();
      f.chave = A.chaveDoc(f) || null;
      const g = guardarAnexos(f);
      FICHAS.doc(g.id).set(g).catch(e => toastN("Não consegui gravar no servidor: " + e.message, true));
      return g;
    },
    async salvarVarias(l) {
      await carregado; if (!PODE_EDITAR() || perfil === "campo") return; const agora = new Date().toISOString();
      for (let i = 0; i < l.length; i += 400) {
        const b = db.batch();
        l.slice(i, i + 400).forEach(f => { const g = A.autoStatus(limpo(f)); g.atualizadoEm = agora; g.chave = A.chaveDoc(g) || null; b.set(FICHAS.doc(g.id), guardarAnexos(g)); });
        await b.commit();
      }
    },
    async importar(ctr, l) {
      await carregado; if (!(perfil === "admin" || perfil === "escritorio")) throw soLeitura();
      const velhos = await FICHAS.where("contrato", "==", ctr).where("importado", "==", true).get();
      for (let i = 0; i < velhos.docs.length; i += 450) { const b = db.batch(); velhos.docs.slice(i, i + 450).forEach(d => b.delete(d.ref)); await b.commit(); }
      const agora = new Date().toISOString();
      for (let i = 0; i < l.length; i += 400) {
        const b = db.batch();
        l.slice(i, i + 400).forEach(f => { const g = limpo({ ...f, contrato: ctr }); g.chave = A.chaveDoc(g) || null; g.criadoEm = g.criadoEm || agora; g.atualizadoEm = agora; g.dia = diaLocal(g.dataRecebimento ? g.dataRecebimento + "T12:00:00" : agora); b.set(FICHAS.doc(g.id), g); });
        await b.commit();
      }
      const max = l.reduce((m, f) => Math.max(m, +f.numero || 0), 0);
      await db.runTransaction(async t => { const ref = CONFIG.doc("numeracao_" + ctr), d = await t.get(ref); t.set(ref, { proximo: Math.max(d.exists ? +d.data().proximo || 0 : 0, max + 1) }, { merge: true }); });
      return l.length;
    },
    async excluir(id) {
      if (!(perfil === "admin" || perfil === "escritorio")) throw soLeitura();
      const f = lista.find(o => o.id === id);
      await FICHAS.doc(id).delete();
      if (f && f.anexos) ["doc", "cert"].forEach(k => (f.anexos[k] || []).forEach(a => { if (a.ref) ANEXOS.where("fichaId", "==", id).get().then(s => s.docs.forEach(d => d.ref.delete())).catch(() => { }); }));
    },
    async restaurarExemplos() { toastN("No modo nuvem não há fichas de exemplo."); }
  };
  A.store = store;

  /* cadastros (fornecedores, e-mails, numeração inicial…) também vão para o banco */
  window.NXNUVEM = {
    salvarCad(c) { if (!usuario || APP !== "escritorio" || !(perfil === "admin" || perfil === "escritorio")) return; CONFIG.doc("cadastros").set(limpo(c)).catch(e => toastN("Cadastro não foi para o servidor: " + e.message, true)); },
    sair() { auth.signOut().then(() => location.reload()); },
    trocarSenha() { if (!usuario) return; auth.sendPasswordResetEmail(usuario.email).then(() => toastN("Enviamos um link para " + usuario.email + " criar uma nova senha (veja também o lixo eletrônico).")).catch(e => toastN("Não consegui enviar: " + e.message, true)); },
    usuario: () => usuario, nome: () => nomeUsuario(), perfil: () => perfil, consulta: () => perfil === "consulta", regrasFirestore
  };

  /* ---------- aviso discreto ---------- */
  function toastN(msg, ruim) {
    const t = document.getElementById("toast");
    if (t) { t.textContent = msg; t.hidden = false; t.className = "toast show" + (ruim ? " bad" : ""); clearTimeout(toastN.t); toastN.t = setTimeout(() => { t.className = "toast"; if (APP === "escritorio") t.hidden = true; }, 4200); }
    else console.log(msg);
  }

  /* ---------- tela de login ---------- */
  const css = `#nxLogin{position:fixed;inset:0;z-index:9999;overflow:auto;font-family:Montserrat,system-ui,sans-serif;color:#eaf3ff;
    background:radial-gradient(1200px 700px at 78% 30%,#0e3263 0%,rgba(8,30,62,0) 60%),radial-gradient(900px 600px at 10% 100%,#0a2a55 0%,rgba(6,20,44,0) 65%),linear-gradient(160deg,#061a36 0%,#04142b 55%,#030d1e 100%)}
  #nxLogin[hidden]{display:none}
  #nxLogin .fx{position:fixed;inset:0;width:100%;height:100%;pointer-events:none}
  #nxLogin .vig{position:fixed;inset:0;pointer-events:none;background:radial-gradient(ellipse at center,transparent 45%,rgba(2,8,20,.55) 100%)}
  #nxLogin .cx{position:relative;min-height:100vh;min-height:100dvh;display:grid}
  #nxLogin .lw{position:relative;display:grid;grid-template-columns:minmax(0,1.1fr) minmax(320px,420px);align-items:center;gap:56px;max-width:1120px;margin:0 auto;padding:40px 32px}
  #nxLogin .br{display:grid;gap:14px;align-content:center}
  #nxLogin .br img{width:150px;height:150px;filter:drop-shadow(0 0 28px rgba(45,140,255,.35))}
  #nxLogin .br h1{margin:6px 0 0;font:700 3.2rem/1 Montserrat,system-ui,sans-serif;letter-spacing:-.03em;color:#fff}
  #nxLogin .br .tg{font-size:1.15rem;color:#cfe2fb;font-weight:500}#nxLogin .br .tg b{color:#6fc3ff;font-weight:700}
  #nxLogin .br .ln{width:56px;height:2px;border-radius:2px;background:linear-gradient(90deg,#2d8cff,#5fe0ff);margin:4px 0}
  #nxLogin .br .ds{max-width:38ch;color:#9fb9da;font-size:.95rem;line-height:1.5}
  #nxLogin .br .ft{margin-top:10px;font-size:.7rem;letter-spacing:.14em;text-transform:uppercase;color:#7090b8}
  #nxLogin .card{position:relative;width:100%;background:rgba(255,255,255,.97);color:#0f1d33;border-radius:22px;padding:30px 28px 24px;display:grid;gap:14px;border:1px solid rgba(255,255,255,.6);
    box-shadow:0 30px 70px rgba(1,8,22,.55),0 0 0 1px rgba(45,140,255,.10),0 0 60px rgba(45,140,255,.12);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px)}
  #nxLogin .card::before{content:"";position:absolute;left:24px;right:24px;top:0;height:3px;border-radius:0 0 4px 4px;background:linear-gradient(90deg,#2d8cff,#5fe0ff)}
  #nxLogin .ch{display:flex;align-items:center;justify-content:space-between;gap:10px}
  #nxLogin .ch h2{margin:0;font:700 1.45rem Montserrat,system-ui,sans-serif;color:#0b2d5b;letter-spacing:-.01em}
  #nxLogin .ch .ap{font:700 .66rem Montserrat,system-ui,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:#1c5cab;background:#e8f1fd;border-radius:999px;padding:5px 10px}
  #nxLogin .sb{margin:-6px 0 4px;color:#5b6b82;font-size:.88rem}
  #nxLogin label{font-size:.78rem;font-weight:600;color:#4b5563;display:grid;gap:6px}
  #nxLogin input{font:inherit;font-size:1rem;padding:13px 14px;border:1px solid #d3dde9;border-radius:12px;outline:none;color:#0f1d33;background:#f8fbff;transition:border-color .15s,box-shadow .15s,background .15s}
  #nxLogin input:focus{border-color:#2d8cff;background:#fff;box-shadow:0 0 0 4px rgba(45,140,255,.15)}
  #nxLogin button{font:600 1rem Montserrat,system-ui,sans-serif;border:0;border-radius:12px;padding:14px;cursor:pointer}
  #nxLogin .ent{background:linear-gradient(100deg,#1f6fe0,#2d8cff 60%,#3aa6ff);color:#fff;box-shadow:0 10px 24px rgba(45,140,255,.32);margin-top:4px;transition:transform .12s,box-shadow .12s}
  #nxLogin .ent:hover{transform:translateY(-1px);box-shadow:0 14px 28px rgba(45,140,255,.4)}#nxLogin .ent:disabled{opacity:.6;transform:none}
  #nxLogin .esq{background:none;color:#1c5cab;font-size:.86rem;padding:4px}
  #nxLogin .msg{font-size:.84rem;min-height:1.2em;color:#b42318}#nxLogin .msg.ok{color:#0b6b0b}
  #nxLogin .rod{font-size:.72rem;color:#7a8698;text-align:center;border-top:1px solid #edf1f6;padding-top:12px;margin-top:2px}
  #nxLogin .esp{position:relative;min-height:100%;display:grid;place-items:center;align-content:center;gap:16px;color:#cfe2fb;font-size:.95rem}
  #nxLogin .esp img{width:96px;height:96px;filter:drop-shadow(0 0 24px rgba(45,140,255,.4))}
  @media (prefers-reduced-motion:no-preference){#nxLogin .esp img{animation:nxPulse 1.6s ease-in-out infinite}@keyframes nxPulse{50%{opacity:.6;transform:scale(.96)}}#nxLogin .card,#nxLogin .br{animation:nxUp .6s ease-out both}#nxLogin .card{animation-delay:.08s}@keyframes nxUp{from{opacity:0;transform:translateY(14px)}}}
  @media (max-width:860px){#nxLogin .lw{grid-template-columns:1fr;gap:22px;padding:28px 18px;max-width:460px;align-content:center}
    #nxLogin .br{justify-items:center;text-align:center;gap:8px}#nxLogin .br img{width:96px;height:96px}#nxLogin .br h1{font-size:2.3rem}#nxLogin .br .ds,#nxLogin .br .ft{display:none}#nxLogin .card{padding:24px 20px 20px}}`;
  /* faixas de linhas luminosas (desenhadas no canvas, discretas) */
  let fxRaf = 0;
  function efeito(cv) {
    const ctx = cv.getContext("2d"), parado = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
    let w = 0, h = 0, dpr = 1;
    const tam = () => { dpr = Math.min(2, window.devicePixelRatio || 1); w = cv.clientWidth; h = cv.clientHeight; cv.width = w * dpr; cv.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
    const faixa = (t, o) => {
      const N = o.n;
      for (let i = 0; i < N; i++) {
        const k = i / (N - 1), sp = Math.sin(k * Math.PI);
        ctx.beginPath();
        for (let s = 0; s <= 1.0001; s += 0.02) {
          const x = -0.1 * w + s * 1.2 * w;
          const base = h * (o.y0 + (o.y1 - o.y0) * s) - h * o.arco * Math.sin(Math.PI * s);
          const amp = h * o.amp * Math.sin(Math.PI * s) * (k - .5) * 2;
          const onda = Math.sin(s * o.f + t * o.v + k * o.fase) * h * o.ond * sp;
          const y = base + amp * Math.cos(s * 3.2 + t * o.v * .7) + onda;
          s === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        const g = ctx.createLinearGradient(0, h, w, 0);
        const a = (0.08 + 0.42 * sp * sp) * o.alfa;
        g.addColorStop(0, `rgba(45,140,255,0)`); g.addColorStop(.35, `rgba(70,160,255,${a})`); g.addColorStop(.7, `rgba(120,225,255,${a * 1.15})`); g.addColorStop(1, `rgba(95,224,255,0)`);
        ctx.strokeStyle = g; ctx.lineWidth = o.lw || 0.9; ctx.stroke();
      }
    };
    const quadro = ms => {
      const t = ms / 1000;
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = "lighter";
      faixa(t, { n: 64, y0: 1.12, y1: .34, arco: .02, amp: .17, f: 5.2, v: .22, fase: 2.6, ond: .04, alfa: 1, lw: 1 });
      faixa(t, { n: 40, y0: 1.02, y1: .46, arco: -.08, amp: .11, f: 3.4, v: -.15, fase: 3.6, ond: .06, alfa: .75, lw: .8 });
      ctx.globalCompositeOperation = "source-over";
      if (!parado && document.getElementById("nxLogin") && !document.getElementById("nxLogin").hidden) fxRaf = requestAnimationFrame(quadro);
    };
    tam(); cancelAnimationFrame(fxRaf); fxRaf = requestAnimationFrame(quadro);
    window.addEventListener("resize", () => { tam(); if (parado) quadro(0); });
  }
  function telaLogin(estado, aviso) {
    let el = document.getElementById("nxLogin");
    if (!el) { const s = document.createElement("style"); s.textContent = css; document.head.appendChild(s); el = document.createElement("div"); el.id = "nxLogin"; el.innerHTML = `<canvas class="fx" aria-hidden="true"></canvas><div class="vig"></div><div class="cx"></div>`; document.body.appendChild(el); efeito(el.querySelector(".fx")); }
    if (el.hidden) { el.hidden = false; efeito(el.querySelector(".fx")); }
    const cx = el.querySelector(".cx");
    if (estado === "esperando") { cx.innerHTML = `<div class="esp"><img src="${url("marca/nexum-n-claro.svg")}" alt=""><span>Conectando ao Nexum…</span></div>`; return; }
    cx.innerHTML = `<div class="lw">
      <div class="br"><img src="${url("marca/nexum-n-claro.svg")}" alt=""><h1>Nexum</h1><div class="tg">Recebimento <b>inteligente.</b></div><div class="ln"></div></div>
      <form class="card" novalidate>
        <div class="ch"><h2>Entrar</h2><span class="ap">${APP === "campo" ? "Campo" : "Escritório"}</span></div>
        <label>E-mail<input type="email" id="nxEmail" autocomplete="username" inputmode="email" required placeholder="nome@milplan.com.br"></label>
        <label>Senha<input type="password" id="nxSenha" autocomplete="current-password" required></label>
        <div class="msg" id="nxMsg" role="status">${aviso || ""}</div>
        <button class="ent" type="submit" id="nxEntrar">Entrar</button>
        <button class="esq" type="button" id="nxEsq">Esqueci minha senha</button></form></div>`;
    const msg = (t, ok) => { const m = el.querySelector("#nxMsg"); m.textContent = t; m.className = "msg" + (ok ? " ok" : ""); };
    try { const e = localStorage.getItem("nx_ultimo_email"); if (e) el.querySelector("#nxEmail").value = e; } catch (e) { }
    el.querySelector("form").onsubmit = async ev => {
      ev.preventDefault();
      const email = el.querySelector("#nxEmail").value.trim().toLowerCase(), senha = el.querySelector("#nxSenha").value;
      if (!email || !senha) return msg("Preencha e-mail e senha.");
      if (!USUARIOS[email]) return msg("Este e-mail não está liberado no Nexum. Fale com a Qualidade.");
      const b = el.querySelector("#nxEntrar"); b.disabled = true; b.textContent = "Entrando…";
      try { await auth.signInWithEmailAndPassword(email, senha); try { localStorage.setItem("nx_ultimo_email", email); } catch (e) { } }
      catch (e) { msg({ "auth/invalid-credential": "E-mail ou senha incorretos.", "auth/wrong-password": "E-mail ou senha incorretos.", "auth/user-not-found": "E-mail ou senha incorretos.", "auth/too-many-requests": "Muitas tentativas. Espere alguns minutos e tente de novo.", "auth/network-request-failed": "Sem internet. Verifique o sinal e tente de novo." }[e.code] || "Não foi possível entrar: " + e.message); b.disabled = false; b.textContent = "Entrar"; }
    };
    el.querySelector("#nxEsq").onclick = async () => {
      const email = el.querySelector("#nxEmail").value.trim().toLowerCase();
      if (!email) return msg("Digite seu e-mail acima e toque de novo em “Esqueci minha senha”.");
      try { await auth.sendPasswordResetEmail(email); msg("Enviamos um link para " + email + " criar uma nova senha. Veja também o lixo eletrônico.", true); }
      catch (e) { msg("Não consegui enviar o e-mail: " + (e.code === "auth/user-not-found" ? "e-mail não cadastrado." : e.message)); }
    };
  }
  function esconderLogin() { const el = document.getElementById("nxLogin"); if (el) el.hidden = true; cancelAnimationFrame(fxRaf); }
  function mostrarUsuario() { const b = document.getElementById("badgeDemo"); if (b) b.hidden = true; }


  /* ---------- regras do Firestore (para colar no console) ---------- */
  function regrasFirestore() {
    const por = (...ps) => Object.entries(USUARIOS).filter(([, v]) => ps.includes(v.perfil)).map(([k]) => `'${k}'`).join(", ");
    return `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function email() { return request.auth.token.email.lower(); }
    function admin() { return request.auth != null && email() in [${por("admin", "escritorio")}]; }
    function consulta() { return request.auth != null && email() in [${por("consulta")}]; }
    function campo() { return request.auth != null && email() in [${por("campo")}]; }
    function leitor() { return admin() || consulta() || campo(); }
    match /fichas/{id} {
      allow read: if leitor();
      allow create, update: if admin() || campo();
      allow delete: if admin();
    }
    match /anexos/{id} {
      allow read: if leitor();
      allow create: if admin() || campo();
      allow update, delete: if admin();
    }
    match /config/{id} {
      allow read: if leitor();
      allow write: if admin() || (campo() && id.matches('numeracao_.*'));
    }
  }
}`;
  }

  telaLogin("esperando");
  let avisoSaida = "";
  auth.onAuthStateChanged(u => {
    if (!u) { usuario = null; telaLogin("login", avisoSaida); avisoSaida = ""; return; }
    const pf = (USUARIOS[(u.email || "").toLowerCase()] || {}).perfil;
    if (!pf) { avisoSaida = "Este e-mail não está liberado no Nexum."; auth.signOut(); return; }
    if (APP === "escritorio" && pf === "campo") { avisoSaida = "Seu acesso é do app de campo (celular). O escritório é só para a Qualidade."; auth.signOut(); return; }
    usuario = u; perfil = pf; esconderLogin(); mostrarUsuario();
    document.body.classList.toggle("consulta", perfil === "consulta");
    window.dispatchEvent(new CustomEvent("nx-perfil", { detail: perfil }));
    assinar();
  });
})();
