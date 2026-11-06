/* Ficha de Inspeção e Recebimento de Materiais — 447.OPE.FP-01 Rev.02, gerada em PDF (A4 paisagem).
   Reproduz o layout da planilha modelo: cabeçalho com logos, dados do contrato, 15 itens por folha,
   observação, legenda e as três assinaturas. Mais de 15 itens gera folhas adicionais (FOLHA 1/2, 2/2…). */
(function () {
  const ITENS_POR_FOLHA = 15;
  const W = 297, H = 210, M = 8;               /* página e margem (mm) */
  const CW = W - 2 * M;                        /* largura útil */
  /* Colunas na mesma proporção da planilha (B..Q, com C:E e O:P mescladas) */
  const COLS = [
    ["ITEM", 5.1, "c"], ["DESCRIÇÃO", 94, "l"], ["TAG", 16.6, "c"], ["NOTA FISCAL", 13.3, "c"], ["ROMANEIO", 11.7, "c"],
    ["CERTIFICADO", 13.6, "c"], ["UND", 9.4, "c"], ["QTD.\nRECEBIDA", 11.7, "c"], ["DATA\nRECEBIMENTO", 14.3, "c"],
    ["FORNECIMENTO", 16.7, "c"], ["FORNECEDOR", 18.6, "c"], ["LOCALIZAÇÃO/\nARMAZENAMENTO", 31.8, "c"], ["STATUS", 13.9, "c"]
  ];
  const soma = COLS.reduce((s, c) => s + c[1], 0);
  const LARG = COLS.map(c => c[1] * CW / soma);
  /* Larguras das colunas B..Q da planilha, para reproduzir as células mescladas do cabeçalho */
  const XL = { B: 5.1, C: 12.4, D: 43.6, E: 38, F: 16.6, G: 13.3, H: 11.7, I: 13.6, J: 9.4, K: 11.7, L: 14.3, M: 16.7, N: 18.6, O: 14.7, P: 17.1, Q: 13.9 };
  const LET = Object.keys(XL), XLS = LET.reduce((s, k) => s + XL[k], 0);
  const xDe = c => M + LET.slice(0, LET.indexOf(c)).reduce((s, k) => s + XL[k], 0) * CW / XLS;
  const span = (a, b) => [xDe(a), LET.slice(LET.indexOf(a), LET.indexOf(b) + 1).reduce((s, k) => s + XL[k], 0) * CW / XLS];

  function caber(doc, txt, w, hMax, fs, fsMin, negrito) {
    doc.setFont("helvetica", negrito ? "bold" : "normal");
    const palavras = String(txt ?? "").split(/\s+/).filter(Boolean);
    for (let f = fs; f >= fsMin; f -= 0.25) {
      doc.setFontSize(f);
      if (f - 0.25 >= fsMin && palavras.some(p => doc.getTextWidth(p) > w)) continue;
      const linhas = doc.splitTextToSize(String(txt ?? ""), w);
      const alt = linhas.length * f * 0.3528 * 1.15;
      if (alt <= hMax || f - 0.25 < fsMin) return { linhas: alt <= hMax ? linhas : linhas.slice(0, Math.max(1, Math.floor(hMax / (f * 0.3528 * 1.15)))), f };
    }
  }
  function texto(doc, txt, x, y, w, h, opt) {
    opt = opt || {};
    const pad = opt.pad ?? 1.2;
    const r = caber(doc, txt, w - 2 * pad, h - 2 * pad * 0.6, opt.fs || 7, opt.fsMin || 4.5, opt.b);
    if (!r) return;
    const lh = r.f * 0.3528 * 1.15;
    const total = r.linhas.length * lh;
    let ty = opt.top ? y + pad + r.f * 0.3528 : y + (h - total) / 2 + r.f * 0.3528 * 0.85;
    r.linhas.forEach((l, i) => {
      const al = opt.al || "l";
      const tx = al === "c" ? x + w / 2 : al === "r" ? x + w - pad : x + pad;
      doc.text(l, tx, ty + i * lh, { align: al === "c" ? "center" : al === "r" ? "right" : "left" });
    });
  }
  const caixa = (doc, x, y, w, h, fill) => { if (fill) { doc.setFillColor(fill); doc.rect(x, y, w, h, "FD"); } else doc.rect(x, y, w, h); };

  function linhasDaFicha(A, f) {
    const its = A.itensValidos(f);
    return its.map((i, n) => {
      const cert = A.textoCert(f, i);
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
    texto(doc, "FICHA DE INSPEÇÃO E RECEBIMENTO DE MATERIAIS", xT, y, wT, hCab, { al: "c", fs: 16, b: true });
    y += hCab;
    /* Linhas 5-7: B:D | E:M | N:Q  e  Escopo B:L | Projeto M:O | Folha P:Q */
    const r1 = 6, r2 = 7, r3 = 6.5;
    const [xA, wA] = span("B", "D"), [xB, wB] = span("E", "M"), [xC, wC] = span("N", "Q");
    caixa(doc, xA, y, wA, r1); caixa(doc, xB, y, wB, r1); caixa(doc, xC, y, wC, r1);
    texto(doc, "CONTRATO Nº: " + (cfg.ctr ? cfg.ctr.numero || "" : A.CONTRATO), xA, y, wA, r1, { fs: 8, b: true });
    texto(doc, "CÓDIGO DO DOCUMENTO", xB, y, wB, r1, { fs: 8, b: true, al: "c" });
    texto(doc, "FICHA Nº: " + f.numero, xC, y, wC, r1, { fs: 8.5, b: true });
    y += r1;
    caixa(doc, xA, y, wA, r2); caixa(doc, xB, y, wB, r2); caixa(doc, xC, y, wC, r2);
    texto(doc, "OBRA: " + (cfg.ctr ? cfg.ctr.obra : A.OBRA), xA, y, wA, r2, { fs: 7, b: true });
    texto(doc, A.DOC_FICHA, xB, y, wB, r2, { fs: 8.5, b: true, al: "c" });
    texto(doc, "RESPONSÁVEL POR ESTE DOCUMENTO: " + (cfg.responsavel || ""), xC, y, wC, r2, { fs: 7, b: true });
    y += r2;
    const [xE, wE] = span("B", "L"), [xP, wP] = span("M", "O"), [xF, wF] = span("P", "Q");
    caixa(doc, xE, y, wE, r3); caixa(doc, xP, y, wP, r3); caixa(doc, xF, y, wF, r3);
    texto(doc, "Escopo: " + (cfg.ctr ? cfg.ctr.escopo : A.ESCOPO), xE, y, wE, r3, { fs: 7, b: true });
    texto(doc, "Projeto N° Cliente: " + (cfg.projetoCliente || ""), xP, y, wP, r3, { fs: 7, b: true });
    texto(doc, `FOLHA: ${nFolha}/${totFolhas}`, xF, y, wF, r3, { fs: 7.5, b: true });
    y += r3;
    /* Tabela */
    const hTit = 8, hLin = 7.0;
    let x = M;
    COLS.forEach((c, i) => { caixa(doc, x, y, LARG[i], hTit, "#d9d9d9"); texto(doc, c[0], x, y, LARG[i], hTit, { fs: 6.3, fsMin: 4, b: true, al: "c", pad: 0.5 }); x += LARG[i]; });
    y += hTit;
    for (let r = 0; r < ITENS_POR_FOLHA; r++) {
      const lin = linhas[r];
      x = M;
      COLS.forEach((c, i) => {
        caixa(doc, x, y, LARG[i], hLin);
        if (i === 0) texto(doc, String((nFolha - 1) * ITENS_POR_FOLHA + r + 1), x, y, LARG[i], hLin, { fs: 7, al: "c", pad: 0.4 });
        else if (lin) {
          const v = lin[i];
          const destaque = (i === 5 && /^PENDENTE/.test(v)) || (i === 12 && v === "NC");
          if (destaque) doc.setTextColor(178, 58, 46);
          texto(doc, v, x, y, LARG[i], hLin, { fs: i === 1 ? 6.8 : 6.3, fsMin: 4.2, al: c[2], pad: i === 1 ? 1.2 : 0.6, b: i === 0 || destaque });
          if (destaque) doc.setTextColor(0);
        }
        x += LARG[i];
      });
      y += hLin;
    }
    /* Observação */
    const hObs = 15;
    caixa(doc, M, y, CW, hObs);
    doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.text("Observação:", M + 1.2, y + 3.4);
    if (nFolha === 1 || totFolhas > 1) texto(doc, observacao(A, f), M, y + 3.2, CW, hObs - 3.2, { fs: 6.8, fsMin: 4.5, top: true });
    y += hObs;
    /* Legenda */
    const hLeg = 5.5;
    caixa(doc, M, y, CW, hLeg);
    texto(doc, "LEGENDA:  C = CONFORME          NC = NÃO CONFORME          N/A = NÃO SE APLICA", M, y, CW, hLeg, { fs: 7.5, b: true });
    y += hLeg;
    /* Assinaturas */
    const hAssT = 5, hAss = H - M - y - hAssT;
    const SP = [span("B", "E"), span("F", "L"), span("M", "Q")], wS = SP.map(z => z[1]);
    const nomes = [["producao", "PRODUÇÃO MILPLAN"], ["qualidade", "QUALIDADE MILPLAN"], ["fiscalizacao", "FISCALIZAÇÃO ANGLO"]];
    x = M;
    nomes.forEach(([k, t], i) => {
      caixa(doc, x, y, wS[i], hAssT); texto(doc, t, x, y, wS[i], hAssT, { fs: 7.5, b: true, al: "c" });
      caixa(doc, x, y + hAssT, wS[i], hAss);
      const d = f.assinaturas && f.assinaturas[k] && f.assinaturas[k].em ? A.fmtData(f.assinaturas[k].em) : "";
      doc.setFont("helvetica", "bold"); doc.setFontSize(7.5); doc.text("Data: " + d, x + 1.5, y + hAssT + hAss - 2);
      x += wS[i];
    });
    /* Rodapé discreto: rastreabilidade */
    doc.setFont("helvetica", "normal"); doc.setFontSize(5.5); doc.setTextColor(120);
    doc.text(`Gerado pelo Nexum em ${new Date().toLocaleString("pt-BR")}${f.chaveNFe ? " · Chave NF-e " + f.chaveNFe : ""}`, M, H - 2.5);
    doc.setTextColor(0);
  }

  function gerar(A, f, cfg, docExistente) {
    if (!window.jspdf) throw new Error("O gerador de PDF não carregou. Verifique a internet e recarregue a página.");
    const doc = docExistente || new window.jspdf.jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    if (docExistente) doc.addPage("a4", "landscape");
    const linhas = linhasDaFicha(A, f);
    const tot = Math.max(1, Math.ceil(linhas.length / ITENS_POR_FOLHA));
    for (let p = 0; p < tot; p++) {
      if (p) doc.addPage("a4", "landscape");
      folha(doc, A, f, linhas.slice(p * ITENS_POR_FOLHA, (p + 1) * ITENS_POR_FOLHA), p + 1, tot, cfg || {});
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
