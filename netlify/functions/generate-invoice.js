const { BASE_URL, headers, ok, err, preflight, corsHeaders } = require("./config");
const { verifyAdminToken, unauthorized } = require("./admin-utils");
const PDFDocument = require("pdfkit");

const PAIEMENTS_TABLE = "tblgoPGS5jbhWwXQl";
const RESEND_API_KEY = process.env.RESEND_API_KEY || "";

function zeroPad(n, len = 4) {
  return String(n).padStart(len, "0");
}

function generateInvoiceNumber() {
  const now = new Date();
  const y = now.getFullYear();
  const m = zeroPad(now.getMonth() + 1, 2);
  const rand = zeroPad(Math.floor(Math.random() * 9000) + 1000, 4);
  return `AK-${y}${m}-${rand}`;
}

function buildPDF({ numFacture, clientNom, clientEmail, montant, devise, plan, date, type }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const fmtDate = (d) =>
      d ? new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" }) : "—";
    const fmtEur = (v) =>
      Number(v || 0).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " " + (devise || "EUR");

    // Header
    doc.fontSize(22).fillColor("#0f172a").text("AkilAI", 50, 50);
    doc.fontSize(10).fillColor("#64748b").text("contact@akilai.fr  ·  akilai.fr", 50, 78);
    doc.moveDown(2);

    doc.fontSize(20).fillColor("#0f172a").text("FACTURE", { align: "right" });
    doc.fontSize(10).fillColor("#374151")
      .text(`N° ${numFacture}`, { align: "right" })
      .text(`Date : ${fmtDate(date)}`, { align: "right" });

    doc.moveDown(2);

    // Client info
    doc.fontSize(11).fillColor("#64748b").text("Facturé à :");
    doc.fontSize(12).fillColor("#0f172a").text(clientNom || clientEmail);
    if (clientEmail) doc.fontSize(10).fillColor("#374151").text(clientEmail);

    doc.moveDown(2);

    // Separator line
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor("#e2e8f0").stroke();
    doc.moveDown(0.5);

    // Table header
    doc.fontSize(10).fillColor("#64748b");
    doc.text("Description", 50, doc.y, { width: 300 });
    doc.text("Type", 350, doc.y - doc.currentLineHeight(), { width: 100 });
    doc.text("Montant", 450, doc.y - doc.currentLineHeight(), { width: 95, align: "right" });
    doc.moveDown(0.3);

    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor("#e2e8f0").stroke();
    doc.moveDown(0.5);

    // Row
    const desc = plan ? `Abonnement ${plan}` : "Prestation AkilAI";
    doc.fontSize(11).fillColor("#0f172a");
    doc.text(desc, 50, doc.y, { width: 300 });
    doc.text(type || "Abonnement", 350, doc.y - doc.currentLineHeight(), { width: 100 });
    doc.text(fmtEur(montant), 450, doc.y - doc.currentLineHeight(), { width: 95, align: "right" });

    doc.moveDown(1.5);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor("#e2e8f0").stroke();
    doc.moveDown(0.5);

    // Total
    doc.fontSize(12).fillColor("#0f172a")
      .text("Total TTC", 350, doc.y, { width: 100 })
      .text(fmtEur(montant), 450, doc.y - doc.currentLineHeight(), { width: 95, align: "right" });

    doc.moveDown(3);
    doc.fontSize(9).fillColor("#94a3b8").text(
      "AkilAI — Solutions d'automatisation IA  ·  Facture générée automatiquement",
      { align: "center" }
    );

    doc.end();
  });
}

async function sendInvoiceEmail(email, nom, numFacture, pdfBuffer) {
  if (!RESEND_API_KEY) return;
  const b64 = pdfBuffer.toString("base64");
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
    body: JSON.stringify({
      from: "AkilAI <noreply@akilai.fr>",
      to: email,
      subject: `Votre facture AkilAI — ${numFacture}`,
      html: `<p>Bonjour <strong>${nom || email}</strong>,</p>
<p>Veuillez trouver ci-joint votre facture <strong>${numFacture}</strong>.</p>
<p>Merci de votre confiance,<br/>L'équipe AkilAI</p>`,
      attachments: [{ filename: `${numFacture}.pdf`, content: b64 }],
    }),
  });
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return preflight();
  if (!verifyAdminToken(event)) return unauthorized();
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  try {
    const { paiementId, clientNom, clientEmail, montant, devise, plan, date, type, sendEmail } =
      JSON.parse(event.body || "{}");

    if (!paiementId) return err("paiementId requis", 400);

    const numFacture = generateInvoiceNumber();

    // Build PDF
    const pdfBuffer = await buildPDF({ numFacture, clientNom, clientEmail, montant, devise, plan, date, type });

    // Persist N° Facture to Airtable
    const patch = await fetch(`${BASE_URL}/${PAIEMENTS_TABLE}/${paiementId}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ fields: { "N° Facture": numFacture } }),
    });
    if (!patch.ok) {
      const t = await patch.text();
      console.error("[generate-invoice] Airtable patch error:", t);
    }

    // Send email if requested
    if (sendEmail && clientEmail) {
      await sendInvoiceEmail(clientEmail, clientNom, numFacture, pdfBuffer);
    }

    // Return PDF as base64 so frontend can trigger download
    return {
      statusCode: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ok: true,
        numFacture,
        pdf: pdfBuffer.toString("base64"),
      }),
    };
  } catch (e) {
    console.error("[generate-invoice] ERROR:", e.message);
    return err(e.message);
  }
};
