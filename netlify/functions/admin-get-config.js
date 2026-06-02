const { BASE_URL, headers, ok, err, preflight } = require("./config");
const { verifyAdminToken, unauthorized } = require("./admin-utils");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return preflight();
  if (!verifyAdminToken(event)) return unauthorized();

  try {
    const res = await fetch(`${BASE_URL}/Configurations?maxRecords=1`, { headers });
    const data = await res.json();
    if (data.error) return err(data.error.message || "Airtable error");

    const rec = data.records?.[0];
    if (!rec) return ok({ config: {}, recordId: null });

    const f = rec.fields || {};
    const parse = (key, def) => {
      try { return JSON.parse(f[key] || "null") ?? def; } catch { return def; }
    };

    return ok({
      recordId: rec.id,
      config: {
        tarifsPlans:      parse("Tarifs Plans", null),
        infosAgence:      parse("Infos Agence", null),
        templatesEmails:  parse("Templates Emails", null),
        seuilVapi:        Number(f["Seuil Vapi"] || 5),
        adminsSecondaires:parse("Admins Secondaires", []),
        delaiTicketAlerte:Number(f["Delai Ticket Alerte"] || 24),
        bandeauSuspension:f["Bandeau Suspension"] || "",
        horaireSupport:   f["Horaire Support"] || "Lundi–Vendredi, 9h–18h",
        finances:         parse("Finance", null),
      },
    });
  } catch (e) {
    return err(e.message);
  }
};
