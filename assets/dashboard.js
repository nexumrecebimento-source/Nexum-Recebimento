/* Nexum — dashboard do escritório: indicadores e gráficos de recebimento e qualidade.
   Cores: série única em azul (sequencial #2a78d6 / escuro #3987e5); andamento em rampa ordinal azul;
   certificados em paleta de status (bom / atenção / crítico) sempre com rótulo e ícone. */
(function () {
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const DIA = 864e5;
  const PER = { "30": "Últimos 30 dias", "90": "Últimos 90 dias", "ano": "Este ano", "tudo": "Todo o período" };

  function noPeriodo(f, per) {
    const d = f.dataRecebimento ? new Date(f.dataRecebimento + "T12:00:00") : null;
    if (!d || per === "tudo") return true;
    const hoje = new Date();
    if (per === "ano") return d.getFullYear() === hoje.getFullYear();
    return (hoje - d) / DIA <= +per;
  }

  /* ---------- dados de demonstração (só no modo exemplo, só para os gráficos) ---------- */
  function demo(A) {
    let seed = 7; const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const forn = ["EXEMPLO TINTAS LTDA", "EXEMPLO AÇOS E PERFIS", "EXEMPLO FIXADORES", "EXEMPLO SOLDAS", "EXEMPLO CIMENTOS", "EXEMPLO ELÉTRICA"];
    const mats = [["TINTA PU CINZA N6,5", "MT08010024"], ["CATALISADOR TINTA COMP B", "MT08020001"], ["PARAFUSO SEXTAVADO ASTM A325 3/4", "MT02080003"], ["ELETRODO E7018 4MM", "MT02060005"],
      ["CHUMBADOR QUIMICO 5/8", "MT02040006"], ["VERGALHAO ACO CA50 12,5MM", "MT11010035"], ["CIMENTO CP III 32", "MT10020001"], ["FLANGE 3 POL 150#", "MT09030041"], ["CABO FLEXIVEL 2,5MM", "MT04010002"], ["LUVA DE SEGURANÇA", "ES01020011"]];
    const out = [], hoje = new Date();
    for (let k = 0; k < 85; k++) {
      const dias = Math.floor(r() * 150), d = new Date(hoje - dias * DIA), rom = r() < 0.28;
      const n = 1 + Math.floor(r() * 6), itens = [];
      for (let j = 0; j < n; j++) {
        const m = mats[Math.floor(r() * mats.length)], crit = !!A.materialCritico(m[0], m[1]) && !rom;
        const x = r();
        itens.push({ descricao: m[0], tag: m[1], und: "UN", qtd: 1 + Math.floor(r() * 40), conf: r() < 0.94 ? "C" : "NC",
          certificado: crit && x < 0.7 ? "C" + Math.floor(r() * 99999) : "", certValidado: crit && x < 0.55, certStatus: crit && x >= 0.7 && x < 0.82 ? "nao_recebido" : undefined });
      }
      const idade = dias;
      const st = idade > 25 ? (itens.some(i => A.exigeCert({ tipo: rom ? "ROM" : "NF" }, i) && !i.certificado) ? "cert_pendente" : "finalizado")
        : idade > 6 ? (r() < 0.5 ? "em_andamento" : "cert_pendente") : (r() < 0.4 ? "sem_acao" : "em_andamento");
      const aprov = st === "finalizado" || (st === "cert_pendente" && r() < 0.6);
      const dt = d.toISOString().slice(0, 10), apr = new Date(+d + (1 + Math.floor(r() * 6)) * DIA).toISOString();
      out.push({ id: "demo" + k, numero: 2000 + k, tipo: rom ? "ROM" : "NF", nf: rom ? "" : String(10000 + k), romaneio: rom ? (900 + k) + "-FLT-2026" : "",
        fornecedor: rom ? "ANGLO AMERICAN" : forn[Math.floor(r() * forn.length)], dataRecebimento: dt, status: st, itens,
        conferencia: { situacao: aprov ? "aprovada" : "pendente", historico: aprov ? [{ acao: "aprovada", em: apr }] : [] } });
    }
    return out;
  }

  /* ---------- métricas ---------- */
  function metricas(A, fichas) {
    const itens = fichas.flatMap(f => A.itensValidos(f).map(i => ({ f, i })));
    const nf = fichas.filter(f => f.tipo === "NF").length;
    const insp = itens.filter(x => x.i.conf === "C" || x.i.conf === "NC");
    const conf = insp.length ? insp.filter(x => x.i.conf === "C").length / insp.length : null;
    const crit = itens.filter(x => A.exigeCert(x.f, x.i));
    const cert = {
      validado: crit.filter(x => A.temCert(x.i) && x.i.certValidado).length,
      avalidar: crit.filter(x => A.temCert(x.i) && !x.i.certValidado).length,
      pendente: crit.filter(x => !A.temCert(x.i) && x.i.certStatus !== "nao_recebido").length,
      naorec: crit.filter(x => !A.temCert(x.i) && x.i.certStatus === "nao_recebido").length
    };
    const tempos = fichas.map(f => { const ev = (A.conf(f).historico || []).find(e => e.acao === "aprovada"); if (!ev || !f.dataRecebimento) return null; return Math.max(0, (new Date(ev.em) - new Date(f.dataRecebimento + "T12:00:00")) / DIA); }).filter(x => x !== null);
    const tm = tempos.length ? tempos.reduce((a, b) => a + b, 0) / tempos.length : null;
    const porForn = {};
    crit.filter(x => !A.temCert(x.i) && x.f.tipo === "NF").forEach(x => { const k = x.f.fornecedor || "—"; porForn[k] = (porForn[k] || 0) + 1; });
    const porCmc = {};
    itens.forEach(x => { const g = x.f.tipo === "NF" && A.materialCritico(x.i.descricao, x.i.tag); if (g) porCmc[g.rotulo] = (porCmc[g.rotulo] || 0) + 1; });
    const porStatus = Object.fromEntries(A.ORDEM_STATUS.map(s => [s, fichas.filter(f => f.status === s).length]));
    return { fichas: fichas.length, nf, rom: fichas.length - nf, itens: itens.length, conf, inspecionados: insp.length, nc: insp.length - insp.filter(x => x.i.conf === "C").length, cert, critTotal: crit.length, tm, nTempos: tempos.length, porForn, porCmc, porStatus };
  }

  /* agrupamento no tempo: semanas (até 90 dias) ou meses */
  function serieTempo(fichas, per) {
    const mensal = per === "ano" || per === "tudo";
    const chave = d => { if (mensal) return d.slice(0, 7); const x = new Date(d + "T12:00:00"); const seg = new Date(x - ((x.getDay() + 6) % 7) * DIA); return seg.toISOString().slice(0, 10); };
    const m = {};
    fichas.forEach(f => { if (!f.dataRecebimento) return; const k = chave(f.dataRecebimento); (m[k] = m[k] || { nf: 0, rom: 0 }); m[k][f.tipo === "ROM" ? "rom" : "nf"]++; });
    let ks = Object.keys(m).sort();
    /* preenche buracos */
    if (ks.length) {
      const out = []; let c = ks[0];
      const prox = k => { if (mensal) { let [y, mo] = k.split("-").map(Number); mo++; if (mo > 12) { mo = 1; y++; } return y + "-" + String(mo).padStart(2, "0"); } return new Date(new Date(k + "T12:00:00").getTime() + 7 * DIA).toISOString().slice(0, 10); };
      while (c <= ks[ks.length - 1]) { out.push(c); c = prox(c); }
      ks = out.slice(-14);
    }
    const MES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
    return ks.map(k => ({ k, rot: mensal ? MES[+k.slice(5, 7) - 1] + "/" + k.slice(2, 4) : k.slice(8, 10) + "/" + k.slice(5, 7), nf: (m[k] || {}).nf || 0, rom: (m[k] || {}).rom || 0, mensal }));
  }

  /* ---------- gráficos (SVG/HTML, sem biblioteca) ---------- */
  function barrasTempo(el, serie) {
    if (!serie.length) { el.innerHTML = '<div class="ch-vazio">Sem recebimentos no período.</div>'; return; }
    const W = Math.max(320, Math.round(el.clientWidth || 640)), H = 240, pl = 30, pr = 8, pt = 14, pb = 26, max = Math.max(1, ...serie.map(s => s.nf + s.rom));
    const passo = Math.max(1, Math.ceil(max / 4)), topo = passo * Math.ceil(max / passo);
    const bw = (W - pl - pr) / serie.length, larg = Math.min(34, bw * 0.62);
    let g = "";
    for (let v = 0; v <= topo; v += passo) { const y = pt + (H - pt - pb) * (1 - v / topo); g += `<line x1="${pl}" x2="${W - pr}" y1="${y}" y2="${y}" class="ch-grid"/><text x="${pl - 6}" y="${y + 3.5}" class="ch-ax" text-anchor="end">${v}</text>`; }
    const ult = serie.length - 1;
    serie.forEach((s, i) => {
      const tot = s.nf + s.rom, h = (H - pt - pb) * tot / topo, x = pl + bw * i + (bw - larg) / 2, y = H - pb - h;
      const r = Math.min(4, h / 2);
      if (tot) g += `<path class="ch-bar${i === ult ? " ult" : ""}" d="M${x} ${H - pb}V${y + r}a${r} ${r} 0 0 1 ${r}-${r}h${larg - 2 * r}a${r} ${r} 0 0 1 ${r} ${r}V${H - pb}z"/>`;
      g += `<rect x="${pl + bw * i}" y="${pt}" width="${bw}" height="${H - pt - pb}" fill="transparent" data-tip="${esc(`<b>${s.mensal ? s.rot : "Semana de " + s.rot}</b><br>${tot} ${tot === 1 ? "ficha" : "fichas"} · ${s.nf} NF · ${s.rom} romaneio`)}"/>`;
      if (serie.length <= 14 && (i % (serie.length > 8 ? 2 : 1) === 0 || i === ult)) g += `<text x="${pl + bw * i + bw / 2}" y="${H - 8}" class="ch-ax" text-anchor="middle">${s.rot}</text>`;
      if (i === ult && tot) g += `<text x="${x + larg / 2}" y="${y - 5}" class="ch-val" text-anchor="middle">${tot}</text>`;
    });
    el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" class="ch-svg" role="img" aria-label="Fichas de recebimento por ${serie[0].mensal ? "mês" : "semana"}">${g}<line x1="${pl}" x2="${W - pr}" y1="${H - pb}" y2="${H - pb}" class="ch-base"/></svg>`;
  }
  function listaBarras(el, pares, opt) {
    opt = opt || {};
    if (!pares.length) { el.innerHTML = `<div class="ch-vazio">${opt.vazio || "Nada no período."}</div>`; return; }
    const max = Math.max(...pares.map(p => p[1]), 1);
    el.innerHTML = `<div class="bl">${pares.map(([rot, v, cls]) => `<div class="bl-r" data-tip="${esc(`<b>${rot}</b><br>${v} ${opt.unid || ""}`)}"><span class="bl-l" title="${esc(rot)}">${esc(rot)}</span><span class="bl-t"><i class="${cls || ""}" style="width:${Math.max(2, v / max * 100)}%"></i></span><b>${v}</b></div>`).join("")}</div>`;
  }
  function certChart(el, c, total) {
    const SEG = [["validado", "Validados", "ok", "check"], ["avalidar", "A validar", "prog", "eye"], ["pendente", "Pendentes", "warn", "clock"], ["naorec", "Não recebidos", "crit", "x"]];
    if (!total) { el.innerHTML = '<div class="ch-vazio">Nenhum material crítico no período.</div>'; return; }
    const I = window.NXUI ? NXUI.icon : () => "";
    el.innerHTML = `<div class="stk">${SEG.filter(s => c[s[0]]).map(s => `<i class="${s[2]}" style="flex:${c[s[0]]}" data-tip="${esc(`<b>${s[1]}</b><br>${c[s[0]]} de ${total} itens (${Math.round(c[s[0]] / total * 100)}%)`)}"></i>`).join("")}</div>
      <div class="lg">${SEG.map(s => `<div class="lg-r"><span class="lg-s ${s[2]}"></span>${I(s[3])}<span class="lg-t">${s[1]}</span><b>${c[s[0]]}</b><span class="lg-p">${Math.round(c[s[0]] / total * 100)}%</span></div>`).join("")}</div>`;
  }

  /* ---------- tooltip ---------- */
  let tip = null;
  function tooltip(root) {
    if (!tip) { tip = document.createElement("div"); tip.className = "ch-tip"; tip.hidden = true; document.body.appendChild(tip); }
    root.addEventListener("pointermove", e => {
      const t = e.target.closest("[data-tip]");
      if (!t || !root.contains(t)) { tip.hidden = true; return; }
      tip.innerHTML = t.dataset.tip; tip.hidden = false;
      const w = tip.offsetWidth, x = Math.min(window.innerWidth - w - 8, e.clientX + 14), y = e.clientY + 16;
      tip.style.left = Math.max(8, x) + "px"; tip.style.top = y + "px";
    });
    root.addEventListener("pointerleave", () => { if (tip) tip.hidden = true; });
  }

  window.NXDASH = { PER, noPeriodo, demo, metricas, serieTempo, barrasTempo, listaBarras, certChart, tooltip };
})();
