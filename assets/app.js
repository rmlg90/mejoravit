/* Portal Mejoravit - versión HTML de prueba.
   El documento se procesa en el navegador. No se persiste por defecto. */

const CONFIG = window.PORTAL_CONFIG || { commissionRate: 0.24, fixedFee: 2000, webhookUrl: "" };
if (window.pdfjsLib) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
}

const state = {
  step: 1,
  file: null,
  source: "",
  prospect: {},
  credit: { nss: "", annualRate: 0, cat: 0, amount: 0, rows: [], warnings: [], valid: false }
};

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const money = (n) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 2 }).format(Number(n || 0));
const fmt = (n, d = 2) => Number(n || 0).toFixed(d);

function toast(text) {
  const el = $("#toast");
  el.textContent = text;
  el.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove("show"), 3200);
}

function showMessage(text, type = "info") {
  const el = $("#globalMessage");
  el.hidden = false;
  el.className = `message is-${type}`;
  el.innerHTML = text;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
}
function hideMessage() { $("#globalMessage").hidden = true; }

function goToStep(step) {
  state.step = step;
  $$('[data-step-panel]').forEach(p => p.classList.toggle('is-active', Number(p.dataset.stepPanel) === step));
  $$('[data-step-nav]').forEach(nav => {
    const n = Number(nav.dataset.stepNav);
    nav.classList.toggle('is-active', n === step);
    nav.classList.toggle('is-done', n < step);
  });
  hideMessage();
  window.scrollTo({ top: Math.max(0, $('.portal-card').offsetTop - 20), behavior: 'smooth' });
}

function collectProspect() {
  const form = $("#prospectForm");
  if (!form.reportValidity()) return false;
  const imss = $('input[name="imss"]:checked');
  if (!imss) { showMessage("Selecciona si actualmente cotizas al IMSS.", "error"); return false; }
  state.prospect = {
    fullName: $("#fullName").value.trim(),
    phone: $("#phone").value.trim(),
    email: $("#email").value.trim(),
    imss: imss.value,
    activeCredit: $('input[name="activeCredit"]:checked')?.value || "No",
    purpose: $("#purpose").value
  };
  return true;
}

$("#goStep2").addEventListener("click", (e) => {
  e.preventDefault();
  if (collectProspect()) goToStep(2);
});
$$('[data-back]').forEach(btn => btn.addEventListener('click', () => goToStep(Number(btn.dataset.back))));

const dropzone = $("#dropzone");
const fileInput = $("#documentInput");
["dragenter", "dragover"].forEach(evt => dropzone.addEventListener(evt, e => { e.preventDefault(); dropzone.classList.add("is-dragging"); }));
["dragleave", "drop"].forEach(evt => dropzone.addEventListener(evt, e => { e.preventDefault(); dropzone.classList.remove("is-dragging"); }));
dropzone.addEventListener("drop", e => setFile(e.dataTransfer.files?.[0]));
fileInput.addEventListener("change", e => setFile(e.target.files?.[0]));

function setFile(file) {
  if (!file) return;
  const ok = ["application/pdf", "image/jpeg", "image/png"].includes(file.type);
  if (!ok) { showMessage("Formato no compatible. Usa PDF, JPG o PNG.", "error"); return; }
  if (file.size > 12 * 1024 * 1024) { showMessage("Para esta prueba usa un archivo menor a 12 MB.", "error"); return; }
  state.file = file;
  $("#fileCard").hidden = false;
  $("#fileName").textContent = file.name;
  $("#fileSize").textContent = `${(file.size / 1024 / 1024).toFixed(2)} MB`;
  $("#fileCard .file-icon").textContent = file.type === "application/pdf" ? "PDF" : "IMG";
  $("#processDocument").disabled = false;
  hideMessage();
}

$("#removeFile").addEventListener("click", () => {
  state.file = null; fileInput.value = ""; $("#fileCard").hidden = true; $("#processDocument").disabled = true;
});

