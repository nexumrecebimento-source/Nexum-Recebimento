/* Recebimento AMR — dados compartilhados entre o app de campo e o painel do escritório.
   Etapa 1: armazenamento local (modo exemplo). Na etapa 2 o mesmo "AMR.store" passa a usar o Firebase. */
(function () {
  const CONTRATO = "4600042164";
  const OBRA = "Serviços de Obras Civis e Montagem Eletromecânica Relacionados à Retomada da Implantação do Projeto Flotação Recleaner";
  const ESCOPO = "Obras Civis e Montagem Eletromecânica relacionados à retomada da implantação do Projeto Flotação Recleaner - Alvorada de Minas/MG";
  const DOC_FICHA = "447.OPE.FP-01 Rev.02";
  const DOC_MAPA = "447.QUA.FP-11";
  const FICHA_INICIAL = 2291;
  /* Contratos: cada um com seus registros, numeração e mapa próprios */
  const CONTRATOS = {
    recleaner: { id: "recleaner", nome: "Flotação Recleaner", projeto: "PROJETO FLOTAÇÃO RECLEANER", numero: CONTRATO, obra: OBRA, escopo: ESCOPO, ativo: true, aba: "Mapa Flotação" },
    espessador: { id: "espessador", nome: "Upgrade do Espessador", projeto: "PROJETO UPGRADE DO ESPESSADOR DE CONCENTRADO", numero: "", obra: "Projeto Upgrade do Espessador de Concentrado", escopo: "Upgrade do Espessador de Concentrado", ativo: false, aba: "Mapa" }
  };
  const ctrDe = f => (f && f.contrato) || "recleaner";

  const TIPOS = {
    NF: { rotulo: "Nota fiscal", curto: "NF", fornecimento: "MILPLAN ENGENHARIA" },
    ROM: { rotulo: "Romaneio Anglo", curto: "Romaneio", fornecimento: "ANGLO AMERICAN" }
  };
  const STATUS = {
    sem_acao: { rotulo: "Sem ação", dica: "NF na obra, recebimento ainda não feito" },
    em_andamento: { rotulo: "Em andamento", dica: "Com a qualidade, relatório em elaboração" },
    cert_pendente: { rotulo: "Certificado pendente", dica: "Aguardando certificado" },
    finalizado: { rotulo: "Finalizado", dica: "Enviado para a fiscalização" }
  };
  const ORDEM_STATUS = ["sem_acao", "em_andamento", "cert_pendente", "finalizado"];
  const CONF = { C: "Conforme", NC: "Não conforme", NA: "Não se aplica" };
  const UNIDADES = ["PÇ", "PC", "UND", "UN", "M", "KG", "GL", "LT", "L", "CJ", "PAR", "CX", "M²", "M³", "M3", "VB", "TB", "SC", "RL", "BR", "PT"];
  const MOTIVOS = {
    foto: "Foto ilegível ou incompleta",
    doc_divergente: "Dados do documento divergentes (nº, fornecedor, data)",
    qtd: "Quantidade divergente",
    tag: "TAG / código incorreto",
    item_falta: "Item faltando ou a mais",
    cert: "Certificado faltando, ilegível ou não confere",
    avaria: "Avaria / não conformidade sem registro",
    outro: "Outro"
  };
  const CONFER = { pendente: "A conferir", aprovada: "Conferida", devolvida: "Devolvida ao campo" };
  const OBS_ANGLO = "Obs1 - Material fornecido pela Anglo, recebido sem Certificado de Qualidade. A ausência do documento fica registrada neste Relatório de Recebimento, conforme orientação estabelecida no e-mail “RE: Pendência de Certificados de Qualidade - Materiais Fornecidos pelo Cliente”, de 01/09/2026.";

  const norm = s => String(s ?? "").trim().toUpperCase().replace(/\s+/g, " ");
  const soDig = s => String(s ?? "").replace(/\D/g, "").replace(/^0+/, "");
  const normForn = s => {
    const n = norm(s);
    if (/^M[I]?[L]?P+[L]?AN/.test(n) || n === "MIPLAN ENGENHARIA") return "MILPLAN ENGENHARIA";
    if (n.includes("ANGLO")) return "ANGLO AMERICAN";
    return n;
  };
  const hoje = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
  const fmtData = s => s ? s.slice(0, 10).split("-").reverse().join("/") : "—";
  const fmtQtd = n => (n === "" || n == null) ? "" : Number(n).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 3 });

  /* ---------- Chave de acesso da NF-e (código de barras de 44 dígitos do DANFE) ---------- */
  const UFS = { "11":"RO","12":"AC","13":"AM","14":"RR","15":"PA","16":"AP","17":"TO","21":"MA","22":"PI","23":"CE","24":"RN","25":"PB","26":"PE","27":"AL","28":"SE","29":"BA","31":"MG","32":"ES","33":"RJ","35":"SP","41":"PR","42":"SC","43":"RS","50":"MS","51":"MT","52":"GO","53":"DF" };
  function dvChave(c43) { let soma = 0, peso = 2; for (let i = c43.length - 1; i >= 0; i--) { soma += +c43[i] * peso; peso = peso === 9 ? 2 : peso + 1; } const r = soma % 11; return r < 2 ? 0 : 11 - r; }
  function lerChaveNFe(texto) {
    const dig = String(texto || "").replace(/\D/g, "");
    const m = dig.match(/\d{44}/); if (!m) return null;
    const c = m[0];
    if (dvChave(c.slice(0, 43)) !== +c[43]) return { valida: false, chave: c };
    const fmtCnpj = x => x.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
    return { valida: true, chave: c, uf: UFS[c.slice(0, 2)] || c.slice(0, 2), emissao: "20" + c.slice(2, 4) + "-" + c.slice(4, 6),
      cnpj: fmtCnpj(c.slice(6, 20)), modelo: c.slice(20, 22), serie: String(+c.slice(22, 25)), nf: String(+c.slice(25, 34)) };
  }
  const soCnpj = s => String(s || "").replace(/\D/g, "");

  /* Chave de duplicidade: NF = nº + fornecedor; Romaneio = nº do romaneio */
  function chaveDoc(f) {
    if (f.tipo === "ROM") return f.romaneio ? "ROM|" + norm(f.romaneio) : "";
    return f.nf ? "NF|" + soDig(f.nf) + "|" + normForn(f.fornecedor) : "";
  }
  function duplicada(f, todas) {
    const c = ctrDe(f);
    todas = todas.filter(o => ctrDe(o) === c && !o.lacuna && !(f.importado && o.importado));
    const k = chaveDoc(f);
    const porChave = f.chaveNFe ? todas.find(o => o.id !== f.id && o.chaveNFe === f.chaveNFe) : null;
    if (porChave) return porChave;
    if (!k) return null;
    return todas.find(o => o.id !== f.id && chaveDoc(o) === k) || null;
  }
  function msgDuplicada(f, outra) {
    const doc = f.tipo === "ROM" ? "Romaneio já realizado recebimento" : "NF já realizada recebimento";
    return `${doc} (ficha ${outra.numero}, ${fmtData(outra.dataRecebimento)}).`;
  }
  function proximoNumero(todas, inicial, contrato) {
    const c = contrato || "recleaner";
    const max = todas.filter(f => !f.exemplo && ctrDe(f) === c).reduce((m, f) => Math.max(m, +f.numero || 0), 0);
    return c === "recleaner" ? Math.max(max + 1, inicial || FICHA_INICIAL) : max + 1;
  }
  /* Itens válidos para a ficha: romaneio com quantidade 0 não entra */
  function itensValidos(f) {
    return (f.itens || []).filter(i => (i.descricao || i.tag) && !(f.tipo === "ROM" && Number(i.qtd) === 0));
  }
  /* ---------- Materiais críticos (CMC) — exigem certificado de qualidade ----------
     Fontes: CMC-MIL-0001 (Civil) e CMC-MIL-0002 (Mecânica), 447.QUA.FP-40 Rev.00, de 06/03/2026.
     Legenda: W testemunho opcional · R verificação da documentação · H hold point · A inspeção 100%
              C inspeção de produto · D verificação dimensional · V exame visual · M inspeção por amostragem */
  const CMC = [
    { id: "cimento", rotulo: "Cimento", tipo: "CP II / CP III / CP V ARI", doc: "CMC-MIL-0001", setor: "R", cq: "R, C, M", cliente: "W, R",
      evidencia: "Certificado de qualidade, conferido com o pedido de compra",
      re: [/^CIMENTO\b(?!.*(COLA|ADESIV|COLANTE|BRANCO|AMIANTO|FIBRO))/] },
    { id: "concreto", rotulo: "Concreto usinado", tipo: "Concreto usinado", doc: "CMC-MIL-0001", setor: "R", cq: "R, C, M", cliente: "W, R",
      evidencia: "Nota de transporte conferida com o projeto, slump test e corpo de prova (controle tecnológico do PCQ)",
      codigos: [/^SV0120/], re: [/^CONCRETO (USINADO|BOMBEAVEL|FCK|C ?\d\d)/, /^SERVICO (DE )?APLICACAO (DE )?CONCRETO/] },
    { id: "ferragem", rotulo: "Ferragem", tipo: "Barra / tela", doc: "CMC-MIL-0001", setor: "R, C, V", cq: "C, R", cliente: "W, R",
      evidencia: "Certificado de qualidade da usina, conferido com o pedido de compra",
      re: [/^VERGALHAO/, /^(ACO|BARRA( DE)? ACO|FERRO)\b.*\bCA ?-?(25|50|60)\b/, /^TELA (SOLDADA|ACO|DE ACO|NERVURADA|Q ?-?\d)/] },
    { id: "graute", rotulo: "Graute", tipo: "Cimentício / epóxi", doc: "CMC-MIL-0001", setor: "R", cq: "R, C, M", cliente: "W, R",
      evidencia: "Certificado de qualidade; cimentício: corpo de prova; epóxi: acondicionar entre +20 °C e +27 °C por 48 h antes da aplicação",
      re: [/^GRAUTE|^GROUT/] },
    { id: "chumbador", rotulo: "Chumbador", tipo: "Barra roscada / tipo J / químico", doc: "CMC-MIL-0002", setor: "R, C, V", cq: "C, R", cliente: "W, R",
      evidencia: "Certificado de qualidade, conferido com o pedido de compra",
      re: [/CHUMBADOR|BARRA ROSCADA|BARRA (DE )?ANCORAGEM|ANCORAGEM QUIMICA|ADESIVO.{0,20}ANCORAGEM/] },
    { id: "solda", rotulo: "Consumível de soldagem", tipo: "Eletrodo, arame e vareta", doc: "CMC-MIL-0002", setor: "R, C, V", cq: "C, R, M", cliente: "W, R",
      evidencia: "Certificado de qualidade, conferido com o pedido de compra",
      re: [/^ELETRODO\b/, /^ARAME (TUBULAR|MIG|MAG|DE SOLDA|SOLDA|SOLIDO)/, /^ARAME\b.*\b(ER ?70|E ?71|AWS)/, /^VARETA\b/] },
    { id: "fixacao", rotulo: "Elemento de fixação", tipo: "Alta resistência", doc: "CMC-MIL-0002", setor: "R, C, V", cq: "C, R, M", cliente: "W, R",
      evidencia: "Certificado de qualidade, conferido com o pedido de compra",
      re: [/^(PARAFUSO|PORCA|ARRUELA|ESTOJO|PRISIONEIRO)\b.*(ALTA RESIST|A ?325|A ?490|A ?193|A ?194|\bB7\b|\b2H\b|\b8\.8\b|\b10\.9\b|F ?1852|GRAU ?8|GR\.? ?8\b)/] },
    { id: "tintas", rotulo: "Tinta", tipo: "Látex, acrílica, esmalte, epóxi, diluente", doc: "CMC-MIL-0002", setor: "R", cq: "C, R, M", cliente: "W, R",
      evidencia: "Certificado de qualidade, conferido com o pedido de compra",
      re: [/^(TINTA|CATALISADOR (DE )?TINTA|LATEX|ESMALTE|DILUENTE|THINNER|PRIMER|VERNIZ)\b/] }
  ];
  const LEGENDA_CMC = { W: "Testemunho opcional", R: "Verificação da documentação", H: "Hold point (teste exigido)", A: "Inspeção 100%", C: "Inspeção de produto", D: "Verificação dimensional", V: "Exame visual", M: "Inspeção por amostragem", NA: "Não se aplica" };
  const semAcento = s => String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
  function materialCritico(descricao, codigo) {
    const c = String(codigo || "").trim().toUpperCase();
    const d = semAcento(descricao);
    const porCodigo = c ? CMC.find(g => (g.codigos || []).some(r => r.test(c))) : null;
    if (porCodigo) return porCodigo;
    if (c && !/^MT/.test(c)) return null;
    return CMC.find(g => g.re.some(r => r.test(d))) || null;
  }
  /* Exige certificado? Valor marcado no item, ou: NF + material crítico do CMC */
  function exigeCert(f, i) {
    if (f.tipo !== "NF") return false;
    if (i.certStatus === "nao_recebido") return true;
    if (typeof i.exigeCertificado === "boolean") return i.exigeCertificado;
    return !!materialCritico(i.descricao, i.tag);
  }
  const semValorCert = c => /^(N\/?A|OBS\.? ?1)$/i.test(String(c || "").trim());
  const temCert = i => !!((i.certificado && !semValorCert(i.certificado)) || i.temCertAnexo);
  const STATUS_ITEM = {
    nao_conforme: { rotulo: "Não conforme", cls: "bad" },
    cert_pendente: { rotulo: "Pendente – Certificado", cls: "cert_pendente" },
    cert_a_validar: { rotulo: "Certificado recebido · a validar", cls: "em_andamento" },
    aguardando: { rotulo: "Aguardando conferência", cls: "sem_acao" },
    conforme: { rotulo: "Conforme", cls: "finalizado" }
  };
  function statusItem(f, i) {
    if (i.conf === "NC") return "nao_conforme";
    if (exigeCert(f, i) && !temCert(i)) return "cert_pendente";
    if (exigeCert(f, i) && !i.certValidado) return "cert_a_validar";
    if (conf(f).situacao !== "aprovada") return "aguardando";
    return "conforme";
  }
  /* Itens que exigem certificado e estão sem ele */
  const chaveItem = (i, n) => i.pc && i.itemPc ? `PC${i.pc}/${i.itemPc}` : `#${n + 1}|${norm(i.tag)}|${norm(i.descricao).slice(0, 40)}`;
  function semCertificado(f) { return itensValidos(f).map((i, n) => ({ i, n, k: chaveItem(i, n) })).filter(x => exigeCert(f, x.i) && !temCert(x.i)); }
  function cobrados(f) { return new Set((f.cobrancas || []).flatMap(c => c.itens || [])); }
  function pendentesDeCobranca(f) { const c = cobrados(f); return semCertificado(f).filter(x => !c.has(x.k)); }
  function montarEmailCobranca(f, lista) {
    const para = destinatariosCertPendente(f);
    const assunto = `Certificado de qualidade pendente - NF ${f.nf} - ${f.fornecedor} - Ficha ${f.numero}`;
    const linhas = lista.map(({ i, n }) => `- Item ${n + 1}: ${i.tag || "(sem código)"} - ${i.descricao}\n  Quantidade: ${fmtQtd(i.qtd)} ${i.und}${i.pc ? `  |  Pedido ${i.pc}/${i.itemPc}` : ""}\n  Pendência: certificado de qualidade não enviado`);
    const corpo = `Prezados,\n\nNo recebimento de materiais do Projeto Flotação Recleaner (contrato ${CONTRATO}), os itens abaixo chegaram sem o certificado de qualidade.\n\nNota fiscal: ${f.nf}${f.serie ? " (série " + f.serie + ")" : ""}\nFornecedor: ${f.fornecedor}\nData do recebimento: ${fmtData(f.dataRecebimento)}\nFicha de recebimento: ${f.numero}\n\nItens pendentes:\n${linhas.join("\n")}\n\nSolicitamos o envio dos certificados de qualidade pendentes, identificando o número da NF e o item a que cada um se refere.\n\nAtenciosamente,\nQualidade - Milplan Engenharia\nProjeto AMR / Flotação Recleaner\n(mensagem gerada pelo Nexum – Recebimento inteligente)`;
    return { para, assunto, corpo, itens: lista.map(x => x.k) };
  }
  function registrarCobranca(f, email, por) {
    const reg = { em: new Date().toISOString(), por: por || "", para: email.para, itens: email.itens, assunto: email.assunto };
    const g = { ...f, cobrancas: [...(f.cobrancas || []), reg] };
    return marcarConferencia(g, "email", { por: por || "", qtd: email.itens.length, para: email.para.length });
  }
  function pendencias(f) {
    const p = [];
    if (!itensValidos(f).length) p.push("sem itens");
    if (itensValidos(f).some(i => exigeCert(f, i) && !temCert(i))) p.push("certificado");
    if (itensValidos(f).some(i => exigeCert(f, i) && temCert(i) && !i.certValidado)) p.push("validar certificado");
    if (itensValidos(f).some(i => i.conf === "NC")) p.push("não conformidade");
    return p;
  }

  /* Linhas do mapa (FP-11): uma por item */
  const COLS_MAPA = ["STATUS", "FICHA N°", "ITEM", "DESCRIÇÃO", "TAG", "NOTA FISCAL", "ROMANEIO", "CERTIFICADO", "UND", "QUANT RECEBIDA", "DATA RECEBIMENTO", "FORNECIMENTO", "FORNECEDOR", "LOCALIZAÇÃO/ARMAZENAMENTO", "STATUS ITEM"];
  /* Texto do certificado no relatório e no mapa */
  function textoCert(f, i) {
    if (f.tipo === "ROM") return i.certificado || "OBS 1";
    if (i.certificado) return i.certificado;
    if (i.temCertAnexo) return "RECEBIDO";
    return exigeCert(f, i) ? "PENDENTE – CERTIFICADO" : "N/A";
  }
  /* Situação do certificado de um item: nao_exige | pendente | recebido | validado */
  function certSituacao(f, i) {
    if (!exigeCert(f, i)) return temCert(i) ? (i.certValidado ? "validado" : "recebido") : "nao_exige";
    if (!temCert(i)) return "pendente";
    return i.certValidado ? "validado" : "recebido";
  }
  /* Ajusta o status da ficha conforme as pendências de certificado (não mexe em "sem ação" nem "finalizado") */
  function autoStatus(f) {
    if (f.tipo !== "NF" || f.status === "sem_acao" || f.status === "finalizado") return f;
    const pend = itensValidos(f).some(i => exigeCert(f, i) && !temCert(i));
    if (pend && f.status === "em_andamento") return { ...f, status: "cert_pendente" };
    if (!pend && f.status === "cert_pendente") return { ...f, status: "em_andamento" };
    return f;
  }
  /* Anexa certificado a um item já lançado (pelo campo ou escritório) e resolve a pendência */
  function anexarCertificado(f, idx, d, por) {
    const g = JSON.parse(JSON.stringify(f));
    const it = g.itens[idx]; if (!it) return f;
    if (d.numero) it.certificado = String(d.numero).trim().toUpperCase();
    const novos = (d.anexos || []).map((a, k) => ({ ...a, item: idx, nome: `Item ${idx + 1} · ${it.certificado ? "certificado " + it.certificado : "certificado"}${(d.anexos || []).length > 1 ? " (" + (k + 1) + ")" : ""}` }));
    if (novos.length) { it.temCertAnexo = true; g.anexos = g.anexos || {}; g.anexos.cert = [...(g.anexos.cert || []), ...novos]; }
    it.certStatus = "recebido"; it.certValidado = false;
    let h = marcarConferencia(g, "cert_recebido", { por: por || "", itensTxt: String(idx + 1) + (it.certificado ? " (" + it.certificado + ")" : "") });
    return autoStatus(h);
  }
  function linhasMapa(fichas) {
    const out = [];
    fichas.slice().sort((a, b) => a.numero - b.numero).forEach(f => {
      const its = itensValidos(f);
      const base = [STATUS[f.status]?.rotulo || "", String(f.numero)];
      if (!its.length) { out.push([...base, "", "", "", f.tipo === "ROM" ? "N/A" : f.nf, f.romaneio, "", "", "", fmtData(f.dataRecebimento), f.fornecimento, f.fornecedor, "", ""]); return; }
      its.forEach((i, n) => out.push([...base, n + 1, i.descricao, i.tag, f.tipo === "ROM" ? "N/A" : f.nf, f.romaneio, textoCert(f, i), i.und, fmtQtd(i.qtd), fmtData(f.dataRecebimento), f.fornecimento, f.fornecedor, i.local, i.conf || ""]));
    });
    return out.map(limpa);
  }
  function limpa(r) { return r.map(v => v == null ? "" : v); }
  function csvMapa(fichas) {
    const q = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
    return "﻿" + [COLS_MAPA, ...linhasMapa(fichas)].map(r => r.map(q).join(";")).join("\r\n");
  }

  /* ---------- Exemplos (dos documentos reais enviados: ficha 1609 e romaneio 1039-FLT-2026) ---------- */
  function exemplos() {
    const t = new Date().toISOString();
    const D = window.AMR_EXEMPLO_DOCS || {};
    const anexo = (k, nome) => D[k] ? [{ nome, img: D[k] }] : [];
    const nfItens = [
      ["TINTA PU - WEGPOXI CVD323 CINZA N6,5 - 12LT 3,6L - COM FDS E CERTIFICADO DE QUALIDADE", "MT08010024", "GL", 12, "3023651"],
      ["CATALISADOR TINTA - WEGPOXI CVD32 COMP. B - COM FDS E CERTIFICADO DE QUALIDADE", "MT08020001", "GL", 12, "3023651"],
      ["TINTA PU - WEGTHANE HPA 501 RT CINZA N5 - 24 LT 3,6L - COM FDS E CERTIFICADO DE QUALIDADE", "MT08010024", "GL", 24, "3023652"],
      ["CATALISADOR TINTA - W THANE 5058 COMP B - COM FDS E CERTIFICADO DE QUALIDADE", "MT08020001", "LT", 24, "3023652"],
      ["TINTA PU - LACK THANE N 2677R AZUL 2,5 PB 5/8 - 8LT 3,6L COM FDS E CERTIFICADO DE QUALIDADE", "MT08010024", "GL", 8, "3023648"],
      ["CATALISADOR TINTA - W THANE 5013 COMP B - COM FDS E CERTIFICADO DE QUALIDADE", "MT08020001", "LT", 8, "3023647"]
    ].map(([descricao, tag, und, qtd, certificado], n) => ({ descricao, tag, und, qtd, certificado, certValidado: true, local: "ALMOXARIFADO", conf: "C",
      pc: "004166", itemPc: String(n + 1).padStart(4, "0"), qtdPedido: [43.2, 12, 86.4, 24, 28.8, 8][n], undPedido: ["L", "UN", "L", "UN", "L", "UN"][n], origem: "diligenciamento" }));
    const pendItens = [
      ["PARAFUSO SEXTAVADO 3/4\" X 2.1/2\" ASTM A325 GALVANIZADO A FOGO", "MT02080003", "PÇ", 200, "CQ-88412", true],
      ["ELETRODO E7018 4MM EMBALADO A VACUO", "MT02060005", "KG", 50, "", false],
      ["CHUMBADOR QUIMICO 5/8\" X 7.5/8\"", "MT02040006", "PÇ", 24, "", false],
      ["FLANGE DE ENCAIXE 3\" 150# ASME B16.5", "MT09030041", "UN", 10, "", false],
      ["LUVA DE SEGURANÇA VAQUETA", "ES01020011", "PAR", 20, "", false]
    ].map(([descricao, tag, und, qtd, certificado, val], n) => ({ descricao, tag, und, qtd, certificado, certValidado: val, local: "ALMOXARIFADO", conf: "C", pc: "000999", itemPc: String(n + 1).padStart(4, "0"), qtdPedido: qtd, undPedido: und, origem: "diligenciamento" }));
    const romItens = [
      ["CHAPA DE PISO - C-1501-C-54-A-1597", "5858-0415-1458 B1", 1],
      ["VIGA - C-1751-C-255-A-203", "5858-0415-1439 A1", 7],
      ["CONTR. HORIZONTAL - C-1860 L-64 A-64", "5858-0415-1447 M1", 1],
      ["VIGA - C-4741-102-A-203", "5858-0415-1440 B1", 5],
      ["CONTR. HORIZONTAL - C-1841 L-64 A-64", "5858-0415-1447 L1", 1],
      ["CONTR. HORIZONTAL - C-1721 L-64 A-64", "5858-0415-1447 K1", 0],
      ["VIGA - C-4741-175 A-203", "5858-0415-1439 H1", 1]
    ].map(([descricao, tag, qtd]) => ({ descricao, tag, und: "PÇ", qtd, certificado: "", local: "PLATÔ-13", conf: "C" }));
    return [
      { id: "ex-1609", exemplo: true, numero: 1609, tipo: "NF", nf: "10990", serie: "1", cnpjFornecedor: "60.621.141/0007-49", chaveNFe: "31260860621141000749550010000109901797053194", romaneio: "4166-REV-00", pedido: "004166", fornecedor: "WEG TINTAS", fornecimento: "MILPLAN ENGENHARIA", dataRecebimento: "2026-08-15", status: "finalizado", itens: nfItens, observacao: "", assinaturas: { producao: { em: "2026-08-19" }, qualidade: { em: "2026-08-19" }, fiscalizacao: { em: "2026-10-14" } }, anexos: { doc: anexo("nf", "DANFE NF 10990"), cert: anexo("cert", "Certificado 3023651") }, conferencia: { situacao: "aprovada", historico: [{ acao: "enviada", em: "2026-08-15T12:00:00Z", por: "Campo" }, { acao: "aprovada", em: "2026-08-16T12:00:00Z", por: "Qualidade" }] }, origem: "campo", criadoPor: "Exemplo", criadoEm: t, atualizadoEm: t },
      { id: "ex-2289", exemplo: true, numero: 2289, tipo: "NF", nf: "123456", serie: "1", romaneio: "999-REV-00", pedido: "000999", fornecedor: "FORNECEDOR EXEMPLO LTDA", fornecimento: "MILPLAN ENGENHARIA", dataRecebimento: hoje(), status: "cert_pendente", itens: pendItens, observacao: "", assinaturas: {}, anexos: { doc: [], cert: [] }, conferencia: { situacao: "pendente", historico: [{ acao: "enviada", em: t, por: "Campo" }] }, origem: "campo", criadoPor: "Exemplo", criadoEm: t, atualizadoEm: t },
      { id: "ex-2290", exemplo: true, numero: 2290, tipo: "ROM", nf: "", romaneio: "1039-FLT-2026", pedido: "", fornecedor: "ANGLO AMERICAN", fornecimento: "ANGLO AMERICAN", dataRecebimento: hoje(), status: "em_andamento", itens: romItens, observacao: OBS_ANGLO, assinaturas: {}, anexos: { doc: anexo("rom", "Romaneio 1039-FLT-2026"), cert: [] }, conferencia: { situacao: "pendente", historico: [{ acao: "enviada", em: t, por: "Campo" }] }, origem: "campo", criadoPor: "Exemplo", criadoEm: t, atualizadoEm: t }
    ];
  }

  /* ---------- Armazenamento local (etapa 1): IndexedDB (cabe o histórico inteiro) + cópia no localStorage quando pequena ---------- */
  const KEY = "amr_recebimento_fichas_v5";
  const ouvintes = new Set();
  let cache = null, pronto = false;
  const canal = (() => { try { return new BroadcastChannel("nexum-fichas"); } catch (e) { return null; } })();
  function idb() {
    return new Promise((res, rej) => { if (!window.indexedDB) return rej(new Error("sem IndexedDB"));
      const r = indexedDB.open("nexum", 1); r.onupgradeneeded = () => r.result.createObjectStore("kv"); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  }
  async function idbGet(k) { const db = await idb(); return new Promise((res, rej) => { const t = db.transaction("kv").objectStore("kv").get(k); t.onsuccess = () => res(t.result); t.onerror = () => rej(t.error); }); }
  async function idbPut(k, v) { const db = await idb(); return new Promise((res, rej) => { const t = db.transaction("kv", "readwrite"); t.objectStore("kv").put(v, k); t.oncomplete = () => res(); t.onerror = () => rej(t.error); }); }
  function lerLS() { try { const s = localStorage.getItem(KEY); return s ? JSON.parse(s) : null; } catch (e) { return null; } }
  function ler() { return cache || []; }
  let gravando = Promise.resolve();
  function gravar() {
    const snap = cache;
    try { const j = JSON.stringify(snap); if (j.length < 1500000) localStorage.setItem(KEY, j); else localStorage.removeItem(KEY); } catch (e) { try { localStorage.removeItem(KEY); } catch (_) { } }
    gravando = gravando.then(() => idbPut(KEY, snap)).catch(() => { }).then(() => { try { canal && canal.postMessage("mudou"); } catch (e) { } });
    return gravando;
  }
  function avisar() { const l = ler().slice(); ouvintes.forEach(fn => { try { fn(l); } catch (e) { } }); }
  const carregado = (async () => {
    let d = null;
    try { d = await idbGet(KEY); } catch (e) { }
    if (!d) d = lerLS();
    cache = d || exemplos(); pronto = true;
    if (!d) gravar(); else if (!(await idbGet(KEY).catch(() => null))) gravar();
    avisar();
  })();
  async function recarregar() { try { const d = await idbGet(KEY); if (d) { cache = d; avisar(); } } catch (e) { const d = lerLS(); if (d) { cache = d; avisar(); } } }
  if (canal) canal.onmessage = () => recarregar();
  window.addEventListener("storage", e => { if (e.key === KEY) recarregar(); });

  const store = {
    modo: "exemplo",
    carregado,
    ouvir(fn) { ouvintes.add(fn); if (pronto) fn(ler().slice()); return () => ouvintes.delete(fn); },
    async salvar(f) {
      await carregado;
      f = autoStatus(f); f.contrato = ctrDe(f);
      const todas = ler();
      const dup = duplicada(f, todas);
      if (dup) { const e = new Error(msgDuplicada(f, dup)); e.code = "duplicada"; e.outra = dup; throw e; }
      const agora = new Date().toISOString();
      const i = todas.findIndex(o => o.id === f.id);
      if (i >= 0) todas[i] = { ...todas[i], ...f, atualizadoEm: agora };
      else { f.id = f.id || "f" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); f.numero = f.numero || proximoNumero(todas, cadastros.fichaInicial(), f.contrato); f.criadoEm = agora; f.atualizadoEm = agora; todas.push(f); }
      gravar(); avisar(); return f;
    },
    /* grava várias fichas de uma vez (preenchimento automático) sem checar duplicidade */
    async salvarVarias(lista) {
      await carregado; const agora = new Date().toISOString(), idx = new Map(ler().map((f, i) => [f.id, i]));
      lista.forEach(f => { const i = idx.get(f.id); if (i !== undefined) cache[i] = { ...cache[i], ...autoStatus(f), atualizadoEm: agora }; });
      await gravar(); avisar();
    },
    /* importação do histórico (FP-11): substitui o que já tinha sido importado daquele contrato e tira os exemplos */
    async importar(contrato, lista) {
      await carregado;
      cache = ler().filter(f => !f.exemplo && !(ctrDe(f) === contrato && f.importado)).concat(lista.map(f => ({ ...f, contrato })));
      await gravar(); avisar(); return lista.length;
    },
    async excluir(id) { await carregado; cache = ler().filter(f => f.id !== id); gravar(); avisar(); },
    async restaurarExemplos() { cache = exemplos(); gravar(); avisar(); }
  };

  /* ---------- Conferência ---------- */
  function conf(f) { return f.conferencia || { situacao: "pendente", historico: [] }; }
  function marcarConferencia(f, acao, dados) {
    const c = conf(f), ev = { acao, em: new Date().toISOString(), por: dados?.por || "", ...(dados || {}) };
    const nova = { ...c, historico: [...(c.historico || []), ev] };
    if (acao === "aprovada") Object.assign(nova, { situacao: "aprovada", motivos: [], itens: [], comentario: "" });
    if (acao === "devolvida") Object.assign(nova, { situacao: "devolvida", motivos: dados.motivos || [], itens: dados.itens || [], comentario: dados.comentario || "" });
    if (acao === "enviada" || acao === "reenviada") Object.assign(nova, { situacao: "pendente" });
    return { ...f, conferencia: nova };
  }

  /* ---------- Cadastros: fornecedores e grupos de e-mail ---------- */
  const KEY_CAD = "amr_recebimento_cadastros_v2";
  const GRUPOS = { suprimentos: "Suprimentos", logistica: "Logística", qualidade: "Qualidade", planejamento: "Planejamento" };
  const ouvCad = new Set();
  let cad = null;
  function lerCad() {
    if (cad) return cad;
    try { const s = localStorage.getItem(KEY_CAD); cad = s ? JSON.parse(s) : null; } catch (e) { cad = null; }
    if (!cad) {
      cad = { fornecedores: [{ id: "weg", nome: "WEG TINTAS", cnpj: "60.621.141/0007-49", codigoErp: "222796", emails: [], exemplo: true }],
              grupos: { suprimentos: [], logistica: [], qualidade: [], planejamento: [] }, fichaInicial: FICHA_INICIAL, responsavel: "MARCOS SILVA", projetoCliente: "" };
      gravarCad();
    }
    if (cad.responsavel === undefined) cad.responsavel = "MARCOS SILVA";
    if (cad.projetoCliente === undefined) cad.projetoCliente = "";
    cad.grupos = cad.grupos || {}; Object.keys(GRUPOS).forEach(k => { cad.grupos[k] = cad.grupos[k] || []; });
    return cad;
  }
  function gravarCad(semNuvem) { try { localStorage.setItem(KEY_CAD, JSON.stringify(cad)); } catch (e) { } if (!semNuvem && window.NXNUVEM) window.NXNUVEM.salvarCad(cad); }
  function avisarCad() { const c = JSON.parse(JSON.stringify(lerCad())); ouvCad.forEach(fn => { try { fn(c); } catch (e) { } }); }
  window.addEventListener("storage", e => { if (e.key === KEY_CAD) { cad = null; avisarCad(); } });
  const emailOk = s => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s).trim());
  const cadastros = {
    _substituir(c) { if (!c || JSON.stringify(c) === JSON.stringify(cad)) return; cad = c; lerCad(); gravarCad(true); avisarCad(); },
    ouvir(fn) { ouvCad.add(fn); fn(JSON.parse(JSON.stringify(lerCad()))); return () => ouvCad.delete(fn); },
    async salvarFornecedor(f) {
      const c = lerCad(); f.nome = norm(f.nome);
      if (!f.nome) throw new Error("Informe o nome do fornecedor.");
      if (c.fornecedores.some(o => o.id !== f.id && normForn(o.nome) === normForn(f.nome))) throw new Error("Esse fornecedor já está cadastrado.");
      f.emails = (f.emails || []).map(s => s.trim().toLowerCase()).filter(Boolean);
      const bad = f.emails.find(s => !emailOk(s)); if (bad) throw new Error("E-mail inválido: " + bad);
      const i = c.fornecedores.findIndex(o => o.id === f.id);
      if (i >= 0) c.fornecedores[i] = { ...c.fornecedores[i], ...f, exemplo: false }; else { f.id = "fo" + Date.now().toString(36); c.fornecedores.push(f); }
      gravarCad(); avisarCad();
    },
    async excluirFornecedor(id) { const c = lerCad(); c.fornecedores = c.fornecedores.filter(f => f.id !== id); gravarCad(); avisarCad(); },
    async salvarGrupo(k, emails) {
      const c = lerCad(); const l = emails.map(s => s.trim().toLowerCase()).filter(Boolean);
      const bad = l.find(s => !emailOk(s)); if (bad) throw new Error("E-mail inválido: " + bad);
      c.grupos[k] = [...new Set(l)]; gravarCad(); avisarCad();
    },
    async salvarFichaInicial(n) { const c = lerCad(); c.fichaInicial = Math.max(1, parseInt(n, 10) || FICHA_INICIAL); gravarCad(); avisarCad(); },
    fichaInicial() { return lerCad().fichaInicial || FICHA_INICIAL; },
    async salvarDocumento(d) { const c = lerCad(); c.responsavel = norm(d.responsavel); c.projetoCliente = String(d.projetoCliente || "").trim(); gravarCad(); avisarCad(); },
    documento() { const c = lerCad(); return { responsavel: c.responsavel, projetoCliente: c.projetoCliente }; },
    fornecedorPorCnpj(cnpj) { const c = soCnpj(cnpj); return c ? lerCad().fornecedores.find(f => soCnpj(f.cnpj) === c) || null : null; },
    fornecedorPorNome(nome) { const n = normForn(nome); return lerCad().fornecedores.find(f => normForn(f.nome) === n) || null; }
  };
  /* Destinatários do aviso de certificado pendente (envio real na etapa 5) */
  function destinatariosCertPendente(f) {
    if (f.tipo !== "NF") return [];
    const c = lerCad(), fo = cadastros.fornecedorPorNome(f.fornecedor);
    return [...new Set([...(fo?.emails || []), ...Object.keys(GRUPOS).flatMap(k => c.grupos[k] || [])])];
  }

  window.AMR = { CONTRATOS, ctrDe, textoCert, certSituacao, autoStatus, anexarCertificado, temCert, CMC, LEGENDA_CMC, materialCritico, exigeCert, STATUS_ITEM, statusItem, semCertificado, pendentesDeCobranca, montarEmailCobranca, registrarCobranca, registrar: marcarConferencia, lerChaveNFe, soCnpj, MOTIVOS, CONFER, conf, marcarConferencia, GRUPOS, cadastros, destinatariosCertPendente, emailOk, CONTRATO, OBRA, ESCOPO, DOC_FICHA, DOC_MAPA, FICHA_INICIAL, TIPOS, STATUS, ORDEM_STATUS, CONF, UNIDADES, OBS_ANGLO, COLS_MAPA,
    norm, normForn, hoje, fmtData, fmtQtd, chaveDoc, duplicada, msgDuplicada, proximoNumero, itensValidos, pendencias, linhasMapa, csvMapa, store };
})();
