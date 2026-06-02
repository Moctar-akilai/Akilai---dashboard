const { BASE_URL, headers, ok, err, preflight, corsHeaders } = require("../config");
const { verifyAdminToken, unauthorized } = require("../admin-utils");
const { PDFDocument, rgb, StandardFonts } = require("pdf-lib");
const { v2: cloudinary } = require("cloudinary");

const PAIEMENTS_TABLE = "tblgoPGS5jbhWwXQl";
const CONFIGURATIONS_TABLE = "tblConfigurations";
const RESEND_API_KEY = process.env.RESEND_API_KEY || "";

// --- Cloudinary config ---

function configureCloudinary() {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
}

// --- Invoice number auto-increment FAC-YYYY-NNNNN ---

async function getNextInvoiceNumber() {
  const year = new Date().getFullYear();
  const prefix = `FAC-${year}-`;
  const formula = encodeURIComponent(`SEARCH("${prefix}",{N° Facture})>0`);
  const res = await fetch(
    `${BASE_URL}/${PAIEMENTS_TABLE}?fields[]=N%C2%B0%20Facture&filterByFormula=${formula}&maxRecords=500`,
    { headers }
  );
  const data = await res.json();
  let max = 0;
  for (const rec of data.records || []) {
    const num = rec.fields?.["N° Facture"] || "";
    if (num.startsWith(prefix)) {
      const n = parseInt(num.slice(prefix.length), 10);
      if (!isNaN(n) && n > max) max = n;
    }
  }
  return `${prefix}${String(max + 1).padStart(5, "0")}`;
}

// --- Agency info from Airtable Configurations ---

async function getAgencyInfo() {
  try {
    const res = await fetch(
      `${BASE_URL}/${CONFIGURATIONS_TABLE}?maxRecords=5&fields[]=Infos%20Agence`,
      { headers }
    );
    const data = await res.json();
    const raw = data.records?.[0]?.fields?.["Infos Agence"];
    return typeof raw === "string" ? JSON.parse(raw) : (raw || {});
  } catch {
    return {};
  }
}

// --- Helpers ---

const TVA_PAYS = ["France", "Belgique", "france", "belgique", "FR", "BE"];

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return rgb(r, g, b);
}

function fmtMoney(v, devise) {
  return Number(v || 0).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " " + (devise || "EUR");
}

function fmtDate(d) {
  return d ? new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" }) : "-";
}

// pdf-lib draws from bottom-left; helper converts top-relative Y on A4 (841.89pt)
function ty(y) { return 841.89 - y; }

// --- PDF builder using pdf-lib ---

