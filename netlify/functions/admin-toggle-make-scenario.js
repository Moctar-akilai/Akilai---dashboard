const { BASE_URL, headers: airtableHeaders, ok, err, preflight, corsHeaders } = require('./config')
const { verifyAdminToken, unauthorized } = require('./admin-utils')

const MAKE_BASE = 'https://eu1.make.com/api/v2'
const AUTOMATIONS_TABLE = 'tble4KroqvA1JodJs'

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return preflight()
  if (!verifyAdminToken(event)) return unauthorized()
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: 'Method not allowed' }) }
  }

  const MAKE_API_KEY = process.env.MAKE_API_KEY
  if (!MAKE_API_KEY) return err('MAKE_API_KEY not configured')

  const { scenarioId, action } = JSON.parse(event.body || '{}')
  if (!scenarioId || !['activate', 'deactivate'].includes(action)) {
    return err('scenarioId et action (activate|deactivate) requis')
  }

  const makeHeaders = { 'Authorization': `Token ${MAKE_API_KEY}`, 'Content-Type': 'application/json' }
  const endpoint = action === 'activate' ? 'start' : 'stop'

  try {
    // 1. Toggle scénario Make
    const makeRes = await fetch(`${MAKE_BASE}/scenarios/${scenarioId}/${endpoint}`, {
      method: 'POST',
      headers: makeHeaders,
    })
    const makeText = await makeRes.text()
    console.log(`[make-toggle] ${endpoint} ${scenarioId} → ${makeRes.status}: ${makeText.substring(0, 200)}`)

    if (!makeRes.ok) {
      return err(`Make API error ${makeRes.status}: ${makeText}`)
    }

    const isActive = action === 'activate'
    const newStatut = isActive ? 'Actif' : 'Inactif'

    // 2. Mettre à jour Airtable si un record correspond
    try {
      const filterFormula = encodeURIComponent(`{Make scenario ID}="${scenarioId}"`)
      const searchRes = await fetch(
        `${BASE_URL}/${AUTOMATIONS_TABLE}?filterByFormula=${filterFormula}&maxRecords=1`,
        { headers: airtableHeaders }
      )
      const searchData = await searchRes.json()
      const record = searchData?.records?.[0]

      if (record) {
        await fetch(`${BASE_URL}/${AUTOMATIONS_TABLE}/${record.id}`, {
          method: 'PATCH',
          headers: airtableHeaders,
          body: JSON.stringify({ fields: { Statut: newStatut } }),
        })
        console.log(`[make-toggle] Airtable mis à jour: ${record.id} → ${newStatut}`)
      } else {
        console.warn(`[make-toggle] Aucun record Airtable pour scenarioId=${scenarioId}`)
      }
    } catch (atErr) {
      console.warn('[make-toggle] Airtable update failed (non bloquant):', atErr.message)
    }

    return ok({ success: true, isActive })
  } catch (e) {
    console.error('[make-toggle] exception:', e.message)
    return err(e.message)
  }
}
