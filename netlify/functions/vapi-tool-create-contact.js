const { preflight } = require("./config");

const BASE_SITE = process.env.URL || "https://portal-akilai.netlify.app";

exports.handler = async function(event) {
  if (event.httpMethod === "OPTIONS") return preflight();
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };

  try {
    const body       = JSON.parse(event.body || "{}");
    const vapiMsg    = body.message || body;
    const toolCall   = vapiMsg.toolCallList?.[0] || vapiMsg.toolCalls?.[0];
    const toolCallId = toolCall?.id || "tool-call-1";
    const args       = toolCall?.function?.arguments || body.arguments || body;
    const userId     =
      event.headers?.["x-user-id"] ||
      event.headers?.["X-User-Id"] ||
      args.userId ||
      body.userId || "";
    console.log("[vapi-tool-create-contact] userId:", userId, "| args:", JSON.stringify(args));

    const nom       = args.nom       || body.nom       || "";
    const prenom    = args.prenom    || body.prenom    || "";
    const telephone = args.telephone || body.telephone || "";
    const email     = args.email     || body.email     || "";
    const resume    = args.resume    || body.resume    || "";

    const vapiError = (msg) => ({
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ results: [{ toolCallId, result: msg }] }),
    });

    if (!userId)    return vapiError("Erreur: userId manquant.");
    if (!telephone) return vapiError("Erreur: téléphone manquant.");

    const res  = await fetch(`${BASE_SITE}/.netlify/functions/crm-router`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId,
        contactData: { nom, prenom, numero: telephone, email, source: "Appel vocal" },
        callData:    { resume, statut: "Terminé", duree: 0 },
      }),
    });

    const data       = await res.json();
    const resultText = `Contact ${nom || telephone} enregistré dans le CRM.`;
    console.log("[vapi-tool-create-contact] crm-router:", data);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ results: [{ toolCallId, result: resultText }] }),
    };
  } catch (e) {
    console.error("[vapi-tool-create-contact] ERREUR:", e.message, e.stack);
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ results: [{ toolCallId: "tool-call-1", result: "Erreur: " + e.message }] }),
    };
  }
};
