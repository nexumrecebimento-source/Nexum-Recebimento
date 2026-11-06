/* Nexum — componentes visuais compartilhados (ícones e cartão de ficha) */
(function () {
  const P = {
    doc: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>',
    cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',
    box: '<path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8M12 13v8"/>',
    alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
    undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    clip: '<rect x="6" y="4" width="12" height="17" rx="2"/><path d="M9 4V3h6v1M9 13l2 2 4-4"/>',
    truck: '<path d="M3 6h11v10H3zM14 9h4l3 3v4h-7"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/><path d="m9 12 2 2 4-4"/>',
    cert: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h4"/><path d="M14 3v5h5v3"/><circle cx="17" cy="16" r="3"/><path d="M15.5 18.5 15 22l2-1 2 1-.5-3.5"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'
  };
  const icon = (n, cls) => `<svg class="ico${cls ? " " + cls : ""}" viewBox="0 0 24 24" aria-hidden="true">${P[n] || ""}</svg>`;
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  /* Cartão de ficha: número + tipo, fornecedor/documento, data e itens, alertas e UM status */
  function fichaCard(A, f, o) {
    o = o || {};
    const its = A.itensValidos(f).length, pend = A.pendencias(f), c = A.conf(f);
    const titulo = f.tipo === "ROM" ? "Anglo American" : (f.fornecedor || "Fornecedor não informado");
    const docTxt = f.tipo === "ROM" ? "Romaneio " + (f.romaneio || "—") : "NF " + (f.nf || "—");
    const alertas = [];
    if (o.motivo) alertas.push(`<span class="b">${icon("undo")}${esc(o.motivo)}</span>`);
    else if (c.situacao === "devolvida") alertas.push(`<span class="b">${icon("undo")}Devolvida ao campo</span>`);
    else if (o.mostrarConferencia && f.status !== "sem_acao" && f.status !== "finalizado" && c.situacao === "pendente") alertas.push(`<span class="i">${icon("eye")}A conferir</span>`);
    if (f.status !== "finalizado" && pend.includes("certificado")) { const n = A.semCertificado(f).length; alertas.push(`<span class="w">${icon("cert")}${n} sem certificado</span>`); }
    if (pend.includes("não conformidade")) alertas.push(`<span class="b">${icon("alert")}Não conformidade</span>`);
    const attrs = o.attrs || `data-id="${esc(f.id)}"`;
    return `<button class="fc" type="button" ${attrs}>
      <div class="fc-l">
        <div class="fc-num"><span><span class="lbl-n">FICHA </span>${f.numero ?? "—"}</span><span class="pill ${f.tipo}">${f.tipo === "ROM" ? "ROMANEIO" : "NF"}</span>${f.exemplo ? '<span class="ex">exemplo</span>' : ""}</div>
        <div class="fc-doc" title="${esc(titulo)}">${esc(titulo)}</div>
        <div class="fc-meta"><span>${icon("doc")}${esc(docTxt)}</span><span>${icon("cal")}${A.fmtData(f.dataRecebimento)}</span><span>${icon("box")}${its} ${its === 1 ? "item" : "itens"}</span></div>
        ${alertas.length ? `<div class="fc-alert">${alertas.join("")}</div>` : ""}
      </div>
      <div class="fc-r"><span class="pill ${f.status}">${A.STATUS[f.status].rotulo}</span></div>
    </button>`;
  }
  window.NXUI = { icon, fichaCard, esc };
})();
