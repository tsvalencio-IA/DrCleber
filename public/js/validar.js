const cfg = window.APP_CONFIG;
firebase.initializeApp(cfg.firebaseConfig);
const db = firebase.database();

const $ = (s) => document.querySelector(s);
function param(name){ return new URLSearchParams(location.search).get(name) || ""; }
function fmtDate(iso){ try { return new Date(iso).toLocaleString("pt-BR"); } catch { return iso || "-"; } }
function safe(v){ return String(v ?? "").replace(/[<>]/g, ""); }
function statusBadge(status){
  const cls = status === "CANCELADA" ? "red" : String(status).includes("ASSINADA") ? "green" : "amber";
  return `<span class="badge ${cls}">${safe(status || "NÃO ENCONTRADA")}</span>`;
}
async function carregar(){
  const id = param("id").trim();
  if (!id) {
    $("#result").innerHTML = `<div class="notice warn">Informe o ID da receita na URL. Exemplo: validar.html?id=RX-...</div>`;
    return;
  }
  $("#rid").textContent = id;
  const snap = await db.ref(`receitasPublicas/${id}`).get();
  if (!snap.exists()) {
    $("#result").innerHTML = `<div class="notice danger">Receita não encontrada no registro público deste sistema.</div>`;
    return;
  }
  const r = snap.val();
  const signed = String(r.status || "").includes("ASSINADA") && r.pdfAssinadoUrl;
  $("#result").innerHTML = `
    <div class="card">
      <h2>Resultado da validação</h2>
      <p>${statusBadge(r.status)}</p>
      <div class="grid">
        <div class="field"><label>ID</label><input readonly value="${safe(r.id)}"></div>
        <div class="field"><label>Tipo</label><input readonly value="${safe(r.tipo)}"></div>
        <div class="field"><label>Emissão</label><input readonly value="${fmtDate(r.dataEmissao)}"></div>
        <div class="field"><label>Assinada em</label><input readonly value="${fmtDate(r.assinadaEm)}"></div>
        <div class="field"><label>Cirurgião-dentista</label><input readonly value="${safe(r.medicoNome)}"></div>
        <div class="field"><label>CRO</label><input readonly value="${safe(r.medicoCrm)}/${safe(r.medicoUf)}"></div>
        <div class="field"><label>Paciente</label><input readonly value="${safe(r.pacienteIniciais)} · CPF ${safe(r.pacienteCpfMascara)}"></div>
        <div class="field"><label>Hash SHA-256 do PDF assinado</label><input readonly value="${safe(r.hashSha256 || "não informado")}"></div>
      </div>
      <div class="notice ${signed ? "" : "warn"}">
        ${signed ? "Há um PDF assinado anexado ao registro e armazenado no Cloudinary. Baixe o PDF original assinado e valide a assinatura digital em validador oficial ICP-Brasil." : "Esta receita ainda não possui PDF ICP assinado anexado ao registro. Não trate como receita digital ICP finalizada."}
      </div>
      <div class="actions">
        ${signed ? `<a class="btn green" target="_blank" href="${safe(r.pdfAssinadoUrl)}">Baixar PDF assinado ICP</a>` : ""}
        <a class="btn ghost" target="_blank" href="https://validar.iti.gov.br/">Validar assinatura no ITI</a>
      </div>
    </div>
  `;
}
document.addEventListener("DOMContentLoaded", carregar);
