/* Ficha de Inspeção e Recebimento de Materiais (447.OPE.FP-01) em Excel.
   Mesmo conteúdo do PDF (assets/ficha-pdf.js): uma aba por ficha, no layout da planilha modelo
   (cabeçalho com logos, dados do contrato, tabela de itens, observação, legenda e assinaturas).
   Uso: FICHA_XLSX.gerar(A, [fichas], cfg, nomeArquivo) */
(function () {
  /* colunas B..Q da planilha modelo (larguras em caracteres do Excel) */
  const LARG = { A: 1.5, B: 6, C: 12.4, D: 30, E: 24, F: 16.6, G: 13.3, H: 12.5, I: 15, J: 7.5, K: 10.5, L: 13, M: 16.7, N: 22, O: 13, P: 13, Q: 11 };
  /* coluna da tabela → células da planilha (DESCRIÇÃO em C:E e LOCALIZAÇÃO em O:P, como no modelo) */
  const TAB = [["ITEM", "B", "B", "c"], ["DESCRIÇÃO", "C", "E", "l"], ["TAG", "F", "F", "c"], ["NOTA FISCAL", "G", "G", "c"], ["ROMANEIO", "H", "H", "c"],
    ["CERTIFICADO", "I", "I", "c"], ["UND", "J", "J", "c"], ["QTD.\nRECEBIDA", "K", "K", "c"], ["DATA\nRECEBIMENTO", "L", "L", "c"],
    ["FORNECIMENTO", "M", "M", "c"], ["FORNECEDOR", "N", "N", "c"], ["LOCALIZAÇÃO/\nARMAZENAMENTO", "O", "P", "c"], ["STATUS", "Q", "Q", "c"]];
  const MIN_LINHAS = 15, FONTE = "Arial", CINZA = "FFD9D9D9", VERMELHO = "FFB23A2E";
  const fino = { style: "thin", color: { argb: "FF000000" } }, BORDA = { top: fino, left: fino, bottom: fino, right: fino };
  const tamImg = src => new Promise(r => { const i = new Image(); i.onload = () => r({ w: i.naturalWidth, h: i.naturalHeight }); i.onerror = () => r(null); i.src = src; });
  const nomeAba = (f, usados) => {
    let base = ("Ficha " + (f.numero || "s-n")).replace(/[\\/?*[\]:]/g, "-").slice(0, 28), n = base, k = 2;
    while (usados.has(n.toLowerCase())) n = base.slice(0, 26) + " " + k++;
    usados.add(n.toLowerCase()); return n;
  };

  function bloco(ws, r1, c1, r2, c2, valor, o) {
    o = o || {};
    if (r1 !== r2 || c1 !== c2) ws.mergeCells(`${c1}${r1}:${c2}${r2}`);
    const cel = ws.getCell(`${c1}${r1}`);
    if (valor !== undefined && valor !== null && valor !== "") cel.value = valor;
    cel.font = { name: FONTE, size: o.fs || 8, bold: !!o.b, color: o.cor ? { argb: o.cor } : undefined };
    cel.alignment = { horizontal: o.al === "c" ? "center" : o.al === "r" ? "right" : "left", vertical: o.top ? "top" : "middle", wrapText: true, indent: o.al === "l" || !o.al ? 0 : undefined };
    if (o.fill) cel.fill = { type: "pattern", pattern: "solid", fgColor: { argb: o.fill } };
    /* borda em todas as células do bloco mesclado */
    const cs = ws.getColumn(c1).number, ce = ws.getColumn(c2).number;
    for (let r = r1; r <= r2; r++) for (let c = cs; c <= ce; c++) ws.getRow(r).getCell(c).border = BORDA;
    return cel;
  }
  /* rótulo em negrito + valor (rich text), como "CONTRATO Nº: 1234" */
  const rotulo = (r, v) => ({ richText: [{ text: r + (String(v ?? "").trim() ? " " : ""), font: { name: FONTE, size: 8, bold: true } }, { text: String(v ?? "").trim(), font: { name: FONTE, size: 8 } }] });

  function aba(wb, A, f, cfg, logos, nome) {
    const ws = wb.addWorksheet(nome, {
      pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, horizontalCentered: true,
        margins: { left: 0.3, right: 0.3, top: 0.3, bottom: 0.3, header: 0.1, footer: 0.1 } },
      views: [{ showGridLines: false }]
    });
    Object.entries(LARG).forEach(([c, w]) => { ws.getColumn(c).width = w; });
    const ctr = cfg.ctr || {};
    /* cabeçalho: logo B:D | título E:N | logo O:Q (linhas 2-4) */
    [2, 3, 4].forEach(r => { ws.getRow(r).height = 20; });
    bloco(ws, 2, "B", 4, "D", "");
    bloco(ws, 2, "E", 4, "N", "FICHA DE INSPEÇÃO E RECEBIMENTO DE MATERIAIS", { al: "c", b: true, fs: 16 });
    bloco(ws, 2, "O", 4, "Q", "");
    if (logos) {
      const px = c => LARG[c] * 7.2;
      const larg = cs => cs.reduce((s, c) => s + px(c), 0);
      const todas = Object.keys(LARG);
      /* posição em colunas fracionadas: anda coluna a coluna até o deslocamento em pixels */
      const pos = (cols, lg) => { let resto = Math.max(0, (larg(cols) - lg.w) / 2), i = todas.indexOf(cols[0]);
        while (resto > px(todas[i]) && i < todas.length - 1) { resto -= px(todas[i]); i++; }
        return { tl: { col: i + resto / px(todas[i]), row: 1 + Math.max(0, (60 - lg.h) / 2) / 20 }, ext: { width: lg.w, height: lg.h } }; };
      if (logos.anglo) ws.addImage(logos.anglo.id, pos(["B", "C", "D"], logos.anglo));
      if (logos.milplan) ws.addImage(logos.milplan.id, pos(["O", "P", "Q"], logos.milplan));
    }
    /* dados do contrato (linhas 5-7) */
    ws.getRow(5).height = 18; ws.getRow(6).height = 26; ws.getRow(7).height = 18;
    bloco(ws, 5, "B", 5, "D", rotulo("CONTRATO Nº:", ctr.numero || A.CONTRATO || ""));
    bloco(ws, 5, "E", 5, "M", "CÓDIGO DO DOCUMENTO", { al: "c", b: true });
    bloco(ws, 5, "N", 5, "Q", rotulo("FICHA Nº:", f.numero || ""));
    bloco(ws, 6, "B", 6, "D", rotulo("OBRA:", ctr.obra || A.OBRA || ""));
    bloco(ws, 6, "E", 6, "M", A.DOC_FICHA || "447.OPE.FP-01", { al: "c", b: true, fs: 10 });
    bloco(ws, 6, "N", 6, "Q", rotulo("RESPONSÁVEL POR ESTE DOCUMENTO:", cfg.responsavel || ""));
    bloco(ws, 7, "B", 7, "L", rotulo("Escopo:", ctr.escopo || A.ESCOPO || ""));
    bloco(ws, 7, "M", 7, "O", rotulo("Projeto N° Cliente:", cfg.projetoCliente || ""));
    bloco(ws, 7, "P", 7, "Q", "FOLHA: 1/1", { b: true });
    /* tabela */
    let r = 8;
    ws.getRow(r).height = 28;
    TAB.forEach(([h, c1, c2]) => bloco(ws, r, c1, r, c2, h, { al: "c", b: true, fs: 7.5, fill: CINZA }));
    const linhas = window.FICHA_PDF.linhas(A, f);
    const total = Math.max(MIN_LINHAS, linhas.length);
    for (let k = 0; k < total; k++) {
      r++;
      const lin = linhas[k];
      const desc = lin ? String(lin[1] || "") : "";
      ws.getRow(r).height = Math.max(18, Math.min(60, Math.ceil(desc.length / 62) * 11 + 7));
      TAB.forEach(([, c1, c2, al], i) => {
        let v = i === 0 ? k + 1 : lin ? String(lin[i] ?? "").trim() : "";
        if (lin && i === 7 && v !== "" && !isNaN(+String(v).replace(/\./g, "").replace(",", "."))) v = +String(v).replace(/\./g, "").replace(",", ".");
        const destaque = lin && ((i === 5 && /^PENDENTE/.test(v)) || (i === 12 && v === "NC"));
        bloco(ws, r, c1, r, c2, i === 0 && !lin ? k + 1 : v, { al, fs: 7.5, cor: destaque ? VERMELHO : undefined, b: destaque });
      });
    }
    /* observação, legenda e assinaturas */
    const obs = window.FICHA_PDF.observacao(A, f);
    r++; ws.getRow(r).height = Math.max(34, Math.ceil(obs.length / 200) * 12 + 22);
    bloco(ws, r, "B", r, "Q", { richText: [{ text: "Observação:" + (obs ? "\n" : ""), font: { name: FONTE, size: 8, bold: true } }, { text: obs, font: { name: FONTE, size: 8 } }] }, { top: true });
    r++; ws.getRow(r).height = 18;
    bloco(ws, r, "B", r, "Q", "LEGENDA:  C = CONFORME          NC = NÃO CONFORME          N/A = NÃO SE APLICA", { b: true });
    r++; ws.getRow(r).height = 16;
    const ass = [["B", "E", "producao", "PRODUÇÃO MILPLAN"], ["F", "L", "qualidade", "QUALIDADE MILPLAN"], ["M", "Q", "fiscalizacao", "FISCALIZAÇÃO ANGLO"]];
    ass.forEach(([a, b, , t]) => bloco(ws, r, a, r, b, t, { al: "c", b: true }));
    r++; ws.getRow(r).height = 22; ws.getRow(r + 1).height = 22;
    ass.forEach(([a, b, k]) => {
      const s = f.assinaturas && f.assinaturas[k];
      bloco(ws, r, a, r + 1, b, rotulo("Data:", s && s.em ? A.fmtData(s.em) : ""), { top: false });
      ws.getCell(`${a}${r}`).alignment = { vertical: "bottom", horizontal: "left" };
    });
    ws.pageSetup.printArea = `B2:Q${r + 1}`;
    return ws;
  }

  async function montar(A, fichas, cfg) {
    if (!window.NXXL) throw new Error("O gerador de Excel não carregou. Recarregue a página.");
    const X = await window.NXXL.carregar();
    const wb = new X.Workbook();
    wb.creator = "Nexum – Recebimento inteligente"; wb.created = new Date();
    let logos = null;
    const L = window.AMR_LOGOS || {};
    if (L.anglo || L.milplan) {
      logos = {};
      for (const k of ["anglo", "milplan"]) if (L[k]) {
        const t = await tamImg(L[k]); if (!t) continue;
        const h = k === "anglo" ? 40 : 52, w = t.w * h / t.h;
        logos[k] = { id: wb.addImage({ base64: L[k], extension: "png" }), w, h };
      }
    }
    const usados = new Set();
    fichas.forEach(f => aba(wb, A, f, cfg || {}, logos, nomeAba(f, usados)));
    return wb.xlsx.writeBuffer();
  }
  async function gerar(A, fichas, cfg, nomeArquivo) {
    const buf = await montar(A, fichas, cfg);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    a.download = nomeArquivo; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  }
  window.FICHA_XLSX = { gerar, montar };
})();
