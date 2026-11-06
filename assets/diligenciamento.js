/* Recebimento AMR — Ponto 2: consulta à planilha "Angélica – Diligenciamento" no SharePoint.
   Fluxo: login Microsoft (MSAL) → localiza o arquivo pelo caminho fixo (ou o mais recente da pasta)
   → confere a versão (eTag) a cada consulta → só baixa de novo se o arquivo mudou → lê com SheetJS → busca.
   Enquanto a TI não liberar o acesso, é possível testar carregando uma cópia do arquivo no aparelho. */
(function () {
  const CFG = {
    /* Preenchidos com o retorno da TI (client ID e tenant ID). Vazios = integração ainda não liberada. */
    clientId: "",
    tenantId: "",
    host: "milplanengenharia.sharepoint.com",
    site: "/sites/ObraM.447",
    biblioteca: "Suprimentos",
    /* Pasta atual da planilha (link enviado em 05/11/2026). A antiga fica como reserva. */
    pastas: ["RELATORIO DILIGENCIAMENTO", "01_Base Diligenciamento"],
    /* O nome muda a cada exportação (ex.: relatorio_diligenciamento_05_11.xlsx): usa sempre o mais recente da pasta */
    padraoArquivo: /^relatorio[_ ]?diligenciamento.*\.xlsx?$/i,
    escopos: ["User.Read", "Files.Read.All", "Sites.Read.All"]
  };

  const norm = s => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
  const nfNum = s => String(s ?? "").replace(/\D/g, "").replace(/^0+/, "");
  const num = v => typeof v === "number" ? v : (v === "" || v == null ? "" : Number(String(v).replace(/\./g, "").replace(",", ".")) || 0);

  /* Colunas usadas (pelo nome do cabeçalho; a ordem pode mudar sem quebrar) */
  const COLS = {
    pc: "PEDIDO COMPRAS", itemPc: "ITEM PEDIDO COMPRAS", codForn: "FORNECEDOR", nomeForn: "NOME FORNECEDOR",
    un: "UN", qtd: "QTDE.", codigo: "CODIGO PRODUTO", descricao: "DESCRICAO DO MATERIAL", descComp: "DESCRICAO COMPLEMENTAR",
    obs: "OBSERVACOES", qtdPend: "QTDE. PENDENTE", status: "STATUS", nf: "Nº NF", qtdReceb: "QTDE. RECEB (PRENOTA)",
    dataPrenota: "DATA EMISSAO (PRENOTA)", solicitante: "SOLICITANTE", rm: "Nº RM", comprador: "COMPRADOR"
  };

  /* Família pelo prefixo do código do produto */
  function familia(codigo) {
    const p = String(codigo || "").slice(0, 2).toUpperCase();
    if (p === "MT") return { id: "material", rotulo: "Material de obra", certificado: true, recebe: true };
    if (/^SV0120/i.test(String(codigo || ""))) return { id: "concreto", rotulo: "Concreto usinado", certificado: true, recebe: true };
    if (p === "SV" || p === "IN") return { id: "servico", rotulo: p === "SV" ? "Serviço" : "Indenização", certificado: false, recebe: false };
    if (p === "ES") return { id: "epi", rotulo: "EPI / sinalização", certificado: false, recebe: true };
    return { id: "outros", rotulo: "Escritório / equipamentos", certificado: false, recebe: true };
  }

  /* ---------- Leitura da planilha ---------- */
  function indexar(arrayBuffer) {
    if (!window.XLSX) throw new Error("Leitor de planilha não carregou.");
    const wb = XLSX.read(arrayBuffer, { type: "array", dense: true, cellDates: true });
    const nomeAba = wb.SheetNames.find(n => /DILIGENCI/i.test(n)) || wb.SheetNames[0];
    const linhas = XLSX.utils.sheet_to_json(wb.Sheets[nomeAba], { header: 1, raw: true, defval: "" });
    let h = -1;
    for (let i = 0; i < Math.min(15, linhas.length); i++) { const r = linhas[i].map(norm); if (r.includes("PEDIDO COMPRAS") && r.some(c => c === "Nº NF" || c === "N° NF" || c === "NO NF")) { h = i; break; } }
    if (h < 0) throw new Error("Não encontrei o cabeçalho da planilha (colunas PEDIDO COMPRAS e Nº NF).");
    const cab = linhas[h].map(norm);
    const pos = {};
    for (const [k, nome] of Object.entries(COLS)) {
      let i = cab.indexOf(norm(nome));
      if (i < 0 && k === "nf") i = cab.findIndex(c => /^N.? NF$/.test(c));
      pos[k] = i;
    }
    const faltando = ["pc", "itemPc", "nomeForn", "qtd", "codigo", "descricao", "nf", "status"].filter(k => pos[k] < 0);
    if (faltando.length) throw new Error("Colunas não encontradas: " + faltando.map(k => COLS[k]).join(", "));
    const vistos = new Set(), registros = [];
    for (let i = h + 1; i < linhas.length; i++) {
      const r = linhas[i], g = k => pos[k] >= 0 ? r[pos[k]] : "";
      if (!g("pc") && !g("codigo")) continue;
      const reg = {
        pc: String(g("pc")).trim(), itemPc: String(g("itemPc")).trim(), codForn: String(g("codForn")).trim(), nomeForn: String(g("nomeForn")).trim(),
        un: String(g("un")).trim(), qtd: num(g("qtd")), codigo: String(g("codigo")).trim(), descricao: String(g("descricao")).trim(),
        descComp: String(g("descComp")).trim(), obs: String(g("obs")).trim(), qtdPend: num(g("qtdPend")), status: String(g("status")).trim(),
        nf: nfNum(g("nf")), qtdReceb: num(g("qtdReceb")), dataPrenota: g("dataPrenota") instanceof Date ? g("dataPrenota").toISOString().slice(0, 10) : String(g("dataPrenota") || ""),
        solicitante: String(g("solicitante") || "").trim(), rm: String(g("rm") || "").trim()
      };
      const k = reg.pc + "|" + reg.itemPc + "|" + reg.nf;
      if (vistos.has(k)) continue;
      vistos.add(k);
      reg.familia = familia(reg.codigo);
      reg.critico = window.AMR && window.AMR.materialCritico ? window.AMR.materialCritico(reg.descricao + " - " + reg.descComp, reg.codigo) : null;
      reg.pedeCertificado = window.AMR && window.AMR.materialCritico ? !!reg.critico : reg.familia.certificado;
      reg.pedidoPedeCertificado = /CERTIFICAD/i.test(reg.obs + " " + reg.descComp);
      registros.push(reg);
    }
    return { aba: nomeAba, registros };
  }

  /* ---------- Fonte: SharePoint (Microsoft Graph) ou cópia local ---------- */
  let msal = null, conta = null, fonte = null; /* fonte = {tipo, nome, modificado, eTag, registros} */
  const configurado = () => !!(CFG.clientId && CFG.tenantId);

  async function iniciarMsal() {
    if (msal) return msal;
    if (!window.msal) throw new Error("O login Microsoft não carregou. Verifique a internet.");
    msal = new window.msal.PublicClientApplication({
      auth: { clientId: CFG.clientId, authority: "https://login.microsoftonline.com/" + CFG.tenantId, redirectUri: location.origin + location.pathname },
      cache: { cacheLocation: "localStorage" }
    });
    await msal.initialize();
    const r = await msal.handleRedirectPromise().catch(() => null);
    conta = r?.account || msal.getAllAccounts()[0] || null;
    return msal;
  }
  async function token() {
    await iniciarMsal();
    const pedido = { scopes: CFG.escopos, account: conta };
    if (conta) { try { return (await msal.acquireTokenSilent(pedido)).accessToken; } catch (e) { } }
    try { const r = await msal.loginPopup({ scopes: CFG.escopos, prompt: "select_account" }); conta = r.account; return r.accessToken; }
    catch (e) { if (/popup/i.test(String(e && e.errorCode || e))) { await msal.loginRedirect({ scopes: CFG.escopos }); } throw e; }
  }
  async function graph(caminho, opcoes) {
    const t = await token();
    const r = await fetch("https://graph.microsoft.com/v1.0" + caminho, { ...(opcoes || {}), headers: { Authorization: "Bearer " + t } });
    if (!r.ok) { const e = new Error("Graph " + r.status); e.status = r.status; throw e; }
    return r;
  }
  let alvo = null; /* {driveId, itemId} */
  async function localizarArquivo() {
    if (!localizarArquivo.drive) {
      const site = await (await graph(`/sites/${CFG.host}:${CFG.site}?$select=id`)).json();
      const drives = (await (await graph(`/sites/${site.id}/drives?$select=id,name,webUrl`)).json()).value;
      localizarArquivo.drive = drives.find(d => norm(d.name) === norm(CFG.biblioteca) || decodeURIComponent(d.webUrl || "").endsWith("/" + CFG.biblioteca)) || drives[0];
    }
    const drive = localizarArquivo.drive;
    const enc = s => s.split("/").map(encodeURIComponent).join("/");
    let aviso = "";
    /* Lista a pasta e pega a planilha modificada por último (nome com data muda a cada dia) */
    for (const pasta of CFG.pastas) {
      let lista = [];
      try { lista = (await (await graph(`/drives/${drive.id}/root:/${enc(pasta)}:/children?$select=id,name,lastModifiedDateTime,file&$top=200`)).json()).value; }
      catch (e) { if (e.status !== 404) throw e; continue; }
      const xlsx = lista.filter(x => x.file && /\.xlsx?$/i.test(x.name) && !/^~\$/.test(x.name));
      const preferidos = xlsx.filter(x => CFG.padraoArquivo.test(x.name));
      const escolha = (preferidos.length ? preferidos : xlsx).sort((a, b) => b.lastModifiedDateTime.localeCompare(a.lastModifiedDateTime))[0];
      if (escolha) {
        alvo = { driveId: drive.id, itemId: escolha.id };
        if (pasta !== CFG.pastas[0]) aviso = `Planilha encontrada na pasta antiga (${pasta}).`;
        return aviso;
      }
    }
    throw new Error("Planilha de Diligenciamento não encontrada na pasta " + CFG.pastas[0] + ".");
  }
  /* Sempre confere a versão atual; só baixa de novo se o arquivo mudou */
  async function atualizarDoSharePoint() {
    const aviso = await localizarArquivo();
    let meta;
    try { meta = await (await graph(`/drives/${alvo.driveId}/items/${alvo.itemId}?$select=id,name,eTag,lastModifiedDateTime,size`)).json(); }
    catch (e) { throw e; }
    if (fonte && fonte.tipo === "sharepoint" && fonte.eTag === meta.eTag) return { ...fonte, aviso, recarregada: false };
    const buf = await (await graph(`/drives/${alvo.driveId}/items/${alvo.itemId}/content`)).arrayBuffer();
    const idx = indexar(buf);
    fonte = { tipo: "sharepoint", nome: meta.name, modificado: meta.lastModifiedDateTime, eTag: meta.eTag, ...idx };
    return { ...fonte, aviso, recarregada: true };
  }
  async function carregarArquivoLocal(file, tipo) {
    const idx = indexar(await file.arrayBuffer());
    fonte = { tipo: tipo || "local", nome: file.name, modificado: file.lastModified ? new Date(file.lastModified).toISOString() : "", ...idx };
    return fonte;
  }

  /* ---------- Ponte pelo PC do escritório: pasta sincronizada pelo OneDrive ----------
     O navegador (Chrome/Edge no computador) guarda o acesso à pasta e confere de tempos em tempos
     se apareceu uma planilha mais nova. Nada é lido sem a pessoa escolher a pasta. */
  const IDB = { db: null,
    abrir() { return this.db || (this.db = new Promise((ok, err) => { const r = indexedDB.open("amr_dilig", 1); r.onupgradeneeded = () => r.result.createObjectStore("kv"); r.onsuccess = () => ok(r.result); r.onerror = () => err(r.error); })); },
    async get(k) { const db = await this.abrir(); return new Promise(ok => { const t = db.transaction("kv").objectStore("kv").get(k); t.onsuccess = () => ok(t.result); t.onerror = () => ok(undefined); }); },
    async set(k, v) { const db = await this.abrir(); return new Promise(ok => { try { const t = db.transaction("kv", "readwrite"); t.objectStore("kv").put(v, k); t.oncomplete = () => ok(); t.onerror = () => ok(); } catch (e) { ok(); } }); },
    async del(k) { const db = await this.abrir(); return new Promise(ok => { const t = db.transaction("kv", "readwrite"); t.objectStore("kv").delete(k); t.oncomplete = () => ok(); }); }
  };
  const pastaSuportada = () => typeof window.showDirectoryPicker === "function";
  let pasta = null, ultimaVerif = null, timer = null, ouvintesPasta = new Set();
  function avisarPasta(ev) { ouvintesPasta.forEach(fn => { try { fn(ev); } catch (e) { } }); }
  async function arquivoMaisRecente(dir) {
    let melhor = null;
    for await (const h of dir.values()) {
      if (h.kind !== "file" || !/\.xlsx?$/i.test(h.name) || /^~\$/.test(h.name)) continue;
      const f = await h.getFile();
      const pref = CFG.padraoArquivo.test(h.name) ? 1 : 0;
      if (!melhor || pref > melhor.pref || (pref === melhor.pref && f.lastModified > melhor.f.lastModified)) melhor = { f, pref };
    }
    return melhor && melhor.f;
  }
  async function verificarPasta(forcar) {
    if (!pasta) return null;
    const f = await arquivoMaisRecente(pasta);
    ultimaVerif = new Date().toISOString();
    if (!f) { avisarPasta({ tipo: "vazia" }); return null; }
    const mudou = forcar || !fonte || fonte.tipo !== "pasta" || fonte.nome !== f.name || +new Date(fonte.modificado) !== f.lastModified;
    if (mudou) { avisarPasta({ tipo: "lendo", nome: f.name }); await carregarArquivoLocal(f, "pasta"); avisarPasta({ tipo: "atualizada" }); }
    else avisarPasta({ tipo: "sem_mudanca" });
    return mudou;
  }
  function vigiar() { clearInterval(timer); timer = setInterval(() => verificarPasta().catch(e => avisarPasta({ tipo: "erro", erro: e })), 3 * 60 * 1000);
    window.addEventListener("focus", () => verificarPasta().catch(() => { })); }
  const pastaApi = {
    suportada: pastaSuportada,
    ouvir(fn) { ouvintesPasta.add(fn); return () => ouvintesPasta.delete(fn); },
    async conectar() {
      const dir = await window.showDirectoryPicker({ id: "amr-dilig", mode: "read" });
      pasta = dir; await IDB.set("pasta", dir); vigiar();
      return verificarPasta(true);
    },
    /* Ao abrir o app: devolve "ativa", "precisa_permissao" ou "nenhuma" */
    async retomar() {
      if (!pastaSuportada()) return "nenhuma";
      const dir = await IDB.get("pasta").catch(() => null);
      if (!dir) return "nenhuma";
      pasta = dir;
      const p = await dir.queryPermission({ mode: "read" }).catch(() => "denied");
      if (p === "granted") { vigiar(); await verificarPasta(true); return "ativa"; }
      return "precisa_permissao";
    },
    async reativar() { if (!pasta) return false; const p = await pasta.requestPermission({ mode: "read" }); if (p !== "granted") return false; vigiar(); await verificarPasta(true); return true; },
    async desconectar() { clearInterval(timer); pasta = null; await IDB.del("pasta"); },
    nome: () => pasta ? pasta.name : "",
    ultimaVerificacao: () => ultimaVerif,
    verificarAgora: () => verificarPasta(false)
  };
  async function obterFonte() {
    if (configurado()) return atualizarDoSharePoint();
    if (fonte) return fonte;
    const e = new Error("A consulta automática ao SharePoint aguarda a liberação da TI. Para testar, carregue uma cópia da planilha.");
    e.code = "nao_configurado"; throw e;
  }

  /* ---------- Busca ---------- */
  const palavras = s => new Set(norm(s).replace(/[^A-Z0-9 ]/g, " ").split(" ").filter(w => w.length > 2 && !["LTDA", "EIRELI", "COMERCIO", "INDUSTRIA", "SERVICOS", "DE", "DA", "DO", "E", "ME", "EPP", "S/A"].includes(w)));
  function parecido(a, b) { const A = palavras(a), B = palavras(b); if (!A.size || !B.size) return 0; let c = 0; A.forEach(w => { if (B.has(w)) c++; }); return c / Math.min(A.size, B.size); }

  /* busca({nf, fornecedor (nome), codFornecedor}) */
  async function buscar(q) {
    const f = await obterFonte();
    const n = nfNum(q.nf);
    const doc = { fonte: { tipo: f.tipo, nome: f.nome, modificado: f.modificado, aviso: f.aviso || "", total: f.registros.length } };
    if (!n) return { ...doc, situacao: "sem_nf", itens: [] };
    let achados = f.registros.filter(r => r.nf === n);
    const porForn = {};
    achados.forEach(r => { (porForn[r.codForn || r.nomeForn] = porForn[r.codForn || r.nomeForn] || { codForn: r.codForn, nomeForn: r.nomeForn, itens: [] }).itens.push(r); });
    let grupos = Object.values(porForn);
    if (grupos.length > 1) {
      if (q.codFornecedor) grupos = grupos.filter(g => g.codForn === String(q.codFornecedor));
      else if (q.fornecedor) { const s = grupos.map(g => ({ g, p: parecido(g.nomeForn, q.fornecedor) })).sort((a, b) => b.p - a.p); if (s[0].p >= 0.5 && (s.length < 2 || s[1].p < s[0].p)) grupos = [s[0].g]; }
    }
    if (grupos.length === 1) return { ...doc, situacao: "encontrada", fornecedor: { codForn: grupos[0].codForn, nomeForn: grupos[0].nomeForn }, itens: ordenar(grupos[0].itens) };
    if (grupos.length > 1) return { ...doc, situacao: "varios_fornecedores", opcoes: grupos.map(g => ({ codForn: g.codForn, nomeForn: g.nomeForn, qtdItens: g.itens.length })), itens: [] };
    /* NF ainda não lançada (sem pré-nota): mostra o que está pendente de entrega para o fornecedor */
    const pend = pendentesFornecedor(f, q);
    return { ...doc, situacao: pend.itens.length ? "pendentes_fornecedor" : (pend.opcoes ? "pendentes_escolher" : "nao_encontrada"), fornecedor: pend.fornecedor, opcoes: pend.opcoes, itens: pend.itens };
  }
  function pendentesFornecedor(f, q) {
    const pend = f.registros.filter(r => /PENDENTE|PARCIAL|NAO INICIADO/i.test(norm(r.status)) && r.familia.recebe);
    let fs = {};
    pend.forEach(r => { (fs[r.codForn] = fs[r.codForn] || { codForn: r.codForn, nomeForn: r.nomeForn, itens: [] }).itens.push(r); });
    let lista = Object.values(fs);
    if (q.codFornecedor) lista = lista.filter(g => g.codForn === String(q.codFornecedor));
    else if (q.fornecedor) lista = lista.map(g => ({ g, p: parecido(g.nomeForn, q.fornecedor) })).filter(x => x.p >= 0.5).sort((a, b) => b.p - a.p).map(x => x.g);
    else lista = [];
    if (lista.length === 1) return { fornecedor: { codForn: lista[0].codForn, nomeForn: lista[0].nomeForn }, itens: ordenar(lista[0].itens) };
    if (lista.length > 1) return { opcoes: lista.slice(0, 8).map(g => ({ codForn: g.codForn, nomeForn: g.nomeForn, qtdItens: g.itens.length })), itens: [] };
    return { itens: [] };
  }
  async function pendentesDoFornecedor(codForn) { const f = await obterFonte(); return ordenar(f.registros.filter(r => r.codForn === codForn && /PENDENTE|PARCIAL|NAO INICIADO/i.test(norm(r.status)) && r.familia.recebe)); }
  async function itensNFFornecedor(nf, codForn) { const f = await obterFonte(); return ordenar(f.registros.filter(r => r.nf === nfNum(nf) && r.codForn === codForn)); }
  const ordenar = l => l.slice().sort((a, b) => (a.pc + a.itemPc).localeCompare(b.pc + b.itemPc));

  window.DILIG = { pasta: pastaApi, CFG, configurado, buscar, carregarArquivoLocal, pendentesDoFornecedor, itensNFFornecedor, familia, indexar,
    fonteAtual: () => fonte ? { tipo: fonte.tipo, nome: fonte.nome, modificado: fonte.modificado, total: fonte.registros.length } : null,
    contaAtual: () => conta ? (conta.name || conta.username) : "", iniciarMsal: () => configurado() ? iniciarMsal() : Promise.resolve(null) };
})();