async function buildPDF({ numFacture, agence, clientNom, clientEmail, entreprise, pays, montant, devise, plan, date, type, periode }) {
  console.log("[invoice] Génération PDF (pdf-lib)...");

  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]); // A4

  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold    = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const hasTVA    = TVA_PAYS.includes(pays || "");
  const montantHT = hasTVA ? (Number(montant) / 1.2).toFixed(2) : Number(montant).toFixed(2);
  const tvaAmount = hasTVA ? (Number(montant) - Number(montantHT)).toFixed(2) : null;
  const montantTTC = Number(montant).toFixed(2);

  const BLACK  = hexToRgb("#0f172a");
  const MUTED  = hexToRgb("#64748b");
  const LIGHT  = hexToRgb("#e2e8f0");
  const WHITE  = rgb(1, 1, 1);
  const DARK   = rgb(0.06, 0.06, 0.06);
  const BGROW  = hexToRgb("#f1f5f9");

  // ── Header banner (dark bg) ───────────────────────────────────────────────
  page.drawRectangle({ x: 50, y: ty(120), width: 495, height: 80, color: DARK });

  // Agency name
  page.drawText(agence.nom || "AkilAI", { x: 65, y: ty(72), size: 20, font: bold, color: WHITE });
  page.drawText(agence.email || "bonjour@akilai.fr", { x: 65, y: ty(88), size: 8, font: regular, color: rgb(0.67, 0.67, 0.67) });
  page.drawText(agence.site  || "akilai.fr",         { x: 65, y: ty(98), size: 8, font: regular, color: rgb(0.67, 0.67, 0.67) });

  // FACTURE label (right-aligned manually)
  page.drawText("FACTURE", { x: 370, y: ty(72), size: 24, font: bold, color: WHITE });
  page.drawText(`N\xB0 ${numFacture}`, { x: 390, y: ty(90), size: 9, font: regular, color: rgb(0.67, 0.67, 0.67) });

  // ── Two-column info ───────────────────────────────────────────────────────
  let leftY = 140;

  page.drawText("EMETTEUR", { x: 50, y: ty(leftY), size: 7, font: bold, color: MUTED });
  leftY += 14;
  page.drawText(agence.nom || "AkilAI", { x: 50, y: ty(leftY), size: 10, font: bold, color: BLACK });
  leftY += 13;
  if (agence.adresse) { page.drawText(agence.adresse, { x: 50, y: ty(leftY), size: 8, font: regular, color: MUTED, maxWidth: 220 }); leftY += 12; }
  if (agence.siret)   { page.drawText(`SIRET : ${agence.siret}`, { x: 50, y: ty(leftY), size: 8, font: regular, color: MUTED }); leftY += 12; }
  if (agence.tel)     { page.drawText(`Tel : ${agence.tel}`,     { x: 50, y: ty(leftY), size: 8, font: regular, color: MUTED }); leftY += 12; }

  let rightY = 140;
  page.drawText("FACTURE A", { x: 320, y: ty(rightY), size: 7, font: bold, color: MUTED });
  rightY += 14;
  page.drawText(entreprise || clientNom || clientEmail || "-", { x: 320, y: ty(rightY), size: 10, font: bold, color: BLACK, maxWidth: 220 });
  rightY += 13;
  if (clientEmail && (entreprise || clientNom)) { page.drawText(clientEmail, { x: 320, y: ty(rightY), size: 8, font: regular, color: MUTED }); rightY += 12; }
  if (pays) { page.drawText(pays, { x: 320, y: ty(rightY), size: 8, font: regular, color: MUTED }); rightY += 12; }

  // Date / period
  rightY = 200;
  page.drawText(`Date : ${fmtDate(date)}`, { x: 320, y: ty(rightY), size: 8, font: regular, color: MUTED });
  if (periode) { page.drawText(`Periode : ${periode}`, { x: 320, y: ty(rightY + 12), size: 8, font: regular, color: MUTED }); }

  // ── Table ─────────────────────────────────────────────────────────────────
  const tableY = 260;

  // Header row
  page.drawRectangle({ x: 50, y: ty(tableY + 20), width: 495, height: 20, color: BGROW });
  page.drawText("Description",  { x: 60,  y: ty(tableY + 13), size: 8, font: bold, color: MUTED });
  page.drawText("Qte",          { x: 312, y: ty(tableY + 13), size: 8, font: bold, color: MUTED });
  page.drawText("Prix HT",      { x: 380, y: ty(tableY + 13), size: 8, font: bold, color: MUTED });
  page.drawText("Total HT",     { x: 460, y: ty(tableY + 13), size: 8, font: bold, color: MUTED });

  // Data row
  const rowY = tableY + 20;
  page.drawRectangle({ x: 50, y: ty(rowY + 26), width: 495, height: 26, color: rgb(1, 1, 1), borderColor: LIGHT, borderWidth: 0.5 });
  const desc = plan ? `Abonnement ${plan}${periode ? ` - ${periode}` : ""}` : (type || "Prestation AkilAI");
  page.drawText(desc,                    { x: 60,  y: ty(rowY + 16), size: 9, font: regular, color: BLACK, maxWidth: 240 });
  page.drawText("1",                     { x: 314, y: ty(rowY + 16), size: 9, font: regular, color: BLACK });
  page.drawText(fmtMoney(montantHT, devise), { x: 355, y: ty(rowY + 16), size: 9, font: regular, color: BLACK });
  page.drawText(fmtMoney(montantHT, devise), { x: 445, y: ty(rowY + 16), size: 9, font: regular, color: BLACK });

  // ── Totals ────────────────────────────────────────────────────────────────
  let totY = rowY + 46;

  page.drawLine({ start: { x: 50, y: ty(totY - 6) }, end: { x: 545, y: ty(totY - 6) }, thickness: 0.5, color: LIGHT });

  page.drawText("Sous-total HT",          { x: 350, y: ty(totY + 10), size: 8, font: regular, color: MUTED });
  page.drawText(fmtMoney(montantHT, devise), { x: 445, y: ty(totY + 10), size: 8, font: regular, color: BLACK });
  totY += 20;

  if (hasTVA) {
    page.drawText("TVA 20 %",               { x: 350, y: ty(totY + 10), size: 8, font: regular, color: MUTED });
    page.drawText(fmtMoney(tvaAmount, devise), { x: 445, y: ty(totY + 10), size: 8, font: regular, color: BLACK });
    totY += 20;
  } else {
    page.drawText("TVA non applicable (art. 293 B CGI)", { x: 290, y: ty(totY + 10), size: 7, font: regular, color: MUTED });
    totY += 20;
  }

  page.drawLine({ start: { x: 340, y: ty(totY) }, end: { x: 545, y: ty(totY) }, thickness: 0.5, color: LIGHT });
  totY += 4;
  page.drawRectangle({ x: 340, y: ty(totY + 22), width: 205, height: 22, color: DARK });
  page.drawText(hasTVA ? "Total TTC" : "Total", { x: 350, y: ty(totY + 14), size: 10, font: bold, color: WHITE });
  page.drawText(fmtMoney(montantTTC, devise),    { x: 440, y: ty(totY + 14), size: 10, font: bold, color: WHITE });

  // ── Footer ────────────────────────────────────────────────────────────────
  const footer = `${agence.nom || "AkilAI"}  |  ${agence.email || "bonjour@akilai.fr"}  |  ${agence.site || "akilai.fr"}`;
  page.drawText(footer,                       { x: 50, y: ty(820), size: 7, font: regular, color: MUTED });
  page.drawText(`Facture ${numFacture}`,      { x: 50, y: ty(830), size: 7, font: regular, color: MUTED });

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}

