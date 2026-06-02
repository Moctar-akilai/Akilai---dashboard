const { BASE_URL, headers, ok, err, preflight } = require("./config");

const LEADS_TABLE = "tblXJoVNtimnvGRBl";

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return preflight();

  try {
    const params = new URLSearchParams({
      maxRecords: "200",
      "sort[0][field]":     "Date entrée",
      "sort[0][direction]": "desc",
    });

    const res  = await fetch(`${BASE_URL}/${LEADS_TABLE}?${params}`, { headers });
    if (!res.ok) {
      const text = await res.text();
      return err(`Airtable ${res.status}: ${text}`, 502);
    }

    const data = await res.json();
    const leads = (data.records || []).map(r => ({
      id:               r.id,
      nom:              r.fields["Nom"]                || "",
      prenom:           r.fields["Prénom"]             || "",
      entreprise:       r.fields["Entreprise"]         || "",
      email:            r.fields["Email"]              || "",
      telephone:        r.fields["Téléphone"]          || "",
      source:           r.fields["Source"]             || "",
      statut:           r.fields["Statut"]             || "Prospect",
      pays:             r.fields["Pays"]               || "",
      secteur:          r.fields["Secteur"]            || "",
      notes:            r.fields["Notes"]              || "",
      raisonPerte:      r.fields["Raison perte"]       || "",
      montantEstime:    r.fields["Montant estimé"]     || 0,
      dateEntree:       r.fields["Date entrée"]        || r.createdTime || "",
      dateDerniereAction: r.fields["Date dernière action"] || "",
      lienRdv:          r.fields["Lien RDV Calendly"]  || "",
      converti:         !!r.fields["Converti"],
    }));

    return ok({ leads });
  } catch (e) {
    console.error("[admin-get-leads] Exception:", e.message);
    return err(e.message);
  }
};
