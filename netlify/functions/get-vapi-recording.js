const { preflight, corsHeaders } = require("./config");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return preflight();

  const { callId } = event.queryStringParameters || {};
  if (!callId) {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "callId requis" }) };
  }

  const VAPI_API_KEY = process.env.VAPI_API_KEY || "";
  if (!VAPI_API_KEY) {
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: "VAPI_API_KEY non configuré" }) };
  }

  try {
    // Appel authentifié → suit la redirection 302 vers l'URL signée
    const res = await fetch(`https://api.vapi.ai/call/${callId}/mono-recording`, {
      headers: { Authorization: `Bearer ${VAPI_API_KEY}` },
      redirect: "follow",
    });

    if (!res.ok) {
      console.error("[get-vapi-recording] Vapi error:", res.status, callId);
      return { statusCode: res.status, headers: corsHeaders, body: JSON.stringify({ error: `Vapi ${res.status}` }) };
    }

    // res.url = URL finale après redirection (URL signée)
    console.log("[get-vapi-recording] URL signée obtenue pour callId:", callId);
    return {
      statusCode: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ url: res.url }),
    };
  } catch (e) {
    console.error("[get-vapi-recording] Exception:", e.message);
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: e.message }) };
  }
};
