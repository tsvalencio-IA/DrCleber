/* Receita Odontológica Digital — MVP GitHub Pages + Firebase
   IMPORTANTE: este frontend NÃO assina ICP automaticamente.
   Fluxo válido no MVP: gerar PDF eletrônico -> cirurgião-dentista assina em assinador ICP externo -> sobe o PDF assinado -> QR valida registro e entrega o PDF original assinado para conferência no ITI/CFO.
*/

const cfg = window.APP_CONFIG;
firebase.initializeApp(cfg.firebaseConfig);
const auth = firebase.auth();
const db = firebase.database();

let currentUser = null;
let medicoPerfil = null;
let pacientesCache = {};
let receitasCache = {};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));
const uidAutorizado = cfg.dentistaUidAutorizado;

function safeText(value, fallback = "") {
  return String(value ?? fallback).replace(/[<>]/g, "");
}

function onlyDigits(v) {
  return String(v || "").replace(/\D+/g, "");
}

function nowIso() {
  return new Date().toISOString();
}

function fmtDate(iso) {
  if (!iso) return "-";
  try {
    return new Date(iso).toLocaleString("pt-BR");
  } catch {
    return iso;
  }
}

function maskCpf(cpf) {
  const d = onlyDigits(cpf);
  if (d.length !== 11) return "***";
  return `${d.slice(0, 3)}.***.***-${d.slice(9)}`;
}

function initials(name) {
  return (
    String(name || "Paciente")
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join("") || "P"
  );
}

function validationBase() {
  if (cfg.validationBaseUrl) return cfg.validationBaseUrl.replace(/\/$/, "");
  const path = location.pathname.replace(/\/index\.html$/, "").replace(/\/$/, "");
  return `${location.origin}${path}`;
}

function validationUrl(receitaId) {
  return `${validationBase()}/validar.html?id=${encodeURIComponent(receitaId)}`;
}

function receitaId() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  return `RX-${stamp}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

function setStatus(msg, type = "blue") {
  const box = $("#statusBox");
  if (!box) return;

  box.className = `notice ${type === "danger" ? "danger" : type === "warn" ? "warn" : ""}`;
  box.textContent = msg;
  box.classList.remove("hidden");

  setTimeout(() => box.classList.add("hidden"), 7000);
}

/*
  CORREÇÃO PRINCIPAL:
  Firebase Realtime Database NÃO aceita undefined.
  Esta função remove qualquer campo undefined antes de salvar.
*/
function cleanForFirebase(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;

  if (Array.isArray(value)) {
    return value.map((item) => {
      const cleaned = cleanForFirebase(item);
      return cleaned === undefined ? null : cleaned;
    });
  }

  if (typeof value === "object") {
    const out = {};

    Object.entries(value).forEach(([key, val]) => {
      const cleaned = cleanForFirebase(val);
      if (cleaned !== undefined) {
        out[key] = cleaned;
      }
    });

    return out;
  }

  return value;
}

function showAuth(show) {
  $("#loginView").classList.toggle("hidden", show);
  $("#appView").classList.toggle("hidden", !show);
}

function activateTab(name) {
  $$(".tab-btn").forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
  $$(".tab-panel").forEach((p) => p.classList.toggle("hidden", p.id !== `tab-${name}`));
}

async function sha256File(fileOrBlob) {
  const buffer = await fileOrBlob.arrayBuffer();
  const hash = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function cloudinaryReady() {
  const c = cfg.cloudinary || {};
  return Boolean(
    c.cloudName &&
      c.uploadPreset &&
      !String(c.cloudName).includes("COLE_") &&
      !String(c.uploadPreset).includes("COLE_")
  );
}

function assertCloudinaryReady() {
  if (!cloudinaryReady()) {
    throw new Error("Cloudinary não configurado. Abra public/js/firebase-config.js e preencha cloudName e uploadPreset unsigned.");
  }
}

function sanitizePublicId(value) {
  return String(value || "arquivo")
    .replace(/[^a-zA-Z0-9_\-\/]/g, "_")
    .replace(/_+/g, "_");
}

async function uploadPdfCloudinary(fileOrBlob, { receitaId, tipo }) {
  assertCloudinaryReady();

  const c = cfg.cloudinary;
  const resourceType = c.resourceType || "raw";
  const endpoint = `https://api.cloudinary.com/v1_1/${encodeURIComponent(c.cloudName)}/${encodeURIComponent(resourceType)}/upload`;

  const form = new FormData();
  const filename = `${receitaId}-${tipo}.pdf`;

  const file =
    fileOrBlob instanceof File
      ? fileOrBlob
      : new File([fileOrBlob], filename, { type: "application/pdf" });

  form.append("file", file);
  form.append("upload_preset", c.uploadPreset);
  form.append("public_id", sanitizePublicId(`${receitaId}-${tipo}`));

  if (c.folder) {
    form.append("folder", sanitizePublicId(c.folder));
  }

  form.append("tags", "receita_odontologica_digital,icp_mvp");
  form.append("context", `receitaId=${receitaId}|tipo=${tipo}|app=${cfg.appName || "Receita Odontológica Digital"}`);

  const resp = await fetch(endpoint, {
    method: "POST",
    body: form
  });

  const data = await resp.json().catch(() => ({}));

  if (!resp.ok) {
    const msg = data?.error?.message || `Erro Cloudinary HTTP ${resp.status}`;
    throw new Error(`Falha no upload para Cloudinary: ${msg}`);
  }

  /*
    Cloudinary em upload RAW/PDF pode não retornar format.
    Antes estava salvando format: undefined e quebrava o Firebase.
  */
  return cleanForFirebase({
    secureUrl: data.secure_url || "",
    publicId: data.public_id || "",
    assetId: data.asset_id || "",
    resourceType: data.resource_type || resourceType || "raw",
    format: data.format || "pdf",
    bytes: data.bytes || file.size || 0,
    createdAt: data.created_at || nowIso()
  });
}

