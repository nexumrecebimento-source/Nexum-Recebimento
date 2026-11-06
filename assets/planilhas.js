/* Nexum — planilhas Excel formatadas (ExcelJS, carregado só na hora de exportar) */
(function () {
  const NAVY = "FF0B2D5B", AZUL = "FF2D8CFF", GELO = "FFE6EEF7", ZEBRA = "FFF5F8FC", LINHA = "FFD3DDEA", CINZA = "FF4B5563", BRANCO = "FFFFFFFF";
  const FONTE = "Calibri";
  /* cores de situação: [fundo, texto] */
  const COR = {
    ok: ["FFE3F3E3", "FF0B6B0B"], prog: ["FFE3EEFB", "FF1C5CAB"], warn: ["FFFDF0D9", "FF8A5A00"],
    crit: ["FFFBE3E3", "FFB42318"], neutro: ["FFEEF1F5", "FF4B5563"], auto: ["FFE6F0FC", "FF1C5CAB"]
  };
  function corDe(v) {
    const s = String(v ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().trim();
    if (!s) return null;
    if (/^(FINALIZADO|CONFERIDA|C|CONFORME|VALIDADO|SIM)$/.test(s) || /RECEBIDO · VALID/.test(s)) return COR.ok;
    if (/^(EM ANDAMENTO|A CONFERIR|A VALIDAR)$/.test(s) || /A VALIDAR/.test(s)) return COR.prog;
    if (/PENDENTE|CERTIFICADO PENDENTE|FALTANDO|^NAO$/.test(s)) return COR.warn;
    if (/^(NC|N\/C|NAO CONFORME|DEVOLVIDA.*)$/.test(s) || /NAO CONFORMIDADE/.test(s)) return COR.crit;
    if (/^SEM ACAO$/.test(s)) return COR.neutro;
    if (/^(CERTIFICADO|VALIDAR CERTIFICADO|SEM ITENS)(, |$)/.test(s)) return COR.warn;
    if (/AUTOMATICAMENTE/.test(s)) return COR.auto;
    return null;
  }

  let carregando = null;
  function carregar() {
    if (window.ExcelJS) return Promise.resolve(window.ExcelJS);
    if (carregando) return carregando;
    const base = (document.currentScript && document.currentScript.src) || "";
    carregando = new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = (window.NXXL_BASE || "assets/vendor/") + "exceljs.min.js";
      s.onload = () => window.ExcelJS ? res(window.ExcelJS) : rej(new Error("ExcelJS não carregou"));
      s.onerror = () => { carregando = null; rej(new Error("Não consegui carregar o gerador de Excel. Verifique a internet e tente de novo.")); };
      document.head.appendChild(s); void base;
    });
    return carregando;
  }
  const tamImg = src => new Promise(r => { const i = new Image(); i.onload = () => r({ w: i.naturalWidth, h: i.naturalHeight }); i.onerror = () => r(null); i.src = src; });
  const colL = n => { let s = ""; n++; while (n) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
  const borda = c => ({ top: { style: "thin", color: { argb: c } }, left: { style: "thin", color: { argb: c } }, bottom: { style: "thin", color: { argb: c } }, right: { style: "thin", color: { argb: c } } });

  /* Monta uma aba no padrão Nexum.
     aba = { nome, titulo, subtitulo, info, kpis:[[rótulo, valor, "ok|warn|prog|crit"]], cols:[{h, w, tipo:"txt|num|dec|data|cor|int", al}], linhas:[[...]] } */
  async function montarAba(wb, aba, logos) {
    const n = aba.cols.length, ultima = colL(n - 1);
    const ws = wb.addWorksheet(aba.nome.slice(0, 31), {
      views: [{ showGridLines: false }],
      pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: .3, right: .3, top: .4, bottom: .5, header: .2, footer: .25 } },
      headerFooter: { oddFooter: `&L&8Nexum · Recebimento inteligente&C&8${aba.titulo.replace(/&/g, "&&")}&R&8Página &P de &N` },
      properties: { defaultRowHeight: 17 }
    });
    ws.columns = aba.cols.map(c => ({ width: c.w || 14 }));
    /* faixa de título com logos */
    ws.mergeCells(`A1:${ultima}1`); ws.mergeCells(`A2:${ultima}2`); ws.mergeCells(`A3:${ultima}3`);
    ws.getRow(1).height = 50; ws.getRow(2).height = 18; ws.getRow(3).height = 22;
    const t = ws.getCell("A1"); t.value = aba.titulo; t.font = { name: FONTE, size: 16, bold: true, color: { argb: NAVY } }; t.alignment = { horizontal: "center", vertical: "middle" };
    const st = ws.getCell("A2"); st.value = aba.subtitulo || ""; st.font = { name: FONTE, size: 10, bold: true, color: { argb: "FF1C5CAB" } }; st.alignment = { horizontal: "center", vertical: "middle" };
    const inf = ws.getCell("A3"); inf.value = aba.info || ""; inf.font = { name: FONTE, size: 9.5, color: { argb: BRANCO } }; inf.alignment = { horizontal: "left", vertical: "middle", indent: 1 };
    inf.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
    ws.getCell("A3").border = { bottom: { style: "medium", color: { argb: AZUL } } };
    if (logos) {
      const largTot = aba.cols.reduce((s, c) => s + (c.w || 14), 0) * 7.2;
      if (logos.anglo) ws.addImage(logos.anglo.id, { tl: { col: 0.15, row: 0.12 }, ext: { width: Math.round(logos.anglo.w), height: Math.round(logos.anglo.h) }, editAs: "oneCell" });
      if (logos.milplan) { const alvo = largTot - logos.milplan.w - 6; let x = 0, k = 0;
        while (k < n - 1 && x + (aba.cols[k].w || 14) * 7.2 <= alvo) { x += (aba.cols[k].w || 14) * 7.2; k++; }
        ws.addImage(logos.milplan.id, { tl: { col: k, row: 0.06 }, ext: { width: Math.round(logos.milplan.w), height: Math.round(logos.milplan.h) }, editAs: "oneCell" }); }
    }
    let r = 4;
    /* cartões de indicadores */
    if (aba.kpis && aba.kpis.length) {
      ws.getRow(r).height = 6; r++;
      const por = Math.max(1, Math.floor(n / aba.kpis.length));
      const rot = ws.getRow(r), val = ws.getRow(r + 1); rot.height = 26; val.height = 26;
      aba.kpis.forEach(([rotulo, valor, tom], k) => {
        const c0 = k * por, c1 = k === aba.kpis.length - 1 ? n - 1 : c0 + por - 1;
        if (c0 > n - 1) return;
        if (c1 > c0) { ws.mergeCells(r, c0 + 1, r, c1 + 1); ws.mergeCells(r + 1, c0 + 1, r + 1, c1 + 1); }
        const cor = (tom && COR[tom]) || [GELO, NAVY];
        const a = ws.getCell(r, c0 + 1), b = ws.getCell(r + 1, c0 + 1);
        a.value = String(rotulo).toUpperCase(); b.value = valor;
        a.font = { name: FONTE, size: 8, bold: true, color: { argb: CINZA } }; b.font = { name: FONTE, size: 16, bold: true, color: { argb: cor[1] } };
        [a, b].forEach(x => { x.alignment = { horizontal: "center", vertical: "middle", wrapText: true }; });
        for (let c = c0; c <= c1; c++) [r, r + 1].forEach(rr => { const x = ws.getCell(rr, c + 1); x.fill = { type: "pattern", pattern: "solid", fgColor: { argb: cor[0] } }; x.border = { left: c === c0 ? { style: "medium", color: { argb: BRANCO } } : undefined, right: c === c1 ? { style: "medium", color: { argb: BRANCO } } : undefined }; });
        if (typeof valor === "number") b.numFmt = "#,##0";
      });
      r += 2;
    }
    ws.getRow(r).height = 8; r++;
    /* cabeçalho da tabela */
    const hr = ws.getRow(r); hr.height = 32;
    aba.cols.forEach((c, k) => { const x = hr.getCell(k + 1); x.value = c.h; x.font = { name: FONTE, size: 9.5, bold: true, color: { argb: BRANCO } };
      x.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } }; x.alignment = { horizontal: "center", vertical: "middle", wrapText: true }; x.border = borda("FF2A4A78"); });
    const cab = r;
    /* linhas */
    const fmt = { data: "dd/mm/yyyy", num: "#,##0.###", dec: "#,##0.00", int: "0" };
    aba.linhas.forEach((ln, i) => {
      const row = ws.getRow(++r); const z = i % 2 === 1;
      ln.forEach((v, k) => {
        const c = aba.cols[k] || {}, x = row.getCell(k + 1);
        x.value = (v === "" || v === undefined) ? null : v;
        x.font = { name: FONTE, size: 10, color: { argb: "FF1F2937" }, bold: !!c.forte };
        x.alignment = { vertical: "middle", horizontal: c.al || (["num", "dec", "int", "data"].includes(c.tipo) ? "center" : "left"), wrapText: !!c.quebra };
        x.border = borda(LINHA);
        if (fmt[c.tipo]) x.numFmt = fmt[c.tipo]; else if (v instanceof Date) x.numFmt = fmt.data;
        const cc = c.tipo === "cor" ? corDe(v) : null;
        if (cc) { x.fill = { type: "pattern", pattern: "solid", fgColor: { argb: cc[0] } }; x.font = { name: FONTE, size: 10, bold: true, color: { argb: cc[1] } }; x.alignment = { vertical: "middle", horizontal: "center" }; }
        else if (z) x.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ZEBRA } };
      });
    });
    if (!aba.linhas.length) { const row = ws.getRow(++r); ws.mergeCells(r, 1, r, n); const x = row.getCell(1); x.value = aba.vazio || "Nada a listar."; x.font = { name: FONTE, size: 10, italic: true, color: { argb: CINZA } }; x.alignment = { horizontal: "center" }; }
    ws.views = [{ state: "frozen", ySplit: cab, xSplit: aba.congelarCol || 0, showGridLines: false }];
    if (aba.linhas.length) ws.autoFilter = { from: { row: cab, column: 1 }, to: { row: r, column: n } };
    ws.pageSetup.printTitlesRow = `${cab}:${cab}`;
    return ws;
  }

  async function gerar(nome, abas) {
    const X = await carregar();
    const wb = new X.Workbook();
    wb.creator = "Nexum – Recebimento inteligente"; wb.created = new Date();
    let logos = null;
    const L = window.AMR_LOGOS || {};
    if (L.anglo || L.milplan) {
      logos = {};
      for (const k of ["anglo", "milplan"]) if (L[k]) { const t = await tamImg(L[k]); if (!t) continue; const h = k === "anglo" ? 40 : 54, w = t.w * h / t.h;
        logos[k] = { id: wb.addImage({ base64: L[k], extension: "png" }), w, h }; }
    }
    for (const a of abas) await montarAba(wb, a, a.logos === false ? null : logos);
    const buf = await wb.xlsx.writeBuffer();
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    link.download = nome; document.body.appendChild(link); link.click();
    setTimeout(() => { URL.revokeObjectURL(link.href); link.remove(); }, 2000);
  }
  window.NXXL = { gerar, corDe, carregar };
})();
