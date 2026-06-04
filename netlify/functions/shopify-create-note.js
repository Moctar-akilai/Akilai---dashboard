const { BASE_URL, headers: airtableHeaders, ok, err, preflight } = require("./config");

exports.handler = async function(event) {
  if (event.httpMethod === "OPTIONS") return preflight();
  if (event.httpMethod !== "POST") return err("Method Not Allowed", 405);

  try {
    const { userId, nom, numero, resume } = JSON.parse(event.body || "{}");
    if (!userId) return err("userId requis", 400);

    const searchUrl = `${BASE_URL}/Clients?filterByFormula=${encodeURIComponent(`{User ID}="${userId}"`)}&maxRecords=1`;
    const clientRes = await fetch(searchUrl, { headers: airtableHeaders });
    const clientData = await clientRes.json();
    if (!clientData.records?.length) return err("Client introuvable", 404);

    const fields    = clientData.records[0].fields;
    const apiKey    = fields["Shopify API Key"]   || "";
    const storeUrl  = fields["Shopify Store URL"] || "";
    if (!apiKey || !storeUrl)  return err("Shopify non configuré", 400);

    const cleanStore = storeUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");
    const shopHeaders = { "X-Shopify-Access-Token": apiKey, "Content-Type": "application/json" };
    const base = `https://${cleanStore}/admin/api/2024-01`;

    let customerId = null;

    // Search by phone
    if (numero) {
      const searchRes = await fetch(
        `${base}/customers/search.json?query=phone:${encodeURIComponent(numero)}`,
        { headers: shopHeaders }
      );
      if (searchRes.ok) {
        const searchData = await searchRes.json();
        if (searchData.customers?.length) customerId = searchData.customers[0].id;
      }
    }

    if (customerId) {
      // Update note on existing customer
      await fetch(`${base}/customers/${customerId}.json`, {
        method: "PUT",
        headers: shopHeaders,
        body: JSON.stringify({ customer: { id: customerId, note: resume || "" } }),
      });
    } else {
      // Create new customer
      const createRes = await fetch(`${base}/customers.json`, {
        method: "POST",
        headers: shopHeaders,
        body: JSON.stringify({
          customer: {
            first_name: nom    || "",
            phone:      numero || "",
            note:       resume || "",
          },
        }),
      });
      if (!createRes.ok) {
        const t = await createRes.text();
        console.error("[shopify-create-note] Create error:", createRes.status, t);
        return err(`Shopify API ${createRes.status}`, 502);
      }
    }

    return ok({ success: true });
  } catch (e) {
    console.error("[shopify-create-note] Exception:", e.message);
    return err(e.message);
  }
};