async function signIn() {
  const email = $("#loginEmail").value.trim();
  const senha = $("#loginSenha").value;

  if (!email || !senha) {
    return setStatus("Informe e-mail e senha.", "warn");
  }

  try {
    await auth.signInWithEmailAndPassword(email, senha);
  } catch (e) {
    setStatus(`Erro no login: ${e.message}`, "danger");
  }
}

async function signOut() {
  await auth.signOut();
}

async function loadMedicoPerfil() {
  const ref = db.ref(`dentistas/${currentUser.uid}/perfil`);
  const snap = await ref.get();

  if (snap.exists()) {
    medicoPerfil = snap.val();
  } else {
    medicoPerfil = {
      nome: "Dr(a). Cirurgião-dentista Responsável",
      cro: "000000",
      uf: "SP",
      rqe: "",
      clinica: "Clínica / Consultório Odontológico",
      telefone: "",
      endereco: "",
      rodape: "Documento eletrônico gerado pelo sistema Receita Odontológica Digital. Assinatura ICP-Brasil deve ser validada no PDF assinado."
    };

    await ref.set(cleanForFirebase(medicoPerfil));
  }

  fillPerfilForm();
}

function fillPerfilForm() {
  $("#medNome").value = medicoPerfil.nome || "";
  $("#medCrm").value = medicoPerfil.cro || "";
  $("#medUf").value = medicoPerfil.uf || "SP";
  $("#medRqe").value = medicoPerfil.rqe || "";
  $("#medClinica").value = medicoPerfil.clinica || "";
  $("#medTelefone").value = medicoPerfil.telefone || "";
  $("#medEndereco").value = medicoPerfil.endereco || "";
  $("#medRodape").value = medicoPerfil.rodape || "";
  $("#medResumo").textContent = `${medicoPerfil.nome || "Cirurgião-dentista"} · CRO ${medicoPerfil.cro || "-"}/${medicoPerfil.uf || "UF"}`;
}

async function savePerfil() {
  medicoPerfil = {
    nome: $("#medNome").value.trim(),
    cro: $("#medCrm").value.trim(),
    uf: $("#medUf").value.trim().toUpperCase(),
    rqe: $("#medRqe").value.trim(),
    clinica: $("#medClinica").value.trim(),
    telefone: $("#medTelefone").value.trim(),
    endereco: $("#medEndereco").value.trim(),
    rodape: $("#medRodape").value.trim()
  };

  await db.ref(`dentistas/${currentUser.uid}/perfil`).set(cleanForFirebase(medicoPerfil));

  fillPerfilForm();
  setStatus("Perfil do dentista salvo.", "blue");
}

