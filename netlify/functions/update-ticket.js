const { BASE_URL, headers, ok, err, preflight } = require("./config");

/**
 * PATCH /Support/{id}
 * Body : { id, statut?, message? }
 *   - message : { auteur, role, text } → écrit dans "Nouveau message"
 *   - statut  : champ direct "Statut"
 */
exports.handler = async function(event, context) {
  if (event.httpMethod === "OPTIONS") return preflight();
  if (event.httpMethod !== "POST") return err("Méthode non autorisée", 405);

  let body;
  try { body = JSON.parse(event.body || "{}"); } catch(e) { return err("JSON invalide", 400); }

  const { id, statut, message } = body;
  if (!id) return err("Champ id obligatoire", 400);

  console.log("[update-ticket] id:", id, "| statut:", statut, "| message role:", message && message.role);

  const patchFields = {};

  if (message && message.text) {
    /* "Nouveau message" = champ texte brut pour la dernière réponse client */
    patchFields["Nouveau message"] = message.text;
  }
  if (statut) patchFields["Statut"] = statut;

  if (Object.keys(patchFields).length === 0) return ok({ ok: true, noChange: true });

  try {
    const res = await fetch(`${BASE_URL}/Support/${id}`, {
      method:  "PATCH",
      headers,
      body:    JSON.stringify({ fields: patchFields }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("[update-ticket] Airtable PATCH error:", res.status, text);
      return err(`Airtable ${res.status}`, 502);
    }

    console.log("[update-ticket] PATCH OK pour", id);
    return ok({ ok: true });
  } catch (e) {
    console.error("[update-ticket] Exception:", e.message, e.stack);
    return err(e.message);
  }
};