$("#processDocument").addEventListener("click", async () => {
  if (!state.file) return;
  setProcessing(true, "Leyendo tu documento…", "Primero intentamos extraer el texto directamente.");
  try {
    let text = "";
    let source = "texto";
    if (state.file.type === "application/pdf") {
      text = await extractPdfText(state.file);
      const quick = parseCreditText(text);
      if (quick.rows.length === 0) {
        source = "ocr";
        setProcessing(true, "El PDF parece escaneado", "Aplicando OCR en el navegador. Puede tardar un poco más.");
        text = await ocrPdf(state.file);
      }
    } else {
      source = "ocr";
      setProcessing(true, "Leyendo la imagen con OCR…", "La precisión depende de la nitidez de la captura.");
      text = await ocrImage(state.file);
    }
    state.source = source;
    state.credit = parseCreditText(text);
    state.credit.source = source;
    validateCredit();
    populateReview();
    setProcessing(false);
    goToStep(3);
  } catch (err) {
    console.error(err);
    setProcessing(false);
    showMessage("No pudimos procesar el archivo. Puedes intentar con el PDF oficial o una captura más clara.", "error");
  }
});

function setProcessing(on, title = "", detail = "") {
  $("#processingBox").hidden = !on;
  $("#processingTitle").textContent = title;
  $("#processingDetail").textContent = detail;
  $("#processDocument").disabled = on || !state.file;
}

async function extractPdfText(file) {
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  let out = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    out += "\n" + content.items.map(x => x.str).join(" ");
  }
  return out;
}

async function ocrImage(file) {
  const result = await Tesseract.recognize(file, "spa+eng", { logger: m => {
    if (m.status === "recognizing text") $("#processingDetail").textContent = `OCR: ${Math.round((m.progress || 0) * 100)}%`;
  }});
  return result.data.text || "";
}

async function ocrPdf(file) {
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const maxPages = Math.min(pdf.numPages, 10);
  let out = "";
  for (let i = 1; i <= maxPages; i++) {
    $("#processingDetail").textContent = `OCR página ${i} de ${maxPages}…`;
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 1.7 });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width; canvas.height = viewport.height;
    await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
    const result = await Tesseract.recognize(canvas, "spa+eng");
    out += "\n" + (result.data.text || "");
  }
  return out;
}

function normalizeText(s) {
  return String(s || "").replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ").replace(/\r/g, "\n");
}
function toNumber(s) { return Number(String(s || "0").replace(/,/g, "")); }

function parseCreditText(raw) {
  const text = normalizeText(raw);
  const oneLine = text.replace(/\n+/g, " ");
  const rows = [];
  const warnings = [];

  const rowRe = /(\d{1,3})\s+\$?\s*([\d,]+\.\d{2})\s+\$?\s*([\d,]+\.\d{2})\s+\$?\s*([\d,]+\.\d{2})\s+\$?\s*([\d,]+\.\d{2})\s+\$?\s*([\d,]+\.\d{2})/g;
  let m;
  const byMonth = new Map();
  while ((m = rowRe.exec(oneLine)) !== null) {
    const month = Number(m[1]);
    if (month >= 1 && month <= 600) {
      byMonth.set(month, {
        month,
        initial: toNumber(m[2]),
        interest: toNumber(m[3]),
        retention: toNumber(m[4]),
        employer: toNumber(m[5]),
        final: toNumber(m[6])
      });
    }
  }
  [...byMonth.keys()].sort((a,b) => a-b).forEach(k => rows.push(byMonth.get(k)));

  let nss = "", annualRate = 0, cat = 0, amount = 0;
  const headerRe = /(\d{10,11})\s+([\d.]+)\s*%\s+([\d.]+)\s*%\s+\$\s*([\d,]+\.\d{2})/;
  const hm = oneLine.match(headerRe);
  if (hm) {
    nss = hm[1]; annualRate = Number(hm[2]); cat = Number(hm[3]); amount = toNumber(hm[4]);
  } else {
    nss = (oneLine.match(/\b\d{11}\b/) || oneLine.match(/\b\d{10}\b/) || [""])[0];
    const percents = [...oneLine.matchAll(/([\d.]+)\s*%/g)].map(x => Number(x[1])).filter(x => x > 0 && x < 200);
    annualRate = percents[0] || 0; cat = percents[1] || 0;
    if (rows.length) amount = rows[0].initial;
    warnings.push("El encabezado no se leyó con el formato esperado. Revisa NSS, tasa, CAT y monto.");
  }
  if (!rows.length) warnings.push("No se detectaron filas de amortización automáticamente.");
  if (!amount && rows.length) amount = rows[0].initial;

  return { nss, annualRate, cat, amount, rows, warnings, valid: false };
}

