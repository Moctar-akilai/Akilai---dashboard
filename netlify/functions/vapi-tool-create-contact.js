const { ok, err, preflight } = require("./config");

const BASE_SITE = process.env.URL || "https://portal-akilai.netlify.app";

exports.handler = async function(event) {
  if (event.httpMethod === "OPTIONS") return preflight();
  if (event.httpMethod !== "POST") return err("Method Not Allowed", 405);

  try {
    const body     = JSON.parse(event.body || "{}");
    const vapiMsg  = body.message || body;
    const toolCall = vapiMsg.toolCallList?.[0] || vapiMsg.toolCalls?.[0];
    const args     = toolCall?.function?.arguments || body.arguments || body;
    const userId   =
      args.userId ||
      vapiMsg.call?.assistantOverrides?.metadata?.userId ||
      vapiMsg.call?.assistant?.metadata?.userId ||
      vapiMsg.call?.metadata?.userId ||
      body.userId || "";
    console.log("[vapi-tool-create-contact] userId:", userId, "| args:", JSON.stringify(args));

    const nom       = args.nom       || body.nom       || "";
    const prenom    = args.prenom    || body.prenom    || "";
    const telephone = args.telephone || body.telephone || "";
    const email     = args.email     || body.email     || "";
    const resume    = args.resume    || body.resume    || "";

    if (!userId)    return err("userId requis", 400);
    if (!telephone) return err("telephone requis", 400);

    const res = await fetch(`${BASE_SITE}/.netlify/functions/crm-router`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId,
        contactData: { nom, prenom, numero: telephone, email, source: "Appel vocal" },
        callData:    { resume, statut: "Terminé", duree: 0 },
      }),
    });

    const data = await res.json();
    console.log("[vapi-tool-create-contact] crm-router:", data);

    return ok({
      success:   true,
      contactId: data.id || null,
      message:   `Contact ${nom || telephone} enregistré dans le CRM.`,
    });
  } catch (e) {
    console.error("[vapi-tool-create-contact] Exception:", e.message);
    return err(e.message);
  }
};
