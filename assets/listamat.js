/* Nexum — Lista de materiais (romaneio Anglo).
   Lê qualquer planilha .xlsx/.csv com cabeçalho (descrição, TAG/código, quantidade, unidade e, se houver, romaneio),
   guarda no aparelho até ser trocada e permite buscar por romaneio, TAG ou parte da descrição. */
(function () {
  const norm = s => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
  const chave = s => norm(s).replace(/[^A-Z0-9]/g, "");
  const COLS = {
    romaneio: [/ROMANEIO/, /^RM\b/, /\bRM$/, /^N[ºO°.]*\s*(DA\s+)?RM\b/, /PACKING/, /^PL$/, /DOCUMENTO DE TRANSPORTE/],
    tag: [/^TAG/, /TAG$/, /^CODIGO/, /^COD\b/, /COD\. ?MATERIAL/, /PART ?(NUMBER|NO|N)/, /^P\/?N$/, /^ITEM CODE/, /^MATERIAL$/, /SAP/],
    descricao: [/DESCRI/, /^MATERIAL DESC/, /^ITEM$/, /^NOME/],
    qtd: [/^QTD/, /QUANT/, /^QTY/],
    und: [/^UN$/, /^UND/, /^UNID/, /^UOM/, /^UM$/],
    volume: [/VOLUME/, /^CAIXA/, /^EMBALAGEM/],
    desenho: [/DESENHO/, /DRAWING/]
  };
  let lista = null; /* {nome, aba, carregadaEm, linhas:[{romaneio, tag, descricao, qtd, und, volume, desenho}]} */
  const IDB = { db: null,
    abrir() { return this.db || (this.db = new Promise((ok, err) => { const r = indexedDB.open("nx_listamat", 1); r.onupgradeneeded = () => r.result.createObjectStore("kv"); r.onsuccess = () => ok(r.result); r.onerror = () => err(r.error); })); },
    async get(k) { const db = await this.abrir(); return new Promise(ok => { const t = db.transaction("kv").objectStore("kv").get(k); t.onsuccess = () => ok(t.result); t.onerror = () => ok(undefined); }); },
    async set(k, v) { const db = await this.abrir(); return new Promise(ok => { try { const t = db.transaction("kv", "readwrite"); t.objectStore("kv").put(v, k); t.oncomplete = () => ok(); t.onerror = () => ok(); } catch (e) { ok(); } }); }
  };
  function achaCab(linhas) {
    let melhor = null;
    for (let i = 0; i < Math.min(40, linhas.length); i++) {
      const r = linhas[i].map(norm), mapa = {};
      r.forEach((c, j) => { if (!c) return; for (const [k, res] of Object.entries(COLS)) if (mapa[k] === undefined && res.some(re => re.test(c))) { mapa[k] = j; break; } });
      const pts = Object.keys(mapa).length + (mapa.descricao !== undefined ? 2 : 0);
      if ((mapa.descricao !== undefined || mapa.tag !== undefined) && Object.keys(mapa).length >= 2 && (!melhor || pts > melhor.pts)) melhor = { i, mapa, pts };
    }
    return melhor;
  }
  function ler(buf, nome) {
    const wb = XLSX.read(buf, { type: "array", dense: true });
    let alvo = null;
    for (const aba of wb.SheetNames) {
      const linhas = XLSX.utils.sheet_to_json(wb.Sheets[aba], { header: 1, raw: false, defval: "" });
      const c = achaCab(linhas);
      if (c && (!alvo || c.pts > alvo.c.pts || (c.pts === alvo.c.pts && linhas.length > alvo.linhas.length))) alvo = { aba, linhas, c };
    }
    if (!alvo) throw new Error("Não encontrei as colunas de descrição / TAG nesta planilha.");
    const m = alvo.c.mapa, v = (r, k) => m[k] === undefined ? "" : String(r[m[k]] ?? "").trim();
    const linhas = alvo.linhas.slice(alvo.c.i + 1).map(r => ({ romaneio: norm(v(r, "romaneio")), tag: norm(v(r, "tag")), descricao: norm(v(r, "descricao")), qtd: v(r, "qtd"), und: window.AMR && AMR.normUnd ? AMR.normUnd(v(r, "und")) : v(r, "und").toUpperCase(), volume: v(r, "volume"), desenho: v(r, "desenho") }))
      .filter(x => x.descricao || x.tag);
    if (!linhas.length) throw new Error("A planilha não tem itens abaixo do cabeçalho.");
    return { nome, aba: alvo.aba, colunas: Object.keys(m), carregadaEm: new Date().toISOString(), linhas };
  }
  async function carregar(file) { lista = ler(await file.arrayBuffer(), file.name); IDB.set("lista", lista).catch(() => { }); return info(); }
  async function restaurar() { if (lista) return true; const l = await IDB.get("lista").catch(() => null); if (l && (l.linhas || []).length) { lista = l; return true; } return false; }
  const info = () => lista ? { nome: lista.nome, aba: lista.aba, total: lista.linhas.length, temRomaneio: lista.colunas.includes("romaneio"), carregadaEm: lista.carregadaEm } : null;
  function doRomaneio(rom, soExato) {
    if (!lista) return []; const k = chave(rom); if (!k) return [];
    /* RM exata primeiro (também sem zeros à esquerda: RM 0123 = RM 123); parcial só se não houver exata */
    const sz = t => t.replace(/^(RM)?0+/, "$1").replace(/^RM/, "");
    const ex = lista.linhas.filter(x => x.romaneio && (chave(x.romaneio) === k || sz(chave(x.romaneio)) === sz(k)));
    if (ex.length || soExato) return ex;
    return lista.linhas.filter(x => x.romaneio && (chave(x.romaneio).includes(k) || k.includes(chave(x.romaneio)) && chave(x.romaneio).length >= 4));
  }
  function buscar(txt, max) {
    if (!lista) return []; const q = norm(txt), qk = chave(txt); if (q.length < 2) return [];
    const pal = q.split(" ").filter(Boolean);
    const r = [];
    for (const x of lista.linhas) {
      let p = 0;
      if (qk && chave(x.tag) === qk) p = 100; else if (qk.length >= 3 && chave(x.tag).includes(qk)) p = 60;
      else if (pal.every(w => x.descricao.includes(w) || x.tag.includes(w))) p = 30;
      if (p) r.push({ x, p });
    }
    return r.sort((a, b) => b.p - a.p).slice(0, max || 20).map(y => y.x);
  }
  function porTag(tag) { if (!lista) return null; const k = chave(tag); return k ? lista.linhas.find(x => chave(x.tag) === k) || null : null; }
  window.NXLM = { carregar, restaurar, info, doRomaneio, buscar, porTag, _ler: ler };
})();