function populateReview() {
  const c = state.credit;
  $("#nss").value = c.nss || "";
  $("#creditAmount").value = c.amount || "";
  $("#annualRate").value = c.annualRate || "";
  $("#cat").value = c.cat || "";
  renderRows();
  const alert = $("#sourceAlert");
  alert.hidden = false;
  alert.innerHTML = c.source === "ocr"
    ? "<strong>Lectura con OCR:</strong> revisa cada cifra con el documento original antes de continuar."
    : "<strong>Lectura directa del PDF:</strong> aun así confirma los datos antes de generar el comparativo.";
  if (c.warnings?.length) alert.innerHTML += `<br>${c.warnings.join("<br>")}`;
  $("#validationBox").hidden = true;
  $("#goResult").disabled = true;
}

function renderRows() {
  const tbody = $("#amortizationTable tbody");
  tbody.innerHTML = "";
  state.credit.rows.forEach((r, idx) => {
    const tr = document.createElement("tr");
    const fields = ["month", "initial", "interest", "retention", "employer", "final"];
    fields.forEach((key, col) => {
      const td = document.createElement("td");
      const input = document.createElement("input");
      input.type = "number"; input.step = col === 0 ? "1" : "0.01"; input.value = r[key];
      input.addEventListener("input", () => { r[key] = Number(input.value || 0); state.credit.valid = false; $("#goResult").disabled = true; });
      td.appendChild(input); tr.appendChild(td);
    });
    const td = document.createElement("td");
    const btn = document.createElement("button"); btn.className = "remove-row"; btn.textContent = "×"; btn.title = "Eliminar fila";
    btn.addEventListener("click", () => { state.credit.rows.splice(idx,1); renderRows(); state.credit.valid = false; $("#goResult").disabled = true; });
    td.appendChild(btn); tr.appendChild(td); tbody.appendChild(tr);
  });
  $("#rowCountText").textContent = `${state.credit.rows.length} filas detectadas`;
}

$("#addRow").addEventListener("click", () => {
  const prev = state.credit.rows[state.credit.rows.length - 1];
  state.credit.rows.push({ month: prev ? prev.month + 1 : 1, initial: prev ? prev.final : 0, interest: 0, retention: prev?.retention || 0, employer: prev?.employer || 0, final: 0 });
  renderRows();
});

function syncReviewFields() {
  state.credit.nss = $("#nss").value.trim();
  state.credit.amount = Number($("#creditAmount").value || 0);
  state.credit.annualRate = Number($("#annualRate").value || 0);
  state.credit.cat = Number($("#cat").value || 0);
}

