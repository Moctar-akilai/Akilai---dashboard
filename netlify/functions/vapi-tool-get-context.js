const { preflight } = require("./config");

const SERVER_URL = process.env.URL || "https://portal-akilai.netlify.app";

exports.handler = async function(event) {
  if (event.httpMethod === "OPTIONS") return preflight();
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };

  try {
    const body       = JSON.parse(event.body || "{}");
    const vapiMsg    = body.message || body;
    const toolCall   = vapiMsg.toolCallList?.[0] || vapiMsg.toolCalls?.[0];
    const toolCallId = toolCall?.id || "tool-call-1";
    const args       = toolCall?.function?.arguments || body.arguments || body;

    const userId = event.headers?.["x-user-id"] || event.headers?.["X-User-Id"] || args.userId || "";
    const numero = args.numero || "";

    console.log("[vapi-tool-get-context] userId:", userId, "| numero:", numero);

    const vapiResult = (result) => ({
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ results: [{ toolCallId, result }] }),
    });

    if (!userId || !numero) {
      return vapiResult("Nouveau client, première interaction.");
    }

    const res  = await fetch(
      `${SERVER_URL}/.netlify/functions/get-contact-context?userId=${encodeURIComponent(userId)}&numero=${encodeURIComponent(numero)}`
    );
    const ctx  = await res.json();

    console.log("[vapi-tool-get-context] found:", ctx.found);

    if (!ctx.found) {
      return vapiResult("Nouveau client, première interaction.");
    }

    const prenom = ctx.prenom || ctx.nom || "le client";
    const nb     = ctx.nbInteractions || 0;
    const dernier = ctx.dernierContact
      ? new Date(ctx.dernierContact).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })
      : null;
    const contexte = ctx.contexte || "";

    let result = `Client connu : ${prenom}${ctx.nom && ctx.prenom ? " " + ctx.nom : ""}.`;
    if (nb > 0) result += ` ${nb} interaction(s) précédente(s).`;
    if (dernier) result += ` Dernier contact : ${dernier}.`;
    if (contexte) result += ` Dernier échange : ${contexte}`;

    return vapiResult(result);
  } catch (e) {
    console.error("[vapi-tool-get-context] ERREUR:", e.message);
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ results: [{ toolCallId: "tool-call-1", result: "Nouveau client, première interaction." }] }),
    };
  }
};
