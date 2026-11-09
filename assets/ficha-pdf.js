/* Ficha de Inspeção e Recebimento de Materiais — 447.OPE.FP-01 Rev.02, gerada em PDF (A4 paisagem).
   Reproduz o layout da planilha modelo: cabeçalho com logos, dados do contrato, 15 itens por folha,
   observação, legenda e as três assinaturas. Mais de 15 itens gera folhas adicionais (FOLHA 1/2, 2/2…). */
(function () {
  const ITENS_POR_FOLHA = 15;
  const W = 297, H = 210, M = 8;               /* página e margem (mm) */
  const CW = W - 2 * M;                        /* largura útil */
  /* Colunas na mesma proporção da planilha (B..Q, com C:E e O:P mescladas) */
  const COLS = [
    ["ITEM", 6.6, "c"], ["DESCRIÇÃO", 84, "l"], ["TAG", 16.6, "c"], ["NOTA FISCAL", 13.3, "c"], ["ROMANEIO", 13.6, "c"],
    ["CERTIFICADO", 15.6, "c"], ["UND", 8.4, "c"], ["QTD.\nRECEBIDA", 12.4, "c"], ["DATA\nRECEBIMENTO", 15.6, "c"],
    ["FORNECIMENTO", 18.4, "c"], ["FORNECEDOR", 18.6, "c"], ["LOCALIZAÇÃO/\nARMAZENAMENTO", 28.6, "c"], ["STATUS", 12.6, "c"]
  ];
  const soma = COLS.reduce((s, c) => s + c[1], 0);
  const LARG = COLS.map(c => c[1] * CW / soma);
  /* Larguras das colunas B..Q da planilha, para reproduzir as células mescladas do cabeçalho */
  const XL = { B: 5.1, C: 12.4, D: 43.6, E: 38, F: 16.6, G: 13.3, H: 11.7, I: 13.6, J: 9.4, K: 11.7, L: 14.3, M: 16.7, N: 18.6, O: 14.7, P: 17.1, Q: 13.9 };
  const LET = Object.keys(XL), XLS = LET.reduce((s, k) => s + XL[k], 0);
  const xDe = c => M + LET.slice(0, LET.indexOf(c)).reduce((s, k) => s + XL[k], 0) * CW / XLS;
  const span = (a, b) => [xDe(a), LET.slice(LET.indexOf(a), LET.indexOf(b) + 1).reduce((s, k) => s + XL[k], 0) * CW / XLS];

  /* Tipografia padronizada: Helvetica, tamanhos fixos por tipo de campo (sem encolher célula a célula),
     altura de linha única e alinhamento vertical pela altura das maiúsculas. */
  const PT = 0.3528, LH = 1.2, CAP = 0.72;
  const FS = { titulo: 15, campo: 7, codigo: 8.5, th: 6.2, obs: 7, legenda: 7.5, ass: 7.5 };
  function quebrar(doc, txt, w, fs, b) {
    doc.setFont("helvetica", b ? "bold" : "normal"); doc.setFontSize(fs);
    /* palavra mais larga que a coluna (ex.: 4166-REV-00) quebra no hífen, nunca no meio */
    return String(txt ?? "").split("\n").flatMap(p => {
      const pp = p.split(" ").map(t => doc.getTextWidth(t) > w && t.includes("-") ? t.replace(/-/g, "-\u0001 ") : t).join(" ");
      return doc.splitTextToSize(pp, w).map(l => l.replace(/\u0001 ?/g, "").trim());
    });
  }
  function cabe(doc, txt, w, h, fs, b, pad) { const l = quebrar(doc, txt, w - 2 * pad - 0.6, fs, b); return l.length * fs * PT * LH <= h - 0.9; }
  function texto(doc, txt, x, y, w, h, opt) {
    opt = opt || {};
    const pad = opt.pad ?? 1.2, fs = opt.fs || 7, b = !!opt.b;
    let linhas = quebrar(doc, txt, w - 2 * pad - 0.6, fs, b);
    const lh = fs * PT * LH, max = Math.max(1, Math.floor((h - (opt.top ? 1.2 : 0.9)) / lh));
    if (linhas.length > max) { linhas = linhas.slice(0, max); let u = linhas[max - 1]; while (u && doc.getTextWidth(u + "…") > w - 2 * pad) u = u.slice(0, -1); linhas[max - 1] = u.trimEnd() + "…"; }
    const bloco = (linhas.length - 1) * lh + fs * PT * CAP;
    const y0 = opt.top ? y + 1.2 + fs * PT * CAP : y + (h - bloco) / 2 + fs * PT * CAP;
    const al = opt.al || "l", tx = al === "c" ? x + w / 2 : al === "r" ? x + w - pad : x + pad;
    linhas.forEach((l, i) => doc.text(l, tx, y0 + i * lh, { align: al === "c" ? "center" : al === "r" ? "right" : "left" }));
    return doc.getTextWidth(linhas[linhas.length - 1] || "");
  }
  /* Rótulo + valor; se o valor estiver vazio, anula o espaço depois do rótulo */
  function campo(doc, rotulo, valor, x, y, w, h, fs) {
    const v = String(valor ?? "").trim();
    const lw = texto(doc, rotulo + (v ? " " + v : ""), x, y, w, h, { fs: fs || FS.campo, b: true });
  }
  const caixa = (doc, x, y, w, h, fill) => { if (fill) { doc.setFillColor(fill); doc.rect(x, y, w, h, "FD"); } else doc.rect(x, y, w, h); };

  function linhasDaFicha(A, f) {
    const its = A.itensValidos(f);
    return its.map((i, n) => {
      const cert = /^PENDENTE/i.test(A.textoCert(f, i)) ? "PENDENTE" : A.textoCert(f, i);
      return [String(n + 1), i.descricao, i.tag || "", f.tipo === "ROM" ? "N/A" : (f.nf || ""), f.romaneio || "", cert, i.und || "",
        A.fmtQtd(i.qtd), A.fmtData(f.dataRecebimento), f.fornecimento || "", f.fornecedor || "", i.local || "", i.conf === "NA" ? "N/A" : (i.conf || "")];
    });
  }
  function observacao(A, f) {
    const partes = [];
    if (f.observacao) partes.push(f.observacao);
    if (f.tipo === "NF") {
      const pend = A.itensValidos(f).map((i, n) => (A.exigeCert(f, i) && !A.temCert(i)) ? n + 1 : 0).filter(Boolean);
      if (pend.length) partes.push(`Pendente – Certificado: item(ns) ${pend.join(", ")} recebido(s) sem certificado de qualidade (material crítico conforme CMC). Cobrança enviada ao fornecedor.`);
      const nc = A.itensValidos(f).map((i, n) => i.conf === "NC" ? n + 1 : 0).filter(Boolean);
      if (nc.length) partes.push(`Item(ns) não conforme(s): ${nc.join(", ")}. Emitir RNC, segregar e identificar.`);
    }
    return partes.join("\n");
  }

  function folha(doc, A, f, linhas, nFolha, totFolhas, cfg) {
    const L = window.AMR_LOGOS || {};
    doc.setDrawColor(0); doc.setLineWidth(0.25); doc.setTextColor(0);
    let y = M;
    /* Cabeçalho (linhas 2-4): logo Anglo B:D | título E:N | logo Milplan O:Q */
    const hCab = 22;
    const [xL, wL] = span("B", "D"), [xT, wT] = span("E", "N"), [xR, wR] = span("O", "Q");
    caixa(doc, xL, y, wL, hCab); caixa(doc, xT, y, wT, hCab); caixa(doc, xR, y, wR, hCab);
    if (L.anglo) { const lw = Math.min(wL - 10, 46), lh = lw * 76 / 192; doc.addImage(L.anglo, "PNG", xL + (wL - lw) / 2, y + (hCab - lh) / 2, lw, lh); }
    if (L.milplan) { const lh = hCab - 5, lw = lh * 221 / 172; doc.addImage(L.milplan, "PNG", xR + (wR - lw) / 2, y + 2.5, lw, lh); }
    texto(doc, "FICHA DE INSPEÇÃO E RECEBIMENTO DE MATERIAIS", xT, y, wT, hCab, { al: "c", fs: FS.titulo, b: true });
    y += hCab;
    /* Linhas 5-7: B:D | E:M | N:Q  e  Escopo B:L | Projeto M:O | Folha P:Q */
    const r1 = 6, r2 = 8, r3 = 6.5;
    const [xA, wA] = span("B", "D"), [xB, wB] = span("E", "M"), [xC, wC] = span("N", "Q");
    caixa(doc, xA, y, wA, r1); caixa(doc, xB, y, wB, r1); caixa(doc, xC, y, wC, r1);
    campo(doc, "CONTRATO Nº:", cfg.ctr ? cfg.ctr.numero || "" : A.CONTRATO, xA, y, wA, r1);
    texto(doc, "CÓDIGO DO DOCUMENTO", xB, y, wB, r1, { fs: FS.campo, b: true, al: "c" });
    campo(doc, "FICHA Nº:", f.numero, xC, y, wC, r1);
    y += r1;
    caixa(doc, xA, y, wA, r2); caixa(doc, xB, y, wB, r2); caixa(doc, xC, y, wC, r2);
    campo(doc, "OBRA:", cfg.ctr ? cfg.ctr.obra : A.OBRA, xA, y, wA, r2);
    texto(doc, A.DOC_FICHA, xB, y, wB, r2, { fs: FS.codigo, b: true, al: "c" });
    campo(doc, "RESPONSÁVEL POR ESTE DOCUMENTO:", cfg.responsavel, xC, y, wC, r2, 7);
    y += r2;
    const [xE, wE] = span("B", "L"), [xP, wP] = span("M", "O"), [xF, wF] = span("P", "Q");
    caixa(doc, xE, y, wE, r3); caixa(doc, xP, y, wP, r3); caixa(doc, xF, y, wF, r3);
    campo(doc, "Escopo:", cfg.ctr ? cfg.ctr.escopo : A.ESCOPO, xE, y, wE, r3);
    campo(doc, "Projeto N° Cliente:", cfg.projetoCliente, xP, y, wP, r3);
    texto(doc, `FOLHA: ${nFolha}/${totFolhas}`, xF, y, wF, r3, { fs: FS.campo, b: true });
    y += r3;
    /* Tabela */
    const hTit = 8, hLin = 7.0;
    let x = M;
    /* cabeçalho da tabela: o mesmo tamanho em todas as colunas, sem quebrar palavras no meio */
    const fsTh = [6.2, 5.9, 5.6, 5.3, 5.0].find(fs => { doc.setFont("helvetica", "bold"); doc.setFontSize(fs); return COLS.every((c, i) => c[0].split(/\s+/).every(p => doc.getTextWidth(p) <= LARG[i] - 1.8)); }) || 5.0;
    COLS.forEach((c, i) => { caixa(doc, x, y, LARG[i], hTit, "#d9d9d9"); texto(doc, c[0], x, y, LARG[i], hTit, { fs: fsTh, b: true, al: "c", pad: 0.5 }); x += LARG[i]; });
    y += hTit;
    /* um único tamanho de fonte para todo o corpo da tabela (o maior que faz todas as células caberem) */
    const fsTab = cfg._fsTab || 6.5;
    const pads = COLS.map((c, i) => i === 1 ? 1.2 : 0.7);
    const yVazio = y + linhas.length * hLin;
    for (let r = 0; r < ITENS_POR_FOLHA; r++) {
      const lin = linhas[r];
      x = M;
      COLS.forEach((c, i) => {
        caixa(doc, x, y, LARG[i], hLin);
        if (i === 0) texto(doc, String((nFolha - 1) * ITENS_POR_FOLHA + r + 1), x, y, LARG[i], hLin, { fs: fsTab, al: "c", pad: 0.4 });
        else if (lin) {
          const v = String(lin[i] ?? "").trim();
          if (v) {
            const destaque = (i === 5 && /^PENDENTE/.test(v)) || (i === 12 && v === "NC");
            if (destaque) doc.setTextColor(178, 58, 46);
            texto(doc, v, x, y, LARG[i], hLin, { fs: fsTab, al: c[2], pad: pads[i] });
            if (destaque) doc.setTextColor(0);
          }
        }
        x += LARG[i];
      });
      y += hLin;
    }
    /* linhas sem item: um traço diagonal único anulando todo o espaço em branco da tabela */
    /* linhas sem item: um único traço diagonal, do canto superior esquerdo ao inferior direito do espaço em branco */
    if (linhas.length < ITENS_POR_FOLHA) { doc.setLineWidth(0.3); doc.line(M, yVazio, M + CW, y); doc.setLineWidth(0.25); }
    /* Observação */
    const hObs = 14;
    caixa(doc, M, y, CW, hObs);
    texto(doc, "Observação:", M, y, CW, 5, { fs: FS.campo, b: true, top: true });
    const obs = observacao(A, f);
    if (obs) texto(doc, obs, M, y + 4, CW, hObs - 4, { fs: FS.obs, top: true });

    y += hObs;
    /* Legenda */
    const hLeg = 5.5;
    caixa(doc, M, y, CW, hLeg);
    texto(doc, "LEGENDA:  C = CONFORME          NC = NÃO CONFORME          N/A = NÃO SE APLICA", M, y, CW, hLeg, { fs: FS.legenda, b: true });
    y += hLeg;
    /* Assinaturas */
    const hAssT = 5, hAss = H - M - y - hAssT;
    const SP = [span("B", "E"), span("F", "L"), span("M", "Q")], wS = SP.map(z => z[1]);
    const nomes = [["producao", "PRODUÇÃO MILPLAN"], ["qualidade", "QUALIDADE MILPLAN"], ["fiscalizacao", "FISCALIZAÇÃO ANGLO"]];
    x = M;
    nomes.forEach(([k, t], i) => {
      caixa(doc, x, y, wS[i], hAssT); texto(doc, t, x, y, wS[i], hAssT, { fs: FS.ass, b: true, al: "c" });
      caixa(doc, x, y + hAssT, wS[i], hAss);
      const d = f.assinaturas && f.assinaturas[k] && f.assinaturas[k].em ? A.fmtData(f.assinaturas[k].em) : "";
      doc.setFont("helvetica", "bold"); doc.setFontSize(FS.ass); doc.text("Data: " + d, x + 1.2, y + hAssT + hAss - 2);
      x += wS[i];
    });
    doc.setTextColor(0);
  }

  function gerar(A, f, cfg, docExistente) {
    if (!window.jspdf) throw new Error("O gerador de PDF não carregou. Verifique a internet e recarregue a página.");
    const doc = docExistente || new window.jspdf.jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    if (docExistente) doc.addPage("a4", "landscape");
    const linhas = linhasDaFicha(A, f);
    const tot = Math.max(1, Math.ceil(linhas.length / ITENS_POR_FOLHA));
    cfg = { ...(cfg || {}) };
    const tmp = docExistente || doc;
    cfg._fsTab = [6.5, 6.2, 5.9, 5.6].find(fs => linhas.every(l => l.every((v, i) => i === 0 || !String(v ?? "").trim() || cabe(tmp, String(v).trim(), LARG[i], 7.0, fs, false, i === 1 ? 1.2 : 0.7)))) || 5.6;
    for (let p = 0; p < tot; p++) {
      if (p) doc.addPage("a4", "landscape");
      folha(doc, A, f, linhas.slice(p * ITENS_POR_FOLHA, (p + 1) * ITENS_POR_FOLHA), p + 1, tot, cfg);
    }
    if (!docExistente) doc.setProperties({ title: `Ficha ${f.numero} - ${A.DOC_FICHA}`, subject: "Ficha de Inspeção e Recebimento de Materiais", creator: "Nexum" });
    return doc;
  }
  function nomeArquivo(A, f) {
    const limpo = s => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim();
    const doc = f.tipo === "ROM" ? "Romaneio " + f.romaneio : "NF " + f.nf + " - " + f.fornecedor;
    return limpo(`447.OPE.FP-01 - Ficha ${f.numero} - ${doc}`).slice(0, 150) + ".pdf";
  }
  window.FICHA_PDF = { gerar, nomeArquivo, ITENS_POR_FOLHA };
})();