function validateCredit() {
  syncReviewFields();
  const c = state.credit;
  const errors = [];
  const tol = 0.06;
  if (!/^\d{10,11}$/.test(c.nss || "")) errors.push("El NSS debe contener 10 u 11 dígitos.");
  if (!(c.amount > 0)) errors.push("El monto del crédito debe ser mayor a cero.");
  if (!c.rows.length) errors.push("No hay filas de amortización para validar.");

  c.rows.forEach((r, i) => {
    if ([r.month,r.initial,r.interest,r.retention,r.employer,r.final].some(v => !Number.isFinite(Number(v)) || Number(v) < 0)) {
      errors.push(`Mes ${r.month || i+1}: contiene un valor inválido.`); return;
    }
    const payment = round2(r.retention + r.employer);
    const capital = round2(payment - r.interest);
    const expected = round2(r.initial - capital);
    if (Math.abs(expected - r.final) > tol) errors.push(`Mes ${r.month}: el saldo final esperado es ${money(expected)} y aparece ${money(r.final)}.`);
    if (i > 0) {
      const prev = c.rows[i-1];
      if (r.month !== prev.month + 1) errors.push(`La secuencia salta del mes ${prev.month} al ${r.month}.`);
      if (Math.abs(prev.final - r.initial) > tol) errors.push(`Entre meses ${prev.month} y ${r.month}, el saldo final no coincide con el siguiente saldo inicial.`);
    }
  });
  if (c.rows.length && Math.abs(c.rows[c.rows.length - 1].final) > tol) errors.push("La última fila no termina en saldo $0.00.");
  if (c.rows.length && c.amount > 0 && Math.abs(c.rows[0].initial - c.amount) > 1) errors.push("El monto del crédito no coincide con el saldo inicial de la primera fila.");

  c.valid = errors.length === 0;
  c.validationErrors = errors;
  return errors;
}
function round2(n) { return Math.round((Number(n) + Number.EPSILON) * 100) / 100; }

$("#validateData").addEventListener("click", () => {
  const errors = validateCredit();
  const box = $("#validationBox"); box.hidden = false;
  if (errors.length) {
    box.className = "validation-box is-error";
    box.innerHTML = `<strong>Hay datos por revisar:</strong><ul>${errors.slice(0,12).map(e => `<li>${e}</li>`).join("")}</ul>${errors.length > 12 ? `<p>Y ${errors.length - 12} observaciones adicionales.</p>` : ""}`;
    $("#goResult").disabled = true;
  } else {
    box.className = "validation-box is-ok";
    box.innerHTML = "<strong>Validación correcta.</strong> Las filas son consistentes y el saldo termina en $0.00.";
    $("#goResult").disabled = false;
  }
});

$("#goResult").addEventListener("click", () => {
  const errors = validateCredit();
  if (errors.length) return;
  populateResult(); goToStep(4);
});

function calculateMonthsWithoutEmployer(amount, annualRate, retention) {
  const monthlyRate = Number(annualRate || 0) / 100 / 12;
  let balance = Number(amount || 0), months = 0;
  while (balance > .005 && months < 600) {
    const interest = round2(balance * monthlyRate);
    let capital = round2(retention - interest);
    if (capital <= 0) { months += 1; break; }
    if (capital >= balance) capital = balance;
    balance = round2(balance - capital); months += 1;
  }
  return months;
}

function populateResult() {
  const c = state.credit, rows = c.rows;
  const retention = rows[0]?.retention || 0, employer = rows[0]?.employer || 0;
  const withMonths = rows.length;
  const withoutMonths = calculateMonthsWithoutEmployer(c.amount, c.annualRate, retention);
  const saved = Math.max(withoutMonths - withMonths, 0);
  const commission = round2(c.amount * Number(CONFIG.commissionRate || 0));
  const totalFees = round2(commission + Number(CONFIG.fixedFee || 0));
  const net = round2(c.amount - totalFees);

  $("#resultGreeting").textContent = `${state.prospect.fullName}, este es el escenario construido con los datos que revisaste.`;
  $("#metricAmount").textContent = money(c.amount);
  $("#metricRetention").textContent = money(retention);
  $("#metricEmployer").textContent = money(employer);
  $("#metricMonths").textContent = `${withMonths} meses`;
  $("#withEmployerMonths").textContent = withMonths;
  $("#withoutEmployerMonths").textContent = withoutMonths;
  $("#savingPill").textContent = saved > 0 ? `${saved} meses menos` : "Sin diferencia calculada";
  const max = Math.max(withMonths, withoutMonths, 1);
  $("#withEmployerBar").style.width = `${Math.max(5, (withMonths/max)*100)}%`;
  $("#withoutEmployerBar").style.width = `${Math.max(5, (withoutMonths/max)*100)}%`;
  $("#feePercent").textContent = `${Math.round(Number(CONFIG.commissionRate || 0) * 100)}% · ${money(commission)}`;
  $("#fixedFee").textContent = money(CONFIG.fixedFee || 0);
  $("#totalFees").textContent = money(totalFees);
  $("#netAmount").textContent = money(net);
}

