const { BASE_URL, headers, ok, err, preflight } = require("./config");

const CONTACTS_TABLE = "tblmBABwZaL2HTSx6";

exports.handler = async function(event) {
  if (event.httpMethod === "OPTIONS") return preflight();
  if (event.httpMethod !== "PATCH") return err("Method Not Allowed", 405);

  try {
    const { id, fields } = JSON.parse(event.body || "{}");
    if (!id || !fields) return err("id et fields requis", 400);

    const res  = await fetch(`${BASE_URL}/${CONTACTS_TABLE}/${id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ fields }),
    });
    const data = await res.json();

    if (!res.ok) {
      console.error("[update-contact] Airtable error:", JSON.stringify(data));
      return err(`Airtable ${res.status}`, 502);
    }

    return ok({ success: true, record: data });
  } catch (e) {
    console.error("[update-contact] Exception:", e.message);
    return err(e.message);
  }
};
