/* Nexum — assistente de controle: avisos e lembretes automáticos no lugar da frase de boas-vindas.
   Cada aviso: { nivel: "crit"|"warn"|"info"|"ok", texto, acao? }. Os mais urgentes vêm primeiro. */
(function () {
  const A = () => window.AMR;
  const DIA = 864e5;
  const dias = iso => { if (!iso) return 0; const d = new Date(String(iso).length === 10 ? iso + "T12:00:00" : iso); return isNaN(d) ? 0 : Math.max(0, Math.floor((Date.now() - d) / DIA)); };
  const pl = (n, s, p) => `${n.toLocaleString("pt-BR")} ${n === 1 ? s : p}`;
  const hora = () => new Date().getHours();
  const PRIO = { crit: 0, warn: 1, info: 2, ok: 3 };

  /* ---------- escritório ---------- */
  function escritorio(o) {
    const a = A(), L = [], F = o.fichas.filter(f => !f.lacuna && !f.exemplo), ativas = F.filter(f => f.status !== "finalizado" && f.status !== "sem_acao");
    const go = o.ir || {};
    /* certificados */
    const pend = F.flatMap(f => a.itensValidos(f).map(i => ({ f, i })).filter(x => a.certSituacao(x.f, x.i) === "pendente"));
    if (pend.length) {
      const velhos = pend.filter(x => dias(x.f.dataRecebimento) >= 7), maisVelho = pend.slice().sort((x, y) => dias(y.f.dataRecebimento) - dias(x.f.dataRecebimento))[0];
      if (velhos.length) L.push({ nivel: "crit", texto: `${pl(velhos.length, "certificado está pendente", "certificados estão pendentes")} há mais de 7 dias. O mais antigo é da ficha ${maisVelho.f.numero} (${maisVelho.f.fornecedor || "sem fornecedor"}, ${pl(dias(maisVelho.f.dataRecebimento), "dia", "dias")}).`, acao: go.certs });
      else L.push({ nivel: "warn", texto: `${pl(pend.length, "item aguarda", "itens aguardam")} certificado. Acompanhe para não passar de 7 dias.`, acao: go.certs });
    }
    const grupos = a.cobrancasPorFornecedor ? a.cobrancasPorFornecedor(F, 5) : [];
    if (grupos.length) { const ref = grupos.filter(g => g.reforco).length; L.push({ nivel: ref ? "crit" : "warn", texto: `${pl(grupos.length, "e-mail de cobrança está pronto", "e-mails de cobrança estão prontos")} para enviar (${grupos.map(g => g.fornecedor).slice(0, 3).join(", ")}${grupos.length > 3 ? "…" : ""})${ref ? `, ${ref} para reforçar` : ""}. É só abrir no Outlook e enviar.`, acao: go.certs }); }
    const cobrancaSemRetorno = F.filter(f => f.status !== "finalizado" && (f.cobrancas || []).length && a.semCertificado(f).length).map(f => ({ f, d: dias(f.cobrancas[f.cobrancas.length - 1].em) })).filter(x => x.d >= 5).sort((x, y) => y.d - x.d);
    if (false && cobrancaSemRetorno.length) { const x = cobrancaSemRetorno[0]; L.push({ nivel: "crit", texto: `Cobrança de certificado ${x.f.fornecedor ? "à " + x.f.fornecedor + " " : ""}enviada há ${pl(x.d, "dia", "dias")} e ainda sem retorno (ficha ${x.f.numero}). Vale reforçar.${cobrancaSemRetorno.length > 1 ? ` Mais ${cobrancaSemRetorno.length - 1} na mesma situação.` : ""}`, acao: go.certs }); }
    const aValidar = F.reduce((s, f) => s + a.itensValidos(f).filter(i => a.certSituacao(f, i) === "recebido").length, 0);
    if (aValidar) L.push({ nivel: "info", texto: `${pl(aValidar, "certificado chegou e aguarda", "certificados chegaram e aguardam")} validação da Qualidade.`, acao: go.certsValidar || go.certs });
    /* conferência */
    const aConf = ativas.filter(f => a.conf(f).situacao === "pendente").map(f => ({ f, d: dias(f.criadoEm || f.dataRecebimento) })).sort((x, y) => y.d - x.d);
    if (aConf.length) L.push({ nivel: aConf[0].d >= 2 ? "warn" : "info", texto: `${pl(aConf.length, "ficha do campo aguarda", "fichas do campo aguardam")} conferência${aConf[0].d >= 1 ? `; a mais antiga há ${pl(aConf[0].d, "dia", "dias")} (ficha ${aConf[0].f.numero})` : ""}.`, acao: go.conferir });
    /* não conformidade */
    const nc = ativas.filter(f => a.pendencias(f).includes("não conformidade"));
    if (nc.length) L.push({ nivel: "crit", texto: `${pl(nc.length, "ficha tem", "fichas têm")} item não conforme sem tratativa (ficha ${nc.map(f => f.numero).slice(0, 3).join(", ")}).`, acao: go.fichas });
    /* fichas paradas */
    const paradas = ativas.filter(f => dias(f.dataRecebimento) >= 10);
    if (paradas.length) L.push({ nivel: "warn", texto: `${pl(paradas.length, "ficha está em aberto", "fichas estão em aberto")} há mais de 10 dias. Veja o que falta para finalizar.`, acao: go.fichas });
    /* fichas sem itens / informações faltando */
    const semItens = ativas.filter(f => !a.itensValidos(f).length && !f.importado);
    if (semItens.length) L.push({ nivel: "warn", texto: `${pl(semItens.length, "ficha chegou", "fichas chegaram")} sem itens (ficha ${semItens.map(f => f.numero).slice(0, 3).join(", ")}). ${o.dilig && o.dilig.conectado ? "Ainda não aparecem no Diligenciamento." : "Conecte a planilha de Diligenciamento para completar."}`, acao: go.fichas });
    if (o.faltando) L.push({ nivel: "info", texto: `${pl(o.faltando, "informação está faltando", "informações estão faltando")} nas fichas. Complete para o mapa sair certo.`, acao: go.pend });
    if (o.autoRevisar) L.push({ nivel: "info", texto: `${pl(o.autoRevisar, "informação foi preenchida", "informações foram preenchidas")} automaticamente e aguardam sua revisão.`, acao: go.pendAuto || go.pend });
    if (o.lacunas) L.push({ nivel: "info", texto: `${pl(o.lacunas, "número de ficha ficou", "números de ficha ficaram")} sem lançamento no mapa. Lance ou marque como cancelado.`, acao: go.lacunas || go.pend });
    /* diligenciamento */
    if (o.admin && o.dilig) {
      if (!o.dilig.conectado) L.push({ nivel: "warn", texto: "A planilha de Diligenciamento não está conectada neste computador. As fichas do campo não serão completadas automaticamente.", acao: go.cadastros });
      else {
        const idade = dias(o.dilig.modificado);
        if (idade >= 3) L.push({ nivel: "warn", texto: `A planilha de Diligenciamento é de ${new Date(o.dilig.modificado).toLocaleDateString("pt-BR")} (${pl(idade, "dia", "dias")} atrás). Pode estar desatualizada.`, acao: go.cadastros });
        const agu = F.filter(f => f.diligCompletado && f.diligCompletado.resultado === "aguardando" && f.status !== "finalizado").length;
        if (agu) L.push({ nivel: "info", texto: `${pl(agu, "NF ainda não aparece", "NFs ainda não aparecem")} no Diligenciamento (aguardando pré-nota). O Nexum tenta de novo a cada planilha nova.`, acao: go.fichas });
      }
    }
    /* momento do dia */
    const hoje = F.filter(f => (f.dataRecebimento || "") === a.hoje());
    if (hora() >= 16) { const hojeConf = hoje.filter(f => a.conf(f).situacao === "pendente" && f.status !== "finalizado"); if (hojeConf.length) L.push({ nivel: "warn", texto: `Antes de encerrar o dia: ${pl(hojeConf.length, "ficha de hoje ainda não foi conferida", "fichas de hoje ainda não foram conferidas")}.`, acao: go.conferir }); }
    if (hora() >= 11 && hora() < 18 && !hoje.length && o.ativo) L.push({ nivel: "info", texto: "Nenhum recebimento lançado hoje até agora." });
    return fechar(L, "Tudo em dia: nenhuma pendência de certificado, conferência ou informação. 👏");
  }

  /* ---------- celular (campo) ---------- */
  function campo(o) {
    const a = A(), L = [], F = o.fichas, go = o.ir || {}, hoje = F.filter(f => o.deHoje(f));
    const pend = o.pendCert || [];
    if (pend.length) { const v = pend.slice().sort((x, y) => dias(y.f.dataRecebimento) - dias(x.f.dataRecebimento))[0]; L.push({ nivel: dias(v.f.dataRecebimento) >= 7 ? "crit" : "warn", texto: `${pl(pend.length, "item aguarda", "itens aguardam")} certificado. Se chegou na obra, fotografe agora${dias(v.f.dataRecebimento) >= 1 ? ` (o mais antigo é da ficha ${v.f.numero ?? "—"}, há ${pl(dias(v.f.dataRecebimento), "dia", "dias")})` : ""}.`, acao: go.cert }); }
    const semSinal = F.filter(f => f.numeroPendente);
    if (semSinal.length) L.push({ nivel: "warn", texto: `${pl(semSinal.length, "ficha aguarda", "fichas aguardam")} sinal de internet para sincronizar e receber o número.` });
    const semFotoNF = hoje.filter(f => f.tipo === "NF" && !(f.anexos && (f.anexos.doc || []).some(a => !a.pc)));
    if (semFotoNF.length) L.push({ nivel: "warn", texto: `${pl(semFotoNF.length, "ficha de hoje foi enviada", "fichas de hoje foram enviadas")} sem foto da NF (ficha ${semFotoNF.map(f => f.numero ?? "—").slice(0, 3).join(", ")}).` });
    const semLocal = hoje.filter(f => a.itensValidos(f).some(i => !i.local));
    if (semLocal.length) L.push({ nivel: "info", texto: `Em ${pl(semLocal.length, "ficha de hoje", "fichas de hoje")}, há item sem local de armazenamento informado.` });
    const nc = hoje.filter(f => a.itensValidos(f).some(i => i.conf === "NC"));
    if (nc.length) L.push({ nivel: "crit", texto: `Item não conforme registrado hoje (ficha ${nc.map(f => f.numero ?? "—").join(", ")}). Fotografe e avise a Qualidade.` });
    if (hora() < 10 && !hoje.length) L.push({ nivel: "info", texto: "Bom trabalho! No recebimento, fotografe a NF e os certificados: o escritório completa o resto." });
    if (hora() >= 15 && !hoje.length) L.push({ nivel: "info", texto: "Nenhum recebimento lançado hoje até agora." });
    if (hora() >= 16 && hoje.length) L.push({ nivel: "ok", texto: `Hoje: ${pl(hoje.length, "ficha lançada", "fichas lançadas")}. Confira se ficou algum material sem registrar antes de encerrar.` });
    return fechar(L, "Tudo em dia por aqui. Nenhum certificado pendente. 👏");
  }

  function fechar(L, okTxt) { L.sort((x, y) => PRIO[x.nivel] - PRIO[y.nivel]); return L.length ? L : [{ nivel: "ok", texto: okTxt }]; }

  /* ---------- área que alterna os avisos ---------- */
  const estado = new WeakMap();
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  function mostrar(el, msgs) {
    if (!el) return;
    let st = estado.get(el);
    if (!st) { st = { i: 0, msgs: [], t: null, pausa: false }; estado.set(el, st); el.classList.add("nx-assist");
      el.addEventListener("mouseenter", () => st.pausa = true); el.addEventListener("mouseleave", () => st.pausa = false);
      st.t = setInterval(() => { if (!st.pausa && st.msgs.length > 1 && !document.hidden) { st.i = (st.i + 1) % st.msgs.length; desenhar(el, st); } }, 7000); }
    const chave = JSON.stringify(msgs.map(m => m.texto));
    if (chave !== st.chave) { st.chave = chave; st.msgs = msgs; if (st.i >= msgs.length) st.i = 0; desenhar(el, st); }
  }
  function desenhar(el, st) {
    const m = st.msgs[st.i]; if (!m) return;
    el.innerHTML = `<span class="as-msg as-${m.nivel}" role="status"><span class="as-dot"></span><span class="as-tx">${esc(m.texto)}</span>${m.acao ? '<span class="as-go">Ver →</span>' : ""}</span>${st.msgs.length > 1 ? `<span class="as-nav">${st.msgs.map((_, k) => `<button type="button" class="as-pt${k === st.i ? " on" : ""}" data-k="${k}" aria-label="Aviso ${k + 1} de ${st.msgs.length}"></button>`).join("")}</span>` : ""}`;
    const msg = el.querySelector(".as-msg");
    if (m.acao) { msg.style.cursor = "pointer"; msg.onclick = () => m.acao(); }
    el.querySelectorAll(".as-pt").forEach(b => b.onclick = e => { e.stopPropagation(); st.i = +b.dataset.k; desenhar(el, st); });
  }
  window.NXASSIST = { escritorio, campo, mostrar };
})();
