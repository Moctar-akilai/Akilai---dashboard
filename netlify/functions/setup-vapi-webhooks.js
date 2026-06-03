const { preflight, corsHeaders } = require("./config");

const WEBHOOK_URL = "https://portal-akilai.netlify.app/.netlify/functions/vapi-webhook";

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return preflight();
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: "Méthode non autorisée" }) };
  }

  const VAPI_API_KEY = process.env.VAPI_API_KEY;
  if (!VAPI_API_KEY) {
    return {
      statusCode: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ error: "VAPI_API_KEY non configuré", missingKey: true }),
    };
  }

  const vapiHeaders = {
    Authorization:  `Bearer ${VAPI_API_KEY}`,
    "Content-Type": "application/json",
  };

  try {
    // 1. Récupérer tous les assistants
    const res = await fetch("https://api.vapi.ai/assistant?limit=100", {
      headers: vapiHeaders,
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("[setup-vapi-webhooks] list error:", res.status, text);
      return { statusCode: 502, headers: corsHeaders, body: JSON.stringify({ error: `Vapi ${res.status}: ${text}` }) };
    }

    const assistants = await res.json();
    const list = Array.isArray(assistants) ? assistants : (assistants.data || []);
    console.log("[setup-vapi-webhooks] assistants trouvés:", list.length);

    // 2. PATCH serverUrl sur chaque assistant
    const results = [];
    for (const assistant of list) {
      const patch = await fetch(`https://api.vapi.ai/assistant/${assistant.id}`, {
        method:  "PATCH",
        headers: vapiHeaders,
        body:    JSON.stringify({
          serverUrl:       WEBHOOK_URL,
          serverUrlSecret: process.env.VAPI_WEBHOOK_SECRET || "",
        }),
      });
      const ok = patch.ok;
      console.log("[setup-vapi-webhooks] assistant mis à jour:", assistant.name, ok ? "✅" : "❌");
      if (!ok) {
        const errText = await patch.text();
        console.warn("[setup-vapi-webhooks] erreur:", assistant.name, errText);
      }
      results.push({ name: assistant.name, id: assistant.id, ok });
    }

    const successCount = results.filter(r => r.ok).length;
    console.log("[setup-vapi-webhooks] terminé —", successCount, "/", list.length, "configurés");

    return {
      statusCode: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ total: list.length, success: successCount, results }),
    };
  } catch (e) {
    console.error("[setup-vapi-webhooks] Exception:", e.message);
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: e.message }) };
  }
};