async function savePaciente() {
  const nome = $("#pacNome").value.trim();

  if (!nome) {
    return setStatus("Informe o nome do paciente.", "warn");
  }

  const id = $("#pacId").value || db.ref().push().key;

  const paciente = {
    id,
    nome,
    cpf: $("#pacCpf").value.trim(),
    nascimento: $("#pacNascimento").value,
    telefone: $("#pacTelefone").value.trim(),
    email: $("#pacEmail").value.trim(),
    endereco: $("#pacEndereco").value.trim(),
    updatedAt: nowIso()
  };

  await db.ref(`pacientes/${currentUser.uid}/${id}`).set(cleanForFirebase(paciente));

  clearPacienteForm();
  setStatus("Paciente salvo.", "blue");
}

function clearPacienteForm() {
  ["#pacId", "#pacNome", "#pacCpf", "#pacNascimento", "#pacTelefone", "#pacEmail", "#pacEndereco"].forEach((s) => {
    $(s).value = "";
  });
}

function editPaciente(id) {
  const p = pacientesCache[id];
  if (!p) return;

  $("#pacId").value = id;
  $("#pacNome").value = p.nome || "";
  $("#pacCpf").value = p.cpf || "";
  $("#pacNascimento").value = p.nascimento || "";
  $("#pacTelefone").value = p.telefone || "";
  $("#pacEmail").value = p.email || "";
  $("#pacEndereco").value = p.endereco || "";

  activateTab("pacientes");
}

async function deletePaciente(id) {
  if (!confirm("Excluir paciente? As receitas históricas continuam salvas.")) return;

  await db.ref(`pacientes/${currentUser.uid}/${id}`).remove();
}

