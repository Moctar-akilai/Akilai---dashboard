// Public config endpoint — no admin token required
// Returns only safe, client-facing settings
const { BASE_URL, headers, ok, err, preflight } = require("./config");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return preflight();

  try {
    const res = await fetch(`${BASE_URL}/Configurations?maxRecords=1`, { headers });
    const data = await res.json();
    if (data.error) return ok({ bandeauSuspension: "", horaireSupport: "Lundi–Vendredi, 9h–18h" });

    const f = data.records?.[0]?.fields || {};
    return ok({
      bandeauSuspension: f["Bandeau Suspension"] || "",
      horaireSupport: f["Horaire Support"] || "Lundi–Vendredi, 9h–18h",
    });
  } catch (e) {
    return err(e.message);
  }
};