function buildSummaryText() {
  const c = state.credit, r = c.rows[0] || {};
  const without = calculateMonthsWithoutEmployer(c.amount, c.annualRate, r.retention || 0);
  return [
    `Simulación Mejoravit - ${state.prospect.fullName}`,
    `Monto: ${money(c.amount)}`,
    `Retención mensual: ${money(r.retention || 0)}`,
    `Aportación patronal: ${money(r.employer || 0)}`,
    `Plazo con aportación: ${c.rows.length} meses`,
    `Plazo estimado solo con retención: ${without} meses`,
    `Tasa anual: ${fmt(c.annualRate)}%`,
    `CAT: ${fmt(c.cat)}%`,
    `Documento validado: ${c.valid ? "Sí" : "No"}`
  ].join("\n");
}

$("#copySummary").addEventListener("click", async () => {
  try { await navigator.clipboard.writeText(buildSummaryText()); toast("Resumen copiado al portapapeles."); }
  catch { toast("No se pudo copiar automáticamente."); }
});

$("#downloadPdf").addEventListener("click", () => generatePdf());

function generatePdf() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "mm", format: "letter" });
  const c = state.credit, rows = c.rows;
  const retention = rows[0]?.retention || 0, employer = rows[0]?.employer || 0;
  const without = calculateMonthsWithoutEmployer(c.amount, c.annualRate, retention);
  const commission = round2(c.amount * Number(CONFIG.commissionRate || 0));
  const totalFees = round2(commission + Number(CONFIG.fixedFee || 0));
  const net = round2(c.amount - totalFees);
  const totalInterest = round2(rows.reduce((a,r) => a + Number(r.interest || 0), 0));
  const totalRetention = round2(rows.reduce((a,r) => a + Number(r.retention || 0), 0));
  const totalEmployer = round2(rows.reduce((a,r) => a + Number(r.employer || 0), 0));

  const red = [179, 19, 43], dark = [30, 28, 27], gray = [104, 99, 95];
  doc.setFillColor(...red); doc.rect(0,0,216,20,"F");
  doc.setTextColor(255,255,255); doc.setFont("helvetica","bold"); doc.setFontSize(10); doc.text("SIMULACIÓN MEJORAVIT", 15, 9);
  doc.setFont("helvetica","normal"); doc.setFontSize(8); doc.text(`Generada ${new Date().toLocaleDateString("es-MX")}`, 15, 14);
  doc.setFillColor(...dark); doc.rect(0,20,216,17,"F"); doc.setFont("helvetica","bold"); doc.setFontSize(17); doc.text("Comparativo de crédito", 15, 31);

  doc.setTextColor(...dark); doc.setFontSize(15); doc.text("Resumen de la simulación", 15, 48);
  doc.setFont("helvetica","normal"); doc.setFontSize(9); doc.setTextColor(...gray);
  doc.text(`Cliente: ${state.prospect.fullName}`, 15, 55);
  doc.text(`NSS: ${maskNss(c.nss)}`, 15, 60);

  doc.autoTable({
    startY: 66,
    body: [
      ["Monto de crédito", money(c.amount)], ["Tasa anual", `${fmt(c.annualRate)}%`], ["CAT indicativo", `${fmt(c.cat)}%`],
      ["Plazo con aportación", `${rows.length} meses`], ["Tu retención mensual", money(retention)], ["Aportación patronal", money(employer)]
    ],
    theme: "plain", styles: { fontSize: 9, cellPadding: 2.6 }, columnStyles: { 1: { halign: "right", fontStyle: "bold" } },
    didParseCell: data => { if (data.row.index < 5) data.cell.styles.lineColor = [232,228,224]; }
  });

  let y = doc.lastAutoTable.finalY + 8;
  doc.setFont("helvetica","bold"); doc.setTextColor(...red); doc.setFontSize(13); doc.text("Impacto de la aportación patronal", 15, y); y += 4;
  doc.autoTable({ startY: y,
    head: [["Escenario", "Retención", "Aportación patronal", "Plazo"]],
    body: [["Con aportación patronal", money(retention), money(employer), `${rows.length} meses`], ["Solo tu retención", money(retention), money(0), `${without} meses`]],
    headStyles: { fillColor: red, textColor: 255 }, styles: { fontSize: 8.5, cellPadding: 3 }
  });

  y = doc.lastAutoTable.finalY + 8;
  doc.setFont("helvetica","bold"); doc.setTextColor(...red); doc.setFontSize(13); doc.text("Honorarios configurados", 15, y); y += 4;
  doc.autoTable({ startY: y, theme: "plain", styles: { fontSize: 9, cellPadding: 2.6 }, columnStyles: { 1: { halign: "right", fontStyle: "bold" } },
    body: [[`Honorarios (${Math.round(Number(CONFIG.commissionRate)*100)}%)`, money(commission)], ["Cuota fija", money(CONFIG.fixedFee)], ["Total honorarios", money(totalFees)], ["Monto neto estimado", money(net)]]
  });

  doc.addPage();
  doc.setFillColor(...red); doc.rect(0,0,216,17,"F"); doc.setTextColor(255,255,255); doc.setFont("helvetica","bold"); doc.setFontSize(13); doc.text("Tabla de amortización", 15, 11);
  doc.autoTable({ startY: 23,
    head: [["Mes", "Saldo inicial", "Interés", "Retención", "Patrón", "Saldo final"]],
    body: rows.map(r => [r.month, money(r.initial), money(r.interest), money(r.retention), money(r.employer), money(r.final)]),
    foot: [["Total", "", money(totalInterest), money(totalRetention), money(totalEmployer), ""]],
    headStyles: { fillColor: red, textColor: 255 }, footStyles: { fillColor: [245,231,234], textColor: dark, fontStyle: "bold" },
    styles: { fontSize: 7, cellPadding: 2.2 }, columnStyles: { 0: { halign: "center" }, 1: { halign: "right" }, 2:{halign:"right"},3:{halign:"right"},4:{halign:"right"},5:{halign:"right"} },
    didDrawPage: () => {
      const pageH = doc.internal.pageSize.height;
      doc.setTextColor(...gray); doc.setFontSize(7); doc.setFont("helvetica","normal");
      doc.text("Simulación informativa. Herramienta independiente; no es un sitio oficial de INFONAVIT.", 15, pageH - 8);
    }
  });

  const safe = (state.prospect.fullName || "cliente").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g,"_").replace(/^_|_$/g,"");
  doc.save(`Comparativo_Mejoravit_${safe}.pdf`);
}
function maskNss(nss) { return nss?.length > 4 ? `${"•".repeat(Math.max(0,nss.length-4))}${nss.slice(-4)}` : (nss || ""); }

$("#clearSession").addEventListener("click", () => {
  if (!confirm("¿Borrar todos los datos cargados en esta sesión?")) return;
  state.file = null; state.prospect = {}; state.credit = { nss:"",annualRate:0,cat:0,amount:0,rows:[],warnings:[],valid:false };
  $("#prospectForm").reset(); fileInput.value = ""; $("#fileCard").hidden = true; $("#processDocument").disabled = true;
  renderRows(); goToStep(1); toast("Datos de la sesión eliminados.");
});

// La navegación por el stepper solo permite volver a pasos ya visitados.
$$('[data-step-nav]').forEach(btn => btn.addEventListener('click', () => {
  const target = Number(btn.dataset.stepNav);
  if (target < state.step) goToStep(target);
}));