function renderPacientes() {
  const body = $("#pacientesTable tbody");
  body.innerHTML = "";

  const list = Object.values(pacientesCache).sort((a, b) => (a.nome || "").localeCompare(b.nome || ""));

  $("#kpiPacientes").textContent = list.length;

  const sel = $("#recPaciente");
  const current = sel.value;
  sel.innerHTML = `<option value="">Selecione o paciente</option>`;

  list.forEach((p) => {
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>
        <strong>${safeText(p.nome)}</strong><br>
        <span class="badge">${safeText(p.telefone || "sem telefone")}</span>
      </td>
      <td>${safeText(p.cpf || "-")}</td>
      <td>${safeText(p.nascimento || "-")}</td>
      <td>${safeText(p.email || "-")}</td>
      <td>
        <button class="btn ghost" onclick="editPaciente('${p.id}')">Editar</button>
        <button class="btn red" onclick="deletePaciente('${p.id}')">Excluir</button>
      </td>
    `;

    body.appendChild(tr);

    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = p.nome;
    sel.appendChild(opt);
  });

  sel.value = current;
}

function collectReceitaForm(id = null) {
  const pacienteId = $("#recPaciente").value;
  const paciente = pacientesCache[pacienteId];

  if (!paciente) {
    throw new Error("Selecione um paciente cadastrado.");
  }

  const tipo = $("#recTipo").value;
  const medicamento = $("#recMedicamento").value.trim();
  const posologia = $("#recPosologia").value.trim();

  if (!medicamento || !posologia) {
    throw new Error("Informe medicamento e posologia.");
  }

  const rid = id || receitaId();

  return {
    id: rid,
    dentistaUid: currentUser.uid,
    medico: medicoPerfil,
    pacienteId,
    paciente: {
      nome: paciente.nome,
      cpf: paciente.cpf || "",
      nascimento: paciente.nascimento || "",
      telefone: paciente.telefone || "",
      endereco: paciente.endereco || ""
    },
    tipo,
    medicamento,
    concentracao: $("#recConcentracao").value.trim(),
    forma: $("#recForma").value.trim(),
    quantidade: $("#recQuantidade").value.trim(),
    posologia,
    duracao: $("#recDuracao").value.trim(),
    orientacoes: $("#recOrientacoes").value.trim(),
    dataEmissao: nowIso(),
    status: "GERADA_NAO_ASSINADA",
    assinaturaModo: "PENDENTE_ICP",
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
}

function publicReceitaData(r) {
  return cleanForFirebase({
    id: r.id,
    status: r.status || "GERADA_NAO_ASSINADA",
    tipo: r.tipo || "",
    dataEmissao: r.dataEmissao || "",
    assinadaEm: r.assinadaEm || null,
    hashSha256: r.hashSha256 || null,
    pdfAssinadoUrl: r.pdfAssinadoUrl || null,
    medicoNome: r.medico?.nome || "",
    medicoCrm: r.medico?.cro || "",
    medicoUf: r.medico?.uf || "",
    pacienteIniciais: initials(r.paciente?.nome),
    pacienteCpfMascara: maskCpf(r.paciente?.cpf),
    observacaoValidacao: "A validação pública confirma o registro no sistema. A validade criptográfica deve ser conferida no PDF assinado em validador oficial ICP-Brasil."
  });
}

function clearReceitaForm() {
  ["#recPaciente", "#recMedicamento", "#recConcentracao", "#recForma", "#recQuantidade", "#recPosologia", "#recDuracao", "#recOrientacoes"].forEach((s) => {
    $(s).value = "";
  });

  $("#recTipo").value = "RECEITA_SIMPLES";
  $("#lastReceitaBox").classList.add("hidden");
}

async function generatePdfBlob(r, signedLabel = false) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "mm", format: "a4" });

  const margin = 18;
  let y = 18;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text(medicoPerfil.clinica || "Receita Odontológica Digital", margin, y);

  y += 7;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);

  doc.text(doc.splitTextToSize(medicoPerfil.endereco || "", 174), margin, y);
  y += medicoPerfil.endereco ? 8 : 2;

  doc.text(
    `Cirurgião-dentista: ${medicoPerfil.nome || ""}   CRO: ${medicoPerfil.cro || ""}/${medicoPerfil.uf || ""}${medicoPerfil.rqe ? `   Especialidade: ${medicoPerfil.rqe}` : ""}`,
    margin,
    y
  );

  y += 9;

  doc.setDrawColor(180);
  doc.line(margin, y, 210 - margin, y);

  y += 10;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);

  const title =
    r.tipo === "ATESTADO"
      ? "ATESTADO ODONTOLÓGICO"
      : r.tipo === "PEDIDO_EXAME"
        ? "PEDIDO DE EXAME"
        : "RECEITA ODONTOLÓGICA";

  doc.text(title, 105, y, { align: "center" });

  y += 12;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);

  doc.text(`Receita ID: ${r.id}`, margin, y);
  y += 7;

  doc.text(`Data de emissão: ${new Date(r.dataEmissao).toLocaleString("pt-BR")}`, margin, y);
  y += 8;

  doc.setFont("helvetica", "bold");
  doc.text("Paciente", margin, y);

  y += 6;

  doc.setFont("helvetica", "normal");
  doc.text(`Nome: ${r.paciente.nome || ""}`, margin, y);

  y += 6;

  doc.text(`CPF: ${r.paciente.cpf || "não informado"}   Nascimento: ${r.paciente.nascimento || "não informado"}`, margin, y);

  y += 8;

  doc.setFont("helvetica", "bold");
  doc.text("Prescrição / Documento", margin, y);

  y += 7;

  doc.setFont("helvetica", "normal");

  const linhas = [
    `Tipo: ${r.tipo}`,
    `Medicamento/Descrição: ${r.medicamento}`,
    `Concentração: ${r.concentracao || "-"}`,
    `Forma farmacêutica: ${r.forma || "-"}`,
    `Quantidade: ${r.quantidade || "-"}`,
    `Posologia: ${r.posologia}`,
    `Duração: ${r.duracao || "-"}`,
    `Orientações: ${r.orientacoes || "-"}`
  ];

  linhas.forEach((line) => {
    const split = doc.splitTextToSize(line, 174);
    doc.text(split, margin, y);
    y += split.length * 6;

    if (y > 245) {
      doc.addPage();
      y = 18;
    }
  });

  y += 8;

  doc.setDrawColor(120);
  doc.line(55, y, 155, y);

  y += 6;

  doc.setFont("helvetica", "bold");
  doc.text(medicoPerfil.nome || "Cirurgião-dentista", 105, y, { align: "center" });

  y += 5;

  doc.setFont("helvetica", "normal");
  doc.text(`CRO ${medicoPerfil.cro || ""}/${medicoPerfil.uf || ""}`, 105, y, { align: "center" });

  y += 10;

  const valUrl = validationUrl(r.id);

  doc.setFontSize(9);
  doc.setTextColor(70);
  doc.text("Validação:", margin, y);

  y += 5;

  doc.text(doc.splitTextToSize(valUrl, 174), margin, y);

  y += 8;

  doc.setTextColor(0);
  doc.setFont("helvetica", "bold");

  if (signedLabel) {
    doc.text("PDF marcado no sistema como assinado ICP após upload do arquivo assinado.", margin, y);
  } else {
    doc.setTextColor(180, 60, 30);
    doc.text("ATENÇÃO: este PDF ainda precisa ser assinado digitalmente com ICP-Brasil.", margin, y);
    doc.setTextColor(0);
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(doc.splitTextToSize(medicoPerfil.rodape || "", 174), margin, 286);

  return doc.output("blob");
}

async function gerarReceita() {
  try {
    const r = collectReceitaForm();

    if (["CONTROLE_ESPECIAL", "ANTIMICROBIANO", "NOTIFICACAO_A", "NOTIFICACAO_B", "NOTIFICACAO_B2"].includes(r.tipo)) {
      alert("Atenção: para controlados/antimicrobianos, confirme as regras sanitárias atuais e exigências de receituário eletrônico antes de emitir. Este MVP não substitui plataforma regulatória/homologada.");
    }

    const blob = await generatePdfBlob(r, false);
    const upload = await uploadPdfCloudinary(blob, {
      receitaId: r.id,
      tipo: "original-nao-assinada"
    });

    r.pdfOriginalUrl = upload.secureUrl;
    r.cloudinaryOriginal = upload;

    await db.ref(`receitasPrivadas/${currentUser.uid}/${r.id}`).set(cleanForFirebase(r));
    await db.ref(`receitasPublicas/${r.id}`).set(publicReceitaData(r));

    downloadBlob(blob, `${r.id}-NAO-ASSINADA.pdf`);

    $("#lastReceitaId").textContent = r.id;
    $("#lastReceitaLink").href = validationUrl(r.id);
    $("#lastReceitaBox").classList.remove("hidden");

    setStatus("Receita gerada. Agora assine o PDF com ICP-Brasil fora do sistema e suba o PDF assinado no histórico.", "warn");

    clearReceitaInputsAfterSave();
  } catch (e) {
    setStatus(e.message, "danger");
  }
}

function clearReceitaInputsAfterSave() {
  ["#recMedicamento", "#recConcentracao", "#recForma", "#recQuantidade", "#recPosologia", "#recDuracao", "#recOrientacoes"].forEach((s) => {
    $(s).value = "";
  });
}

function downloadBlob(blob, filename) {
  const a = document.createElement("a");

  a.href = URL.createObjectURL(blob);
  a.download = filename;

  document.body.appendChild(a);
  a.click();

  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 600);
}

async function uploadPdfAssinado(receitaId, inputId) {
  try {
    const file = document.getElementById(inputId).files[0];

    if (!file) {
      return setStatus("Selecione o PDF assinado ICP-Brasil.", "warn");
    }

    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      return setStatus("Envie apenas PDF.", "warn");
    }

    const receitaSnap = await db.ref(`receitasPrivadas/${currentUser.uid}/${receitaId}`).get();

    if (!receitaSnap.exists()) {
      return setStatus("Receita não encontrada.", "danger");
    }

    const hash = await sha256File(file);

    const upload = await uploadPdfCloudinary(file, {
      receitaId,
      tipo: "assinada-icp"
    });

    const updates = cleanForFirebase({
      status: "ASSINADA_ICP_UPLOAD_MANUAL",
      assinaturaModo: "ICP_EXTERNA_UPLOAD",
      pdfAssinadoUrl: upload.secureUrl,
      cloudinaryAssinado: upload,
      hashSha256: hash,
      assinadaEm: nowIso(),
      updatedAt: nowIso()
    });

    await db.ref(`receitasPrivadas/${currentUser.uid}/${receitaId}`).update(updates);

    const merged = cleanForFirebase({
      ...receitaSnap.val(),
      ...updates
    });

    await db.ref(`receitasPublicas/${receitaId}`).set(publicReceitaData(merged));

    setStatus("PDF assinado ICP anexado ao registro. A farmácia deve validar o PDF assinado em validador oficial.", "blue");
  } catch (e) {
    setStatus(e.message, "danger");
  }
}

async function cancelarReceita(id) {
  if (!confirm("Cancelar esta receita no sistema?")) return;

  const updates = cleanForFirebase({
    status: "CANCELADA",
    canceladaEm: nowIso(),
    updatedAt: nowIso()
  });

  await db.ref(`receitasPrivadas/${currentUser.uid}/${id}`).update(updates);

  const r = cleanForFirebase({
    ...(receitasCache[id] || {}),
    ...updates
  });

  await db.ref(`receitasPublicas/${id}`).set(publicReceitaData(r));
}

function renderReceitas() {
  const list = Object.values(receitasCache).sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));

  $("#kpiReceitas").textContent = list.length;
  $("#kpiAssinadas").textContent = list.filter((r) => String(r.status).includes("ASSINADA")).length;

  const body = $("#receitasTable tbody");
  body.innerHTML = "";

  list.forEach((r, idx) => {
    const statusClass =
      r.status === "CANCELADA"
        ? "red"
        : String(r.status).includes("ASSINADA")
          ? "green"
          : "amber";

    const inputId = `fileSigned_${idx}_${r.id.replace(/\W/g, "")}`;

    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>
        <strong>${safeText(r.id)}</strong><br>
        <span class="badge ${statusClass}">${safeText(r.status)}</span>
      </td>
      <td>
        ${safeText(r.paciente?.nome || "-")}<br>
        <small>${safeText(r.tipo || "")}</small>
      </td>
      <td>${fmtDate(r.dataEmissao)}</td>
      <td>
        ${
          r.hashSha256
            ? `<small>${safeText(r.hashSha256.slice(0, 18))}...</small>`
            : `<span class="badge amber">sem hash ICP</span>`
        }
      </td>
      <td>
        <div class="actions">
          ${r.pdfOriginalUrl ? `<a class="btn ghost" target="_blank" href="${r.pdfOriginalUrl}">PDF original</a>` : ""}
          ${r.pdfAssinadoUrl ? `<a class="btn green" target="_blank" href="${r.pdfAssinadoUrl}">PDF ICP</a>` : ""}
          <a class="btn ghost" target="_blank" href="${validationUrl(r.id)}">Validação</a>
        </div>
        <div class="actions">
          <input id="${inputId}" type="file" accept="application/pdf" style="max-width:210px">
          <button class="btn primary" onclick="uploadPdfAssinado('${r.id}','${inputId}')">Subir ICP</button>
          <button class="btn red" onclick="cancelarReceita('${r.id}')">Cancelar</button>
        </div>
      </td>
    `;

    body.appendChild(tr);
  });
}

