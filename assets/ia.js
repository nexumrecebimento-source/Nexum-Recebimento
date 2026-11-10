/* Nexum — leitura de certificados com IA (Gemini via Firebase AI Logic, plano gratuito).
   NXIA.lerCertificados(arquivos, itens) → [{ numero, lote, material, norma, fabricante, data, itens:[índices], confianca }]
   Se o AI Logic não estiver ativado no Firebase, lança erro com code "ia_desligada". */
(function () {
  const cfg = () => { const t = window.NEXUM_NUVEM_TESTE, n = window.NEXUM_NUVEM; return (t && t.FIREBASE) ? t : (n || t || {}); };
  const modelos = () => [cfg().IA_MODELO, "gemini-flash-latest", "gemini-2.5-flash", "gemini-flash-lite-latest", "gemini-2.5-flash-lite", "gemini-2.0-flash"].filter(Boolean);
  let ai = null, modeloOk = null;
  function iniciar() {
    if (ai) return ai;
    const S = window.NXAI_SDK;
    const C = cfg();
    if (!S || !C.FIREBASE) { const e = new Error("A leitura automática não está disponível neste aparelho."); e.code = "ia_indisponivel"; throw e; }
    const app = S.initializeApp(C.FIREBASE, "nexum-ia");
    ai = S.getAI(app, { backend: new S.GoogleAIBackend() });
    return ai;
  }
  const disponivel = () => !!(window.NXAI_SDK && cfg().FIREBASE);

  function parte(a) {
    const url = a.img || a.data || ""; const m = url.match(/^data:([^;]+);base64,(.*)$/);
    return m ? { inlineData: { mimeType: m[1], data: m[2] } } : null;
  }
  function prompt(itens) {
    const lista = itens.map((it, i) => `${i}: ${it.descricao || "(sem descrição)"} | código ${it.tag || "-"} | ${it.qtd || "?"} ${it.und || ""}`).join("\n");
    return `Você é inspetor de qualidade no recebimento de materiais de uma obra.
As imagens são certificado(s) de qualidade (certificado de inspeção, de análise, de conformidade, de usina, de calibração etc.) que vieram junto com uma nota fiscal.

Itens recebidos nesta nota (índice: descrição | código | quantidade):
${lista}

Para CADA certificado distinto que aparecer nas imagens (um certificado pode ter várias páginas), extraia:
- numero: número/identificação do certificado (ex.: "C-12345/26"). Se não houver número, use o lote/corrida.
- lote: lote, corrida ou heat number (se houver).
- material: material ou produto certificado, como está escrito.
- norma: norma ou especificação citada (ex.: "ABNT NBR 7480", "ASTM A36"), se houver.
- fabricante: empresa que emitiu o certificado.
- data: data de emissão no formato dd/mm/aaaa, se houver.
- itens: os ÍNDICES da lista acima que esse certificado cobre. Compare tipo de material, bitola, dimensão, classe e código. Um mesmo certificado pode valer para vários itens. Só inclua um item se houver boa correspondência.
- imagens: os índices (começando em 0, na ordem enviada) das imagens/arquivos onde esse certificado aparece.
- confianca: de 0 a 1, o quanto você tem certeza da associação com os itens.

Responda SOMENTE com JSON no formato:
{"certificados":[{"numero":"","lote":"","material":"","norma":"","fabricante":"","data":"","itens":[0],"imagens":[0],"confianca":0.9}]}
Se não conseguir ler nenhum certificado, responda {"certificados":[]}.`;
  }
  function interpretar(txt, n, ni) {
    let j; try { j = JSON.parse(txt); } catch (e) { const m = String(txt).match(/\{[\s\S]*\}/); j = m ? JSON.parse(m[0]) : { certificados: [] }; }
    return (j.certificados || []).map(c => ({
      numero: String(c.numero || c.lote || "").trim().toUpperCase(),
      lote: String(c.lote || "").trim().toUpperCase(), material: String(c.material || "").trim(),
      norma: String(c.norma || "").trim(), fabricante: String(c.fabricante || "").trim(), data: String(c.data || "").trim(),
      itens: [...new Set((c.itens || []).map(Number).filter(i => Number.isInteger(i) && i >= 0 && i < n))],
      imagens: [...new Set((c.imagens || []).map(Number).filter(i => Number.isInteger(i) && i >= 0 && i < ni))],
      confianca: Math.max(0, Math.min(1, Number(c.confianca) || 0))
    })).filter(c => c.numero || c.material);
  }
  function traduzErro(e) {
    const m = String((e && (e.message || e.code)) || e);
    const x = new Error("Não consegui ler o certificado agora. Marque os itens manualmente.");
    if (/App Check/i.test(m)) { x.code = "ia_appcheck"; x.message = "A leitura automática está bloqueada pelo App Check do Firebase (precisa desligar a exigência do App Check para o AI Logic). Marque os itens manualmente por enquanto."; }
    else if (/not been used|disabled|PERMISSION_DENIED|403|API has not|firebasevertexai|AI Logic|enable/i.test(m)) { x.code = "ia_desligada"; x.message = "A leitura automática ainda não está ativada no Firebase (AI Logic). Marque os itens manualmente por enquanto."; }
    else if (/quota|RESOURCE_EXHAUSTED|429/i.test(m)) { x.code = "ia_cota"; x.message = "A cota gratuita de leitura automática do dia acabou. Marque os itens manualmente."; }
    else if (/network|Failed to fetch|offline/i.test(m) || !navigator.onLine) { x.code = "ia_offline"; x.message = "Sem internet para a leitura automática. Marque os itens manualmente ou tente de novo com sinal."; }
    x.original = m;
    /* detalhe técnico curto no fim da mensagem, para saber exatamente o que o Google respondeu */
    const det = m.replace(/^FirebaseError:\s*/i, "").replace(/\s+/g, " ").slice(0, 220);
    if (det) x.message += " [Detalhe: " + det + "]";
    try { console.warn("NXIA erro:", m); } catch (_) { }
    return x;
  }
  async function lerCertificados(arquivos, itens) {
    const partes = arquivos.map(parte).filter(Boolean);
    if (!partes.length) return [];
    let a; try { a = iniciar(); } catch (e) { throw e; }
    const S = window.NXAI_SDK, lista = [...new Set([modeloOk, ...modelos()].filter(Boolean))];
    let ultimo = null;
    for (const nome of lista) {
      try {
        const model = S.getGenerativeModel(a, { model: nome, generationConfig: { responseMimeType: "application/json", temperature: 0.1 } });
        const r = await model.generateContent([{ text: prompt(itens) }, ...partes]);
        modeloOk = nome;
        return interpretar(r.response.text(), itens.length, partes.length);
      } catch (e) {
        ultimo = e; const m = String(e && e.message || e);
        /* modelo inexistente ou cota do dia esgotada nesse modelo: cada modelo tem a sua cota, tenta o próximo */
        if (/not found|404|is not supported|unknown model/i.test(m)) continue;
        if (/quota|RESOURCE_EXHAUSTED|429/i.test(m)) { if (modeloOk === nome) modeloOk = null; continue; }
        throw traduzErro(e);
      }
    }
    throw traduzErro(ultimo);
  }
  window.NXIA = { disponivel, lerCertificados };
})();