// --- Cloudinary upload ---

async function uploadToCloudinary(pdfBuffer, numFacture) {
  console.log("[invoice] Upload Cloudinary...");
  configureCloudinary();
  const b64 = pdfBuffer.toString("base64");
  const dataUri = `data:application/pdf;base64,${b64}`;
  const result = await cloudinary.uploader.upload(dataUri, {
    resource_type: "raw",
    folder: "akilai/factures",
    public_id: `facture-${numFacture}`,
    format: "pdf",
    overwrite: true,
  });
  const pdfUrl = result.secure_url;
  console.log("[invoice] URL PDF:", pdfUrl);
  return pdfUrl;
}

// --- Email sender ---

const { facture: factureTpl } = require("../email-templates");
const { getEmailCorps } = require("../email-config");

async function sendInvoiceEmail(email, nom, numFacture, pdfBuffer, periode, montant, plan, pdfUrl) {
  if (!RESEND_API_KEY || !email) return;
  console.log("[invoice] Envoi email a:", email);
  const b64 = pdfBuffer.toString("base64");
  const _corps = await getEmailCorps("facture").catch(() => null);
  const downloadLink = pdfUrl
    ? `\n\nVous pouvez aussi telecharger votre facture : <a href="${pdfUrl}" target="_blank">Telecharger la facture ${numFacture}</a>`
    : "";
  const corpsFinal = (_corps || "") + downloadLink;
  const tpl = factureTpl({ nom: nom || email, numFacture, periode, montantTTC: montant, plan, corps: corpsFinal });
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
    body: JSON.stringify({
      from: "AkilAI <noreply@akilai.fr>",
      to: email,
      subject: tpl.subject,
      html: tpl.html,
      attachments: [{ filename: `${numFacture}.pdf`, content: b64 }],
    }),
  });
  const d = await res.json();
  console.log("[invoice] Resend statut:", d.id || d.error || d.message);
}

// --- Handler ---

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return preflight();
  if (!verifyAdminToken(event)) return unauthorized();
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  try {
    const { paiementId, clientNom, clientEmail, entreprise, pays, montant, devise, plan, date, type, periode, sendEmail } =
      JSON.parse(event.body || "{}");

    if (!paiementId) return err("paiementId requis", 400);

    const [numFacture, agence] = await Promise.all([
      getNextInvoiceNumber(),
      getAgencyInfo(),
    ]);

    const pdfBuffer = await buildPDF({
      numFacture, agence,
      clientNom, clientEmail, entreprise, pays,
      montant, devise, plan, date, type, periode,
    });

    // Upload vers Cloudinary si configure
    let pdfUrl = null;
    if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
      try {
        pdfUrl = await uploadToCloudinary(pdfBuffer, numFacture);
      } catch (e) {
        console.error("[invoice] Cloudinary upload error:", e.message);
      }
    } else {
      console.warn("[invoice] Cloudinary non configure - skip upload");
    }

    // PATCH Airtable : N° Facture + Facture URL
    const airtableFields = { "N° Facture": numFacture };
    if (pdfUrl) airtableFields["Facture URL"] = pdfUrl;

    const patch = await fetch(`${BASE_URL}/${PAIEMENTS_TABLE}/${paiementId}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ fields: airtableFields }),
    });
    if (!patch.ok) {
      const t = await patch.text();
      console.error("[invoice] Airtable patch error:", t);
    }

    if (sendEmail && clientEmail) {
      await sendInvoiceEmail(clientEmail, entreprise || clientNom, numFacture, pdfBuffer, periode, montant, plan, pdfUrl);
    }

    return {
      statusCode: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({
        ok: true,
        numFacture,
        pdfUrl,
        pdf: pdfBuffer.toString("base64"),
      }),
    };
  } catch (e) {
    console.error("[invoice] ERROR:", e.message, e.stack);
    return err(e.message);
  }
};
