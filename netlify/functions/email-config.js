const { BASE_URL, headers } = require("./config");

let _cache = null;
let _cacheTs = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 min

async function getEmailTemplates() {
  const now = Date.now();
  if (_cache && now - _cacheTs < CACHE_TTL) return _cache;
  try {
    const res = await fetch(`${BASE_URL}/Configurations?maxRecords=1`, { headers });
    const data = await res.json();
    const f = data.records?.[0]?.fields || {};
    _cache = JSON.parse(f["Templates Emails"] || "null") || {};
    _cacheTs = now;
    return _cache;
  } catch {
    return {};
  }
}

async function getEmailCorps(templateKey) {
  const tpls = await getEmailTemplates();
  return tpls?.[templateKey]?.corps || null;
}

async function getEmailSubject(templateKey) {
  const tpls = await getEmailTemplates();
  return tpls?.[templateKey]?.subject || null;
}

module.exports = { getEmailCorps, getEmailSubject };