function wireRealtime() {
  db.ref(`pacientes/${currentUser.uid}`).on("value", (snap) => {
    pacientesCache = snap.val() || {};
    renderPacientes();
  });

  db.ref(`receitasPrivadas/${currentUser.uid}`).on("value", (snap) => {
    receitasCache = snap.val() || {};
    renderReceitas();
  });
}

function wireEvents() {
  $("#loginBtn").onclick = signIn;
  $("#logoutBtn").onclick = signOut;
  $("#savePerfilBtn").onclick = savePerfil;
  $("#savePacienteBtn").onclick = savePaciente;
  $("#clearPacienteBtn").onclick = clearPacienteForm;
  $("#gerarReceitaBtn").onclick = gerarReceita;

  $$(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => activateTab(btn.dataset.tab));
  });

  $("#loginSenha").addEventListener("keydown", (e) => {
    if (e.key === "Enter") signIn();
  });
}

auth.onAuthStateChanged(async (user) => {
  currentUser = user;

  if (!user) {
    showAuth(false);
    return;
  }

  if (user.uid !== uidAutorizado) {
    await auth.signOut();
    showAuth(false);
    alert(`Este usuário autenticado não é o UID autorizado neste MVP. UID permitido: ${uidAutorizado}`);
    return;
  }

  showAuth(true);

  $("#userEmail").textContent = user.email || user.uid;

  await loadMedicoPerfil();

  wireRealtime();

  activateTab("nova");
});

window.editPaciente = editPaciente;
window.deletePaciente = deletePaciente;
window.uploadPdfAssinado = uploadPdfAssinado;
window.cancelarReceita = cancelarReceita;

document.addEventListener("DOMContentLoaded", wireEvents);