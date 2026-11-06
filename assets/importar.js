/* Nexum — importação do histórico (447.QUA.FP-11) e preenchimento automático de informações faltantes.
   Tudo roda no navegador: a planilha é lida no computador do usuário e não vai para o código publicado. */
(function () {
  const A = () => window.AMR;
  const semAc = s => String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
  const txt = v => (v === null || v === undefined) ? "" : String(v).replace(/\s+/g, " ").trim();
  const vazio = v => { const t = txt(v); return !t || /^[-_.]+$/.test(t); };

  /* ---------- normalizações ---------- */
  const STATUS_TXT = { "FINALIZADO": "finalizado", "CERTIFICADO PENDENTE": "cert_pendente", "EM ANDAMENTO": "em_andamento", "SEM ACAO": "sem_acao" };
  function status(v) { return STATUS_TXT[semAc(v)] || ""; }
  function fornecimento(v) {
    const s = semAc(v); if (!s) return "";
    if (/ANG|AMERIC/.test(s)) return "ANGLO AMERICAN";
    if (/MI[LP]+|PLAN/.test(s)) return "MILPLAN ENGENHARIA";
    return txt(v).toUpperCase();
  }
  function fornecedor(v) {
    const s = txt(v).toUpperCase(); if (!s) return "";
    if (/^RE[CF]+EBIDO\s+ANGLO/.test(semAc(s)) || /^ANG\w*\s+AM\w*$/.test(semAc(s))) return "ANGLO AMERICAN";
    return s;
  }
  function cert(v) {
    const s = semAc(v); if (!s) return "";
    if (/^N\/?A\.?$/.test(s) || s === "NAO SE APLICA") return "N/A";
    if (/^OBS\.?\s*1$/.test(s)) return "OBS 1";
    if (/PENDENTE/.test(s)) return "";
    return txt(v).toUpperCase();
  }
  function local(v) {
    let s = txt(v).toUpperCase(); if (!s) return "";
    const u = semAc(s);
    let m = u.match(/^PLATO\s*-?\s*(\d+)$/); if (m) return "PLATÔ " + m[1];
    m = u.match(/^DIQUE\s*-?\s*0*(\d+)$/); if (m) return "DIQUE " + m[1].padStart(2, "0");
    m = u.match(/^KM\s*-?\s*(\d+)$/); if (m) return "KM " + m[1];
    return s;
  }
  function conf(v) { const s = semAc(v).replace(/[^A-Z]/g, ""); return s === "C" ? "C" : s === "NC" ? "NC" : s === "NA" ? "NA" : ""; }
  function qtd(v) {
    if (typeof v === "number") return v;
    const s = txt(v).replace(/\s/g, ""); if (!s) return "";
    const n = Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);
    return isFinite(n) ? n : "";
  }
  function data(v) {
    if (v instanceof Date && !isNaN(v)) return new Date(v.getTime() - v.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
    if (typeof v === "number" && v > 20000 && v < 80000) return new Date(Math.round((v - 25569) * 864e5)).toISOString().slice(0, 10);
    const s = txt(v); let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (m) { const y = m[3].length === 2 ? "20" + m[3] : m[3]; return `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`; }
    m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return m[0];
    return "";
  }
  const numFicha = v => { const s = txt(v).replace(/\D/g, ""); return s ? parseInt(s, 10) : null; };

  /* ---------- leitura da planilha ---------- */
  function acharCabecalho(rows) {
    for (let i = 0; i < Math.min(rows.length, 30); i++) {
      const r = (rows[i] || []).map(semAc);
      if (r.some(c => c.startsWith("FICHA")) && r.some(c => c.startsWith("DESCRI"))) return i;
    }
    return -1;
  }
  function mapaColunas(h) {
    const H = h.map(semAc), first = re => H.findIndex(c => re.test(c)), last = re => { for (let i = H.length - 1; i >= 0; i--) if (re.test(H[i])) return i; return -1; };
    const st1 = first(/^STATUS/), st2 = last(/^STATUS/), fi = first(/^FICHA/);
    return {
      statusFicha: st1 >= 0 && st1 < fi ? st1 : -1, statusItem: st2 > fi ? st2 : -1, ficha: fi,
      item: first(/^ITEM/), desc: first(/^DESCRI/), tag: first(/^TAG/), nf: first(/^NOTA/), rom: first(/^ROMANEIO/),
      cert: first(/^CERTIF/), und: first(/^UND|^UNID/), qtd: first(/^QUANT/), data: first(/^DATA/),
      fornecimento: first(/^FORNECIMENTO/), fornecedor: first(/^FORNECEDOR/), local: first(/^LOCALIZ/),
      extra: H.findIndex((c, i) => !c && i > fi && i < first(/^ROMANEIO/)) /* coluna sem título que às vezes traz o fornecedor */
    };
  }
  function contratoDaAba(nome, titulo) {
    const t = semAc(nome + " " + titulo);
    if (/ESPESSADOR/.test(t)) return "espessador";
    if (/FLOTA|RECLEANER/.test(t)) return "recleaner";
    return "";
  }
  /* Lê o arquivo e devolve, por contrato, as linhas cruas organizadas */
  function lerPlanilha(wb) {
    const out = [];
    wb.SheetNames.forEach(nome => {
      const ws = wb.Sheets[nome];
      const rows = window.XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: false });
      const hi = acharCabecalho(rows); if (hi < 0) return;
      const titulo = rows.slice(0, hi).flat().filter(Boolean).join(" ");
      const ctr = contratoDaAba(nome, titulo); if (!ctr) return;
      const col = mapaColunas(rows[hi]);
      const linhas = rows.slice(hi + 1).filter(r => r && r.some(c => !vazio(c)));
      const atualizacao = (titulo.match(/Atualiza[cç][aã]o:\s*([\d/]+)/i) || [])[1] || "";
      out.push({ aba: nome, contrato: ctr, col, linhas, atualizacao });
    });
    return out;
  }

  /* ---------- montagem das fichas ---------- */
  function montar(aba) {
    const c = aba.col, g = new Map(), semNumero = [];
    const v = (r, k) => c[k] >= 0 ? r[c[k]] : null;
    let ultima = null; const herdadas = new Map();
    aba.linhas.forEach(r => {
      let n = numFicha(v(r, "ficha"));
      const temItem = !vazio(v(r, "desc")) || !vazio(v(r, "tag"));
      if (!n && temItem && ultima) { n = ultima; herdadas.set(r, ultima); }
      if (!n) { if (temItem) semNumero.push(r); return; }
      ultima = n;
      if (!g.has(n)) g.set(n, []);
      g.get(n).push(r);
    });
    const encerrado = !window.AMR.CONTRATOS[aba.contrato].ativo;
    const fichas = [...g.entries()].sort((a, b) => a[0] - b[0]).map(([n, rs]) => {
      const pick = k => { for (const r of rs) { const x = v(r, k); if (!vazio(x)) return x; } return null; };
      const fcto = fornecimento(pick("fornecimento"));
      const nfRaw = txt(pick("nf")), nfAng = /ANGLO|RECEBIDO/.test(semAc(nfRaw));
      const rom = fcto === "ANGLO AMERICAN" || nfAng || (!fcto && /^N\/?A$/.test(semAc(nfRaw)) && !vazio(pick("rom")));
      let forn = fornecedor(pick("fornecedor")) || fornecedor(c.extra >= 0 ? pick("extra") : "");
      if (rom) forn = "ANGLO AMERICAN";
      const st = status(pick("statusFicha"));
      const herd = [];
      const itens = rs.filter(r => !vazio(v(r, "desc")) || !vazio(v(r, "tag")) || !vazio(v(r, "qtd"))).map((r, k) => {
        if (herdadas.has(r)) herd.push(k);
        const it = { descricao: txt(v(r, "desc")).toUpperCase(), tag: txt(v(r, "tag")).toUpperCase(), und: txt(v(r, "und")).toUpperCase(), qtd: qtd(v(r, "qtd")), local: local(v(r, "local")), conf: conf(v(r, "statusItem")) };
        const ct = cert(v(r, "cert")); if (ct) it.certificado = ct;
        return it;
      });
      const f = {
        id: `imp-${aba.contrato}-${n}`, importado: true, contrato: aba.contrato, numero: n,
        tipo: rom ? "ROM" : "NF", nf: rom ? "" : (/^N\/?A$/.test(semAc(nfRaw)) ? "" : nfRaw.toUpperCase()), romaneio: txt(pick("rom")).toUpperCase(),
        fornecedor: forn, fornecimento: rom ? "ANGLO AMERICAN" : (fcto || "MILPLAN ENGENHARIA"),
        dataRecebimento: data(pick("data")), status: st || (encerrado ? "finalizado" : ""), itens,
        observacao: rom ? window.AMR.OBS_ANGLO : "", assinaturas: {}, anexos: { doc: [], cert: [] },
        conferencia: { situacao: (st || (encerrado ? "finalizado" : "")) === "finalizado" ? "aprovada" : "pendente", historico: [{ acao: "importada", em: new Date().toISOString(), por: "Importação FP-11 (" + aba.aba + ")" }] },
        origem: "importacao", auto: []
      };
      herd.forEach(k => f.auto.push({ campo: "ficha", item: k, valor: String(n), regra: "linha sem nº de ficha no mapa, ligada à ficha da linha de cima" }));
      if (!st && encerrado) f.auto.push({ campo: "status", valor: "finalizado", regra: "contrato encerrado" });
      /* itens do mapa: certificado vazio em ficha com "Certificado pendente" = pendência real */
      f.itens.forEach(i => {
        if (f.tipo !== "NF") return;
        if (!i.certificado && f.status === "cert_pendente") i.exigeCertificado = true;
        else if (i.certificado === "N/A") i.exigeCertificado = false;
        else if (i.certificado && f.status === "finalizado") i.certValidado = true; /* já aceito no mapa */
      });
      return f;
    });
    return { fichas, semNumero: semNumero.length };
  }

  /* ---------- preenchimento automático ----------
     Só preenche o que está vazio, nunca sobrescreve. Cada preenchimento fica registrado em f.auto
     (campo, valor, regra) para a Qualidade revisar e confirmar. */
  function contexto(fichas) {
    const porNF = new Map(), porTag = new Map(), porNum = new Map();
    const conta = (m, k, val) => { if (!k || vazio(val)) return; if (!m.has(k)) m.set(k, new Map()); const x = m.get(k); x.set(val, (x.get(val) || 0) + 1); };
    fichas.forEach(f => {
      porNum.set(+f.numero, f);
      if (f.tipo === "NF" && f.nf) porNF.set(String(f.nf).replace(/\D/g, ""), (porNF.get(String(f.nf).replace(/\D/g, "")) || []).concat(f));
      (f.itens || []).forEach(i => { if (i.tag && i.tag.length >= 4) { conta(porTag, i.tag + "|d", i.descricao); conta(porTag, i.tag + "|u", i.und); } });
    });
    const maisComum = (k) => { const m = porTag.get(k); if (!m) return ""; return [...m.entries()].sort((a, b) => b[1] - a[1])[0][0]; };
    return { porNF, maisComum, porNum, nums: [...porNum.keys()].sort((a, b) => a - b) };
  }
  function completar(f, ctx) {
    const g = JSON.parse(JSON.stringify(f)), auto = g.auto || [];
    const add = (campo, valor, regra, item) => auto.push(item === undefined ? { campo, valor, regra } : { campo, item, valor, regra });
    const mesmaNF = g.tipo === "NF" && g.nf ? (ctx.porNF.get(String(g.nf).replace(/\D/g, "")) || []).filter(o => o.id !== g.id) : [];
    /* fornecedor da NF */
    if (g.tipo === "NF" && !g.fornecedor) { const o = mesmaNF.find(o => o.fornecedor); if (o) { g.fornecedor = o.fornecedor; add("fornecedor", o.fornecedor, `mesma NF na ficha ${o.numero}`); } }
    if (g.tipo === "ROM" && !g.fornecedor) { g.fornecedor = "ANGLO AMERICAN"; add("fornecedor", g.fornecedor, "romaneio Anglo"); }
    /* data de recebimento */
    if (!g.dataRecebimento) {
      const o = mesmaNF.find(o => o.dataRecebimento);
      if (o) { g.dataRecebimento = o.dataRecebimento; add("dataRecebimento", o.dataRecebimento, `mesma NF na ficha ${o.numero}`); }
      else {
        const i = ctx.nums.indexOf(+g.numero); let ant = null, dep = null;
        const perto = x => Math.abs(+x.numero - +g.numero) <= 5;
        for (let k = i - 1; k >= 0 && !ant && +g.numero - ctx.nums[k] <= 5; k--) { const x = ctx.porNum.get(ctx.nums[k]); if (x && x.dataRecebimento && !(x.auto || []).some(a => a.campo === "dataRecebimento")) ant = x; }
        for (let k = i + 1; k < ctx.nums.length && !dep && ctx.nums[k] - g.numero <= 5; k++) { const x = ctx.porNum.get(ctx.nums[k]); if (x && x.dataRecebimento && !(x.auto || []).some(a => a.campo === "dataRecebimento")) dep = x; }
        const base = ant || dep; void perto;
        if (base) { g.dataRecebimento = base.dataRecebimento; add("dataRecebimento", base.dataRecebimento, `estimada pela ficha ${ant ? "anterior" : "seguinte"} (${base.numero})`); }
      }
    }
    /* itens */
    (g.itens || []).forEach((it, n) => {
      if (!it.descricao && it.tag) { const d = ctx.maisComum(it.tag + "|d"); if (d) { it.descricao = d; add("descricao", d, `mesma TAG ${it.tag} em outra ficha`, n); } }
      if (!it.und && it.tag) { const u = ctx.maisComum(it.tag + "|u"); if (u) { it.und = u; add("und", u, `mesma TAG ${it.tag} em outra ficha`, n); } }
      if (!it.local) { const o = g.itens.find(x => x.local); if (o) { it.local = o.local; add("local", o.local, "mesma ficha", n); } }
      if (!it.conf && g.status === "finalizado") { it.conf = "C"; add("conf", "C", "ficha finalizada sem não conformidade registrada", n); }
      if (g.tipo === "NF" && !it.certificado && g.status === "finalizado" && it.exigeCertificado !== true) { it.certificado = "N/A"; it.exigeCertificado = false; add("certificado", "N/A", "ficha finalizada no mapa sem certificado", n); }
    });
    /* status */
    if (!g.status) {
      const v = (g.itens || []).length; g.status = v ? "em_andamento" : "sem_acao";
      add("status", g.status, v ? "ficha com itens sem status" : "ficha sem itens lançados");
    }
    g.auto = auto;
    return window.AMR.autoStatus(g);
  }
  /* registros para números que faltam na sequência (pulados no mapa) */
  function lacunas(fichas, contrato) {
    const nums = new Set(fichas.map(f => +f.numero)), max = Math.max(0, ...nums), out = [];
    for (let n = 1; n < max; n++) if (!nums.has(n)) out.push({ id: `lac-${contrato}-${n}`, contrato, numero: n, lacuna: true, importado: true, tipo: "NF", nf: "", romaneio: "", fornecedor: "", fornecimento: "", dataRecebimento: "", status: "sem_acao", itens: [], observacao: "", assinaturas: {}, anexos: { doc: [], cert: [] }, conferencia: { situacao: "pendente", historico: [{ acao: "lacuna", em: new Date().toISOString(), por: "Nexum" }] }, origem: "importacao", auto: [] });
    return out;
  }

  /* ---------- o que ainda falta (pendências de dados) ---------- */
  const ROT = { ficha: "Nº da ficha (linha)", dataRecebimento: "Data de recebimento", fornecedor: "Fornecedor", nf: "Nº da NF", romaneio: "Nº do romaneio", status: "Status", itens: "Itens", descricao: "Descrição do item", und: "Unidade", qtd: "Quantidade", local: "Localização", conf: "Inspeção (C/NC)", certificado: "Certificado", lacuna: "Número sem ficha" };
  function faltantes(f) {
    const out = [];
    if (f.lacuna) return [{ campo: "lacuna", tipo: "falta" }];
    if (!f.dataRecebimento) out.push({ campo: "dataRecebimento", tipo: "falta" });
    if (f.tipo === "NF" && !f.fornecedor) out.push({ campo: "fornecedor", tipo: "falta" });
    if (f.tipo === "NF" && !f.nf) out.push({ campo: "nf", tipo: "falta" });
    if (f.tipo === "ROM" && !f.romaneio) out.push({ campo: "romaneio", tipo: "falta" });
    const its = window.AMR.itensValidos(f);
    if (!its.length && f.status !== "sem_acao") out.push({ campo: "itens", tipo: "falta" });
    (f.itens || []).forEach((i, n) => {
      if (!(i.descricao || i.tag)) return;
      if (!i.descricao) out.push({ campo: "descricao", item: n, tipo: "falta" });
      if (!i.und) out.push({ campo: "und", item: n, tipo: "falta" });
      if (i.qtd === "" || i.qtd === undefined || i.qtd === null) out.push({ campo: "qtd", item: n, tipo: "falta" });
      if (!i.local) out.push({ campo: "local", item: n, tipo: "falta" });
      if (!i.conf && f.status === "finalizado") out.push({ campo: "conf", item: n, tipo: "falta" });
    });
    (f.auto || []).forEach(a => out.push({ ...a, tipo: "auto" }));
    return out;
  }

  /* ---------- fluxo completo ---------- */
  function processar(wb, atuais) {
    const abas = lerPlanilha(wb), res = [];
    abas.forEach(aba => {
      const { fichas, semNumero } = montar(aba);
      const outros = (atuais || []).filter(f => (f.contrato || "recleaner") === aba.contrato && !f.importado && !f.exemplo);
      const ctx = contexto(fichas.concat(outros));
      let comp = fichas.map(f => completar(f, ctx));
      /* segunda passada: datas estimadas a partir das que acabaram de ser preenchidas por NF */
      const ctx2 = contexto(comp.concat(outros)); comp = comp.map(f => f.dataRecebimento ? f : completar(f, ctx2));
      const ocupados = new Set(outros.map(f => +f.numero));
      const lac = lacunas(comp.concat(outros), aba.contrato).filter(l => !ocupados.has(l.numero));
      const itens = comp.reduce((s, f) => s + (f.itens || []).length, 0);
      const autoN = comp.reduce((s, f) => s + (f.auto || []).length, 0);
      const faltaN = comp.reduce((s, f) => s + faltantes(f).filter(x => x.tipo === "falta").length, 0);
      const porStatus = {}; comp.forEach(f => porStatus[f.status] = (porStatus[f.status] || 0) + 1);
      res.push({ aba: aba.aba, contrato: aba.contrato, atualizacao: aba.atualizacao, fichas: comp, lacunas: lac, linhas: aba.linhas.length, itens, autoN, faltaN, porStatus, semNumero,
        primeira: comp.length ? comp[0].numero : null, ultima: comp.length ? comp.at(-1).numero : null });
    });
    return res;
  }
  /* aplica as regras nas fichas já existentes (botão "Preencher automaticamente") */
  function completarExistentes(fichas) {
    const ctx = contexto(fichas), mud = [];
    fichas.forEach(f => {
      if (f.lacuna || f.exemplo) return;
      const antes = (f.auto || []).length, g = completar(f, ctx);
      if ((g.auto || []).length > antes || g.status !== f.status) mud.push(g);
    });
    return mud;
  }

  /* lê só as abas de mapa (a planilha pode ter abas enormes de rascunho) */
  function lerArquivo(buf) {
    const X = window.XLSX, nomes = X.read(buf, { type: "array", bookSheets: true }).SheetNames;
    const alvo = nomes.filter(n => /MAPA|FP-?11|FLOTA|ESPESS|RECLEAN/i.test(semAc(n)));
    return X.read(buf, { type: "array", cellDates: true, sheets: alvo.length ? alvo : nomes });
  }
  window.NXIMP = { lerArquivo, processar, completar, completarExistentes, contexto, faltantes, ROT, norm: { status, fornecimento, fornecedor, cert, local, conf, qtd, data } };
})();
