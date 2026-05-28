const BASE_ID = process.env.AIRTABLE_BASE_ID || "appQapY4J7WC1iW4F";
const API_KEY  = process.env.AIRTABLE_API_KEY  || "";

const BASE_URL = `https://api.airtable.com/v0/${BASE_ID}`;

const headers = {
  Authorization: `Bearer ${API_KEY}`,
  "Content-Type": "application/json",
};

const corsHeaders = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
};

function ok(body, status = 200) {
  return { statusCode: status, headers: corsHeaders, body: JSON.stringify(body) };
}

function err(message, status = 500) {
  console.error("[AkilAI Function error]", message);
  return { statusCode: status, headers: corsHeaders, body: JSON.stringify({ ok: false, error: message }) };
}

function preflight() {
  return { statusCode: 204, headers: corsHeaders, body: "" };
}

module.exports = { BASE_URL, headers, corsHeaders, ok, err, preflight };
