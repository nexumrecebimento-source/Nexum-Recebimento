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

  let usuario = null;
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
      await carregado;
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
      await carregado; const agora = new Date().toISOString();
      for (let i = 0; i < l.length; i += 400) {
        const b = db.batch();
        l.slice(i, i + 400).forEach(f => { const g = A.autoStatus(limpo(f)); g.atualizadoEm = agora; g.chave = A.chaveDoc(g) || null; b.set(FICHAS.doc(g.id), guardarAnexos(g)); });
        await b.commit();
      }
    },
    async importar(ctr, l) {
      await carregado;
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
      const f = lista.find(o => o.id === id);
      await FICHAS.doc(id).delete();
      if (f && f.anexos) ["doc", "cert"].forEach(k => (f.anexos[k] || []).forEach(a => { if (a.ref) ANEXOS.where("fichaId", "==", id).get().then(s => s.docs.forEach(d => d.ref.delete())).catch(() => { }); }));
    },
    async restaurarExemplos() { toastN("No modo nuvem não há fichas de exemplo."); }
  };
  A.store = store;

  /* cadastros (fornecedores, e-mails, numeração inicial…) também vão para o banco */
  window.NXNUVEM = {
    salvarCad(c) { if (!usuario || APP !== "escritorio") return; CONFIG.doc("cadastros").set(limpo(c)).catch(e => toastN("Cadastro não foi para o servidor: " + e.message, true)); },
    sair() { auth.signOut().then(() => location.reload()); },
    usuario: () => usuario, regrasFirestore
  };

  /* ---------- aviso discreto ---------- */
  function toastN(msg, ruim) {
    const t = document.getElementById("toast");
    if (t) { t.textContent = msg; t.className = "toast show" + (ruim ? " bad" : ""); clearTimeout(toastN.t); toastN.t = setTimeout(() => t.className = "toast", 4200); }
    else console.log(msg);
  }

  /* ---------- tela de login ---------- */
  const css = `#nxLogin{position:fixed;inset:0;z-index:9999;display:grid;place-items:center;padding:20px;background:linear-gradient(160deg,#0b2d5b 0%,#123d75 55%,#1c5cab 100%);font-family:Montserrat,system-ui,sans-serif}
  #nxLogin .card{border:0!important;margin:0;width:min(380px,100%);background:#fff;border-radius:18px;padding:28px 24px 22px;box-shadow:0 20px 60px rgba(4,20,45,.45);display:grid;gap:12px}
  #nxLogin .lg{display:flex;align-items:center;gap:12px;margin-bottom:4px}#nxLogin .lg img{width:44px;height:44px}
  #nxLogin .lg b{display:block;font:700 1.45rem Montserrat,system-ui,sans-serif;color:#0b2d5b;letter-spacing:-.01em}#nxLogin .lg small{font-size:.72rem;letter-spacing:.12em;text-transform:uppercase;color:#4b5563}
  #nxLogin label{font-size:.78rem;font-weight:600;color:#4b5563;display:grid;gap:5px}
  #nxLogin input{font:inherit;font-size:1rem;padding:12px 13px;border:1px solid #cfd9e6;border-radius:10px;outline:none;color:#0f1d33}
  #nxLogin input:focus{border-color:#2d8cff;box-shadow:0 0 0 3px rgba(45,140,255,.18)}
  #nxLogin button{font:600 1rem Montserrat,system-ui,sans-serif;border:0;border-radius:10px;padding:13px;cursor:pointer}
  #nxLogin .ent{background:#2d8cff;color:#fff}#nxLogin .ent:disabled{opacity:.6}
  #nxLogin .esq{background:none;color:#1c5cab;font-size:.85rem;padding:4px}
  #nxLogin .msg{font-size:.84rem;min-height:1.2em;color:#b42318}#nxLogin .msg.ok{color:#0b6b0b}
  #nxLogin .rod{font-size:.72rem;color:#6b7280;text-align:center;margin-top:2px}
  #nxLogin .esp{display:grid;place-items:center;gap:10px;color:#fff;font-size:.9rem}`;
  function telaLogin(estado, aviso) {
    let el = document.getElementById("nxLogin");
    if (!el) { const s = document.createElement("style"); s.textContent = css; document.head.appendChild(s); el = document.createElement("div"); el.id = "nxLogin"; document.body.appendChild(el); }
    el.hidden = false;
    if (estado === "esperando") { el.innerHTML = `<div class="esp"><img src="${url("marca/nexum-n-claro.svg")}" width="56" height="56" alt=""><span>Conectando ao Nexum…</span></div>`; return; }
    el.innerHTML = `<form class="card" novalidate>
      <div class="lg"><img src="${url("marca/nexum-n-escuro.svg")}" alt=""><div><b>Nexum</b><small>Recebimento inteligente · ${APP === "campo" ? "Campo" : "Escritório"}</small></div></div>
      <label>E-mail<input type="email" id="nxEmail" autocomplete="username" inputmode="email" required placeholder="nome@milplan.com.br"></label>
      <label>Senha<input type="password" id="nxSenha" autocomplete="current-password" required></label>
      <div class="msg" id="nxMsg" role="status">${aviso || ""}</div>
      <button class="ent" type="submit" id="nxEntrar">Entrar</button>
      <button class="esq" type="button" id="nxEsq">Esqueci minha senha</button>
      <div class="rod">Acesso só para usuários cadastrados pela Qualidade.</div></form>`;
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
  function esconderLogin() { const el = document.getElementById("nxLogin"); if (el) el.hidden = true; }
  function mostrarUsuario() {
    const b = document.getElementById("badgeDemo"); if (!b) return;
    b.hidden = false; b.textContent = "☁ " + nomeUsuario().split(" ")[0];
    b.title = `Conectado como ${nomeUsuario()} (${usuario.email}) · clique para sair`;
    b.style.cursor = "pointer"; b.classList.add("nuvem");
    b.onclick = () => { if (confirm(`Sair do Nexum?\n\nConectado como ${nomeUsuario()}.`)) window.NXNUVEM.sair(); };
  }

  /* ---------- regras do Firestore (para colar no console) ---------- */
  function regrasFirestore() {
    const por = p => Object.entries(USUARIOS).filter(([, v]) => v.perfil === p).map(([k]) => `'${k}'`).join(", ");
    return `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function email() { return request.auth.token.email.lower(); }
    function escritorio() { return request.auth != null && email() in [${por("escritorio")}]; }
    function campo() { return request.auth != null && email() in [${por("campo")}]; }
    function liberado() { return escritorio() || campo(); }
    match /fichas/{id} {
      allow read, create, update: if liberado();
      allow delete: if escritorio();
    }
    match /anexos/{id} {
      allow read, create: if liberado();
      allow update, delete: if escritorio();
    }
    match /config/{id} {
      allow read: if liberado();
      allow write: if escritorio() || (campo() && id.matches('numeracao_.*'));
    }
  }
}`;
  }

  telaLogin("esperando");
  let avisoSaida = "";
  auth.onAuthStateChanged(u => {
    if (!u) { usuario = null; telaLogin("login", avisoSaida); avisoSaida = ""; return; }
    const perfil = (USUARIOS[(u.email || "").toLowerCase()] || {}).perfil;
    if (!perfil) { avisoSaida = "Este e-mail não está liberado no Nexum."; auth.signOut(); return; }
    if (APP === "escritorio" && perfil !== "escritorio") { avisoSaida = "Seu acesso é do app de campo (celular). O escritório é só para a Qualidade."; auth.signOut(); return; }
    usuario = u; esconderLogin(); mostrarUsuario(); assinar();
  });
})();
