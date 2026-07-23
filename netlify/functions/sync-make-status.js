const { BASE_URL, headers, ok, err, preflight } = require('./config')
const { verifyAdminToken, unauthorized } = require('./admin-utils')

const MAKE_BASE = 'https://eu1.make.com/api/v2'
const AUTOMATIONS_TABLE = 'tble4KroqvA1JodJs'

function makeStatus(s) {
  if (s.isPaused)             return 'Erreur'
  if (s.isActive)             return 'Actif'
  return 'Inactif'
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return preflight()
  // Allow cron (no auth header) and admin calls
  const isCron = event.headers?.['x-netlify-event'] === 'schedule'
  if (!isCron && !verifyAdminToken(event)) return unauthorized()

  const MAKE_API_KEY = process.env.MAKE_API_KEY
  if (!MAKE_API_KEY) return err('MAKE_API_KEY not configured')

  const makeHeaders = { Authorization: `Token ${MAKE_API_KEY}`, 'Content-Type': 'application/json' }

  try {
    // 1. Resolve teamId
    const orgsRes = await fetch(`${MAKE_BASE}/organizations?pg[limit]=5`, { headers: makeHeaders })
    if (!orgsRes.ok) return err(`Make /organizations error ${orgsRes.status}`)
    const orgsData = await orgsRes.json()
    const organizationId = orgsData?.organizations?.[0]?.id
    if (!organizationId) return err('Aucune organisation Make')

    const teamsRes = await fetch(`${MAKE_BASE}/teams?organizationId=${organizationId}&pg[limit]=10`, { headers: makeHeaders })
    const teamsData = await teamsRes.json()
    const teamId = teamsData?.teams?.[0]?.id
    if (!teamId) return err('Aucune team Make')

    // 2. Fetch all Make scenarios
    const scenRes = await fetch(`${MAKE_BASE}/scenarios?teamId=${teamId}&pg[limit]=100`, { headers: makeHeaders })
    const scenData = await scenRes.json()
    const makeScenarios = scenData?.scenarios || []
    const makeMap = {}
    makeScenarios.forEach(s => { makeMap[String(s.id)] = s })

    // 3. Fetch all Airtable automations with Make scenario ID
    let allRecords = [], offset = null
    do {
      const params = new URLSearchParams({ maxRecords: '100' })
      if (offset) params.set('offset', offset)
      const atRes = await fetch(`${BASE_URL}/${AUTOMATIONS_TABLE}?${params}`, { headers })
      const atData = await atRes.json()
      allRecords = allRecords.concat(atData.records || [])
      offset = atData.offset || null
    } while (offset)

    // 4. Compare and patch mismatches
    let synced = 0, alreadyOk = 0, notFound = 0
    const details = []

    await Promise.all(allRecords.map(async rec => {
      const scenarioId = rec.fields?.['Make scenario ID']
      if (!scenarioId) { notFound++; return }

      const makeScen = makeMap[String(scenarioId)]
      if (!makeScen) { notFound++; return }

      const expectedStatut = makeStatus(makeScen)
      const currentStatut  = rec.fields?.Statut || ''

      if (expectedStatut === currentStatut) { alreadyOk++; return }

      // Patch Airtable
      const patchRes = await fetch(`${BASE_URL}/${AUTOMATIONS_TABLE}/${rec.id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ fields: { Statut: expectedStatut } }),
      })
      if (patchRes.ok) {
        synced++
        details.push({ id: rec.id, nom: rec.fields?.Nom || rec.id, scenarioId, before: currentStatut, after: expectedStatut })
        console.log(`[sync-make] ${rec.fields?.Nom || rec.id} : ${currentStatut} → ${expectedStatut}`)
      }
    }))

    console.log(`[sync-make] Résultat : synced=${synced} alreadyOk=${alreadyOk} notFound=${notFound}`)
    return ok({ synced, alreadyOk, notFound, details })
  } catch (e) {
    console.error('[sync-make] exception:', e.message)
    return err(e.message)
  }
}
