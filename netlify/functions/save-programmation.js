const { BASE_URL, headers, ok, err, preflight } = require("./config");

/**
 * POST — PATCH /Automatisations/{recordId}
 * Body : { id, jours, heure, recurrence }
 *   id         : Airtable record ID (recXXX)
 *   jours      : number[] — 1=Lun … 7=Dim (ex: [1,2,3,4,5])
 *   heure      : "HH:MM" (heure de début, ex: "09:00")
 *   recurrence : "quotidien"|"hebdo"|"mensuel"
 *
 * Champs Airtable cibles :
 *   "Jours actifs"   multipleSelects  ["Lundi","Mercredi",...]
 *   "Heure de Début" singleSelect     "09:00"
 *   "Heure de fin"   singleSelect     "18:00" (calculé : heure + 9h par défaut)
 */

const NUM_TO_JOUR = {
  1: "Lundi", 2: "Mardi", 3: "Mercredi",
  4: "Jeudi", 5: "Vendredi", 6: "Samedi", 7: "Dimanche",
};

exports.handler = async function(event, context) {
  if (event.httpMethod === "OPTIONS") return preflight();
  if (event.httpMethod !== "POST") return err("Méthode non autorisée", 405);

  let body;
  try { body = JSON.parse(event.body || "{}"); } catch(e) { return err("JSON invalide", 400); }

  const { id, jours, heure, recurrence } = body;
  if (!id) return err("Champ id obligatoire", 400);

  /* Convertir numéros → labels français */
  const joursActifs = (jours || []).map(n => NUM_TO_JOUR[n]).filter(Boolean);
  const heureDebut  = heure || "08:00";

  /* Heure de fin = heure de début + 1h (ex: 09:00 → 10:00) */
  const [hh, mm] = heureDebut.split(":").map(Number);
  const heureFin = String((hh + 1) % 24).padStart(2, "0") + ":" + String(mm).padStart(2, "0");

  console.log("[save-programmation] id:", id, "joursActifs:", joursActifs, "heureDebut:", heureDebut, "heureFin:", heureFin);

  try {
    const res = await fetch(`${BASE_URL}/Automatisations/${id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({
        fields: {
          "Jours actifs":   joursActifs,
          "Heure de Début": heureDebut,
          "Heure de fin":   heureFin,
        },
      }),
    });

    console.log("[save-programmation] Airtable status:", res.status);

    if (!res.ok) {
      const text = await res.text();
      console.error("[save-programmation] Airtable error:", res.status, text);
      return err(`Airtable ${res.status}`, 502);
    }

    const data = await res.json();
    console.log("[save-programmation] Airtable updated fields:", JSON.stringify(data.fields));
    return ok({ ok: true });
  } catch (e) {
    console.error("[save-programmation] Exception:", e.message);
    return err(e.message);
  }
};
