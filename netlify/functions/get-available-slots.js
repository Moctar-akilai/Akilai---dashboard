const { BASE_URL, headers, ok, err, preflight } = require("./config");

/**
 * POST /.netlify/functions/get-available-slots
 * Body : { salonId, prestationId }
 * Retourne les créneaux disponibles J+0 à J+14, organisés par date.
 *
 * Format Horaires ouverture (champ Salons) :
 * {
 *   "lun": { "debut": "09:00", "fin": "19:00" },
 *   "mar": null,  // fermé
 *   "mer": { "debut": "09:00", "fin": "19:00" },
 *   ...
 * }
 */

const PARIS_TZ   = "Europe/Paris";
const DAYS_KEY   = ["dim","lun","mar","mer","jeu","ven","sam"];
const DAYS_LABEL = ["Dimanche","Lundi","Mardi","Mercredi","Jeudi","Vendredi","Samedi"];
const MONTHS_FR  = ["janvier","février","mars","avril","mai","juin","juillet","août","septembre","octobre","novembre","décembre"];

/** Décompose une Date en parties dans le fuseau Europe/Paris */
function parisParts(date) {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: PARIS_TZ,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(date);
  const g = t => f.find(p => p.type === t)?.value ?? "00";
  const h = g("hour") === "24" ? "00" : g("hour");
  const y = g("year"), mo = g("month"), d = g("day");
  return {
    dateStr: `${y}-${mo}-${d}`,
    hour: h, minute: g("minute"),
    wd: new Date(`${y}-${mo}-${d}T12:00:00Z`).getDay(),
  };
}

/**
 * Convertit une heure locale Paris "HH:MM" sur une date donnée en Date UTC.
 * Gère le DST automatiquement via Intl.
 */
function parisLocalToUTC(dateStr, timeStr) {
  // On sonde l'UTC en traitant naïvement la cible comme UTC
  const probe = new Date(`${dateStr}T${timeStr}:00.000Z`);
  // On récupère l'heure Paris à ce moment UTC
  const fp = new Intl.DateTimeFormat("en-CA", {
    timeZone: PARIS_TZ,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).formatToParts(probe);
  const g = t => fp.find(p => p.type === t)?.value ?? "00";
  const h = g("hour") === "24" ? "00" : g("hour");
  const parisAsUTC = new Date(`${g("year")}-${g("month")}-${g("day")}T${h}:${g("minute")}:${g("second")}.000Z`);
  // offset (ms) = parisAsUTC - probe (positif en été : Paris en avance sur UTC)
  const offsetMs = parisAsUTC.getTime() - probe.getTime();
  // UTC réel = heure locale Paris - offset
  return new Date(new Date(`${dateStr}T${timeStr}:00.000Z`).getTime() - offsetMs);
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return preflight();
  if (event.httpMethod !== "POST") return err("Méthode non autorisée", 405);

  let body;
  try { body = JSON.parse(event.body || "{}"); } catch(e) { return err("JSON invalide", 400); }

  const { salonId, prestationId } = body;
  if (!salonId || !prestationId) return err("salonId et prestationId requis", 400);

  try {
    // 1. Fetch salon + prestation en parallèle
    const [salonRes, prestRes] = await Promise.all([
      fetch(`${BASE_URL}/Salons/${salonId}`, { headers }),
      fetch(`${BASE_URL}/Prestations/${prestationId}`, { headers }),
    ]);
    if (!salonRes.ok) return err("Salon introuvable", 404);
    if (!prestRes.ok) return err("Prestation introuvable", 404);
    const sf = (await salonRes.json()).fields || {};
    const pf = (await prestRes.json()).fields || {};
    const dureeMin = pf["Durée"] || sf["Durée par défaut prestation"] || 30;

    // 2. Vérifie Offre RDV active
    if (sf["User ID"]) {
      const formula = encodeURIComponent(`{User ID}="${sf["User ID"]}"`);
      const cRes = await fetch(`${BASE_URL}/Clients?filterByFormula=${formula}&maxRecords=1`, { headers });
      const cd = cRes.ok ? await cRes.json() : { records: [] };
      if (!cd.records?.[0]?.fields?.["Offre RDV active"]) return err("Salon non disponible", 403);
    }

    // 3. Parse horaires
    let horaires = {};
    try { horaires = JSON.parse(sf["Horaires ouverture"] || "{}"); }
    catch(e) { return err("Horaires du salon invalides (JSON attendu)", 500); }

    // 4. Fetch RDV existants non-annulés sur la plage J+0..J+14
    const now     = new Date();
    const dateEnd = new Date(now.getTime() + 15 * 86400000);
    const rdvFormula = encodeURIComponent(
      `AND({Statut}!="Annulé",IS_AFTER({Date/Heure},"${now.toISOString()}"),IS_BEFORE({Date/Heure},"${dateEnd.toISOString()}"))`
    );
    const rdvRes  = await fetch(`${BASE_URL}/Rendez-vous?filterByFormula=${rdvFormula}`, { headers });
    const rdvData = rdvRes.ok ? await rdvRes.json() : { records: [] };

    // Filtre par salon en JS (le champ Salon est un linked field → tableau d'IDs)
    const booked = (rdvData.records || [])
      .filter(r => (r.fields.Salon || []).includes(salonId) && r.fields["Date/Heure"])
      .map(r => {
        const s = new Date(r.fields["Date/Heure"]);
        return { start: s, end: new Date(s.getTime() + dureeMin * 60000) };
      });

    // 5. Génère les créneaux disponibles J+0 à J+14
    const slotsByDate = {};

    for (let d = 0; d < 15; d++) {
      const probe = new Date(now.getTime() + d * 86400000);
      const pp    = parisParts(probe);
      const horaire = horaires[DAYS_KEY[pp.wd]];
      if (!horaire?.debut || !horaire?.fin) continue; // fermé ce jour

      const openUTC  = parisLocalToUTC(pp.dateStr, horaire.debut);
      const closeUTC = parisLocalToUTC(pp.dateStr, horaire.fin);

      const slots = [];
      let cur = new Date(openUTC);

      while (cur.getTime() + dureeMin * 60000 <= closeUTC.getTime()) {
        const curEnd = new Date(cur.getTime() + dureeMin * 60000);

        // Ignore les créneaux passés (marge de 15 min)
        if (curEnd.getTime() > now.getTime() + 15 * 60000) {
          const conflict = booked.some(b => cur < b.end && curEnd > b.start);
          if (!conflict) {
            const cp = parisParts(cur);
            slots.push({ start: cur.toISOString(), label: `${cp.hour}:${cp.minute}` });
          }
        }
        cur = curEnd;
      }

      if (slots.length > 0) {
        slotsByDate[pp.dateStr] = {
          label: `${DAYS_LABEL[pp.wd]} ${parseInt(pp.dateStr.split("-")[2])} ${MONTHS_FR[parseInt(pp.dateStr.split("-")[1]) - 1]}`,
          slots,
        };
      }
    }

    return ok({
      salon:      { id: salonId, nom: sf["Nom salon"] || "" },
      prestation: { id: prestationId, nom: pf.Nom || "", duree: dureeMin },
      slotsByDate,
    });
  } catch (e) {
    console.error("[get-available-slots]", e.message);
    return err(e.message);
  }
};
