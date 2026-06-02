const { BASE_URL, headers, ok, err, preflight, corsHeaders } = require("./config");
const { verifyAdminToken, unauthorized } = require("./admin-utils");
const PDFDocument = require("pdfkit");
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

// --- PDF builder ---

const TVA_PAYS = ["France", "Belgique", "france", "belgique", "FR", "BE"];

function buildPDF({ numFacture, agence, clientNom, clientEmail, entreprise, pays, montant, devise, plan, date, type, periode }) {
  return new Promise((resolve, reject) => {
    try {
      console.log("[invoice] Génération PDF...");
      const doc = new PDFDocument({ size: "A4", margin: 50 });
      const chunks = [];
      doc.on("data", (c) => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", (e) => { console.error("[invoice] PDFKit error:", e.message); reject(e); });

      const fmtDate = (d) =>
        d ? new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" }) : "—";
      const fmtMoney = (v) =>
        Number(v || 0).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " " + (devise || "EUR");

      const hasTVA = TVA_PAYS.includes(pays || "");
      const montantHT = hasTVA ? (Number(montant) / 1.2).toFixed(2) : Number(montant).toFixed(2);
      const tvaAmount = hasTVA ? (Number(montant) - Number(montantHT)).toFixed(2) : null;
      const montantTTC = Number(montant).toFixed(2);

      const BLACK = "#0f172a";
      const MUTED = "#64748b";
      const LIGHT = "#e2e8f0";

      // ── Header banner ──────────────────────────────────────────────────────────
      doc.rect(50, 40, 495, 80).fill("#0f0f0f");

      doc.fontSize(22).fillColor("#ffffff").font("Helvetica-Bold")
        .text(agence.nom || "AkilAI", 65, 60, { width: 200 });
      doc.fontSize(9).fillColor("#aaaaaa").font("Helvetica")
        .text(agence.email || "bonjour@akilai.fr", 65, 87)
        .text(agence.site || "akilai.fr", 65, 99);

      doc.fontSize(28).fillColor("#ffffff").font("Helvetica-Bold")
        .text("FACTURE", 350, 55, { width: 180, align: "right" });
      doc.fontSize(11).fillColor("#aaaaaa").font("Helvetica")
        .text(`N° ${numFacture}`, 350, 90, { width: 180, align: "right" });

      // ── Two-column info block ──────────────────────────────────────────────────
      const colY = 145;

      doc.fontSize(8).fillColor(MUTED).font("Helvetica").text("ÉMETTEUR", 50, colY);
      doc.fontSize(10).fillColor(BLACK).font("Helvetica-Bold").text(agence.nom || "AkilAI", 50, colY + 14);
      doc.fontSize(9).fillColor(MUTED).font("Helvetica");
      if (agence.adresse) doc.text(agence.adresse, 50, doc.y + 2, { width: 230 });
      if (agence.siret) doc.text(`SIRET : ${agence.siret}`, 50, doc.y + 2);
      if (agence.tel) doc.text(`Tél : ${agence.tel}`, 50, doc.y + 2);

      doc.fontSize(8).fillColor(MUTED).font("Helvetica").text("FACTURÉ À", 320, colY);
      doc.fontSize(10).fillColor(BLACK).font("Helvetica-Bold").text(entreprise || clientNom || clientEmail, 320, colY + 14, { width: 225 });
      doc.fontSize(9).fillColor(MUTED).font("Helvetica");
      if (clientEmail && (entreprise || clientNom)) doc.text(clientEmail, 320, doc.y + 2, { width: 225 });
      if (pays) doc.text(pays, 320, doc.y + 2, { width: 225 });

      const infoY = colY + 14;
      doc.fontSize(9).fillColor(MUTED).text(`Date : ${fmtDate(date)}`, 320, infoY + 55, { width: 225, align: "right" });
      if (periode) doc.text(`Période : ${periode}`, 320, doc.y + 2, { width: 225, align: "right" });

      // ── Table ──────────────────────────────────────────────────────────────────
      const tableY = Math.max(doc.y, 270) + 20;

      doc.rect(50, tableY, 495, 22).fill("#f1f5f9");
      doc.fontSize(9).fillColor(MUTED).font("Helvetica");
      doc.text("Description", 60, tableY + 6, { width: 250 });
      doc.text("Qté", 310, tableY + 6, { width: 50, align: "center" });
      doc.text("Prix HT", 360, tableY + 6, { width: 80, align: "right" });
      doc.text("Total HT", 440, tableY + 6, { width: 95, align: "right" });

      const rowY = tableY + 22;
      const desc = plan ? `Abonnement ${plan}${periode ? ` — ${periode}` : ""}` : (type || "Prestation AkilAI");
      doc.rect(50, rowY, 495, 28).fill("#ffffff").strokeColor(LIGHT).lineWidth(0.5).stroke();
      doc.fontSize(10).fillColor(BLACK).font("Helvetica");
      doc.text(desc, 60, rowY + 8, { width: 250 });
      doc.text("1", 310, rowY + 8, { width: 50, align: "center" });
      doc.text(fmtMoney(montantHT), 360, rowY + 8, { width: 80, align: "right" });
      doc.text(fmtMoney(montantHT), 440, rowY + 8, { width: 95, align: "right" });

      // ── Totals ────────────────────────────────────────────────────────────────
      const totY = rowY + 44;
      const totX = 350;
      const valX = 440;
      const valW = 95;

      doc.moveTo(50, totY - 8).lineTo(545, totY - 8).strokeColor(LIGHT).lineWidth(0.5).stroke();

      doc.fontSize(9).fillColor(MUTED).font("Helvetica");
      doc.text("Sous-total HT", totX, totY, { width: 85, align: "right" });
      doc.fontSize(9).fillColor(BLACK);
      doc.text(fmtMoney(montantHT), valX, totY, { width: valW, align: "right" });

      if (hasTVA) {
        doc.fontSize(9).fillColor(MUTED).font("Helvetica");
        doc.text("TVA 20 %", totX, totY + 16, { width: 85, align: "right" });
        doc.fontSize(9).fillColor(BLACK);
        doc.text(fmtMoney(tvaAmount), valX, totY + 16, { width: valW, align: "right" });

        doc.moveTo(350, totY + 32).lineTo(545, totY + 32).strokeColor(LIGHT).lineWidth(0.5).stroke();
        doc.rect(350, totY + 36, 195, 24).fill("#0f0f0f");
        doc.fontSize(11).fillColor("#ffffff").font("Helvetica-Bold");
        doc.text("Total TTC", 360, totY + 42, { width: 75, align: "right" });
        doc.text(fmtMoney(montantTTC), valX, totY + 42, { width: valW, align: "right" });
      } else {
        doc.fontSize(8).fillColor(MUTED).font("Helvetica")
          .text("TVA non applicable (art. 293 B CGI)", totX, totY + 16, { width: 185, align: "right" });

        doc.moveTo(350, totY + 32).lineTo(545, totY + 32).strokeColor(LIGHT).lineWidth(0.5).stroke();
        doc.rect(350, totY + 36, 195, 24).fill("#0f0f0f");
        doc.fontSize(11).fillColor("#ffffff").font("Helvetica-Bold");
        doc.text("Total", 360, totY + 42, { width: 75, align: "right" });
        doc.text(fmtMoney(montantTTC), valX, totY + 42, { width: valW, align: "right" });
      }

      // ── Footer ────────────────────────────────────────────────────────────────
      doc.fontSize(8).fillColor(MUTED).font("Helvetica")
        .text(`${agence.nom || "AkilAI"} — ${agence.email || "bonjour@akilai.fr"} — ${agence.site || "akilai.fr"}`, 50, 780, { align: "center", width: 495 })
        .text(`Facture ${numFacture} — générée automatiquement`, 50, 790, { align: "center", width: 495 });

      doc.end();
    } catch (e) {
      console.error("[invoice] buildPDF exception:", e.message, e.stack);
      reject(e);
    }
  });
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

const { facture: factureTpl } = require("./email-templates");
const { getEmailCorps } = require("./email-config");

async function sendInvoiceEmail(email, nom, numFacture, pdfBuffer, periode, montant, plan, pdfUrl) {
  if (!RESEND_API_KEY || !email) return;
  console.log("[invoice] Envoi email à:", email);
  const b64 = pdfBuffer.toString("base64");
  const _corps = await getEmailCorps("facture").catch(() => null);

  // Append download link to corps
  const downloadLink = pdfUrl
    ? `\n\nVous pouvez aussi télécharger votre facture : <a href="${pdfUrl}" target="_blank">Télécharger la facture ${numFacture}</a>`
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

    // Upload vers Cloudinary si configuré
    let pdfUrl = null;
    if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
      try {
        pdfUrl = await uploadToCloudinary(pdfBuffer, numFacture);
      } catch (e) {
        console.error("[invoice] Cloudinary upload error:", e.message);
      }
    } else {
      console.warn("[invoice] Cloudinary non configuré — skip upload");
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

    // Envoi email
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
