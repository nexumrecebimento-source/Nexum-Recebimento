/* Nexum — pacote da ficha (.zip): ficha FP-01 em PDF e em Excel + fotos/PDFs da nota e dos certificados.
   ZIP sem compressão (as fotos já são JPEG e os PDFs já são compactados), sem biblioteca externa.
   Uso: NXPACOTE.baixar(A, ficha, cfg, carregarAnexo) */
(function () {
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = u => { let c = 0xFFFFFFFF; for (let i = 0; i < u.length; i++) c = CRC[(c ^ u[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  const enc = new TextEncoder();
  function dosData(d) {
    return { t: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), d: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate() };
  }
  function zip(arquivos) {
    const partes = [], central = []; let pos = 0; const dt = dosData(new Date());
    arquivos.forEach(({ nome, dados }) => {
      const n = enc.encode(nome), u = dados instanceof Uint8Array ? dados : new Uint8Array(dados), c = crc32(u);
      const h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
      h.setUint16(10, dt.t, true); h.setUint16(12, dt.d, true); h.setUint32(14, c, true); h.setUint32(18, u.length, true); h.setUint32(22, u.length, true);
      h.setUint16(26, n.length, true); h.setUint16(28, 0, true);
      partes.push(new Uint8Array(h.buffer), n, u);
      const ce = new DataView(new ArrayBuffer(46));
      ce.setUint32(0, 0x02014b50, true); ce.setUint16(4, 20, true); ce.setUint16(6, 20, true); ce.setUint16(8, 0x0800, true); ce.setUint16(10, 0, true);
      ce.setUint16(12, dt.t, true); ce.setUint16(14, dt.d, true); ce.setUint32(16, c, true); ce.setUint32(20, u.length, true); ce.setUint32(24, u.length, true);
      ce.setUint16(28, n.length, true); ce.setUint32(42, pos, true);
      central.push(new Uint8Array(ce.buffer), n);
      pos += 30 + n.length + u.length;
    });
    const tamC = central.reduce((s, p) => s + p.length, 0), fim = new DataView(new ArrayBuffer(22));
    fim.setUint32(0, 0x06054b50, true); fim.setUint16(8, arquivos.length, true); fim.setUint16(10, arquivos.length, true);
    fim.setUint32(12, tamC, true); fim.setUint32(16, pos, true);
    return new Blob([...partes, ...central, new Uint8Array(fim.buffer)], { type: "application/zip" });
  }
  const limpo = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim().slice(0, 90);
  function dataUrl(u) {
    const m = String(u || "").match(/^data:([^;]+);base64,(.*)$/); if (!m) return null;
    const b = atob(m[2]), a = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i);
    return { mime: m[1], bytes: a };
  }
  const ext = mime => /pdf/.test(mime) ? ".pdf" : /png/.test(mime) ? ".png" : /webp/.test(mime) ? ".webp" : ".jpg";

  async function baixar(A, f, cfg, carregarAnexo, progresso) {
    const arqs = [], usados = new Set(), falhas = [];
    const add = (nome, dados) => { let n = nome, k = 2; while (usados.has(n.toLowerCase())) n = nome.replace(/(\.[a-z]+)$/i, ` (${k++})$1`); usados.add(n.toLowerCase()); arqs.push({ nome: n, dados }); };
    const base = window.FICHA_PDF.nomeArquivo(A, f).replace(/\.pdf$/i, "");
    progresso && progresso("Gerando a ficha…");
    add(base + ".pdf", new Uint8Array(window.FICHA_PDF.gerar(A, f, cfg).output("arraybuffer")));
    if (window.FICHA_XLSX) { try { add(base + ".xlsx", new Uint8Array(await window.FICHA_XLSX.montar(A, [f], cfg))); } catch (e) { falhas.push("ficha em Excel"); } }
    const grupos = [["doc", f.tipo === "ROM" ? "Romaneio" : "Nota fiscal e pedido"], ["cert", "Certificados"]];
    for (const [k, pasta] of grupos) {
      const lista = (f.anexos && f.anexos[k]) || [];
      for (let i = 0; i < lista.length; i++) {
        progresso && progresso(`Juntando ${pasta.toLowerCase()} (${i + 1}/${lista.length})…`);
        let a = lista[i];
        try { if (a && a.ref && !a.img && !a.data && carregarAnexo) a = await carregarAnexo(a); } catch (e) { }
        const d = a && dataUrl(a.img || a.data);
        if (!d) { falhas.push(a && a.nome || pasta); continue; }
        add(`${pasta}/${String(i + 1).padStart(2, "0")} - ${limpo(a.nome || pasta)}${ext(d.mime)}`, d.bytes);
      }
    }
    const blob = zip(arqs), link = document.createElement("a");
    link.href = URL.createObjectURL(blob); link.download = limpo(base) + ".zip";
    document.body.appendChild(link); link.click();
    setTimeout(() => { URL.revokeObjectURL(link.href); link.remove(); }, 3000);
    return { nome: link.download, arquivos: arqs.length, falhas };
  }
  window.NXPACOTE = { baixar, _zip: zip };
})();
