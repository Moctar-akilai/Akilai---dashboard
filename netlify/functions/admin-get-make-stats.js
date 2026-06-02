const { ok, err, preflight } = require('./config')
const { verifyAdminToken, unauthorized } = require('./admin-utils')

const BASE = 'https://eu1.make.com/api/v2'

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return preflight()
  if (!verifyAdminToken(event)) return unauthorized()

  const MAKE_API_KEY = process.env.MAKE_API_KEY
  if (!MAKE_API_KEY) return err('MAKE_API_KEY not configured')

  const headers = { 'Authorization': `Token ${MAKE_API_KEY}`, 'Content-Type': 'application/json' }

  try {
    // 1. Organisation ID
    const orgsRes = await fetch(`${BASE}/organizations?pg[limit]=5`, { headers })
    if (!orgsRes.ok) {
      const t = await orgsRes.text()
      console.error('[make] /organizations error:', orgsRes.status, t)
      return err(`Make API error ${orgsRes.status}`)
    }
    const orgsData = await orgsRes.json()
    const org = orgsData?.organizations?.[0]
    const organizationId = org?.id
    if (!organizationId) return err('Aucune organisation Make trouvée')

    // 2. Team ID
    const teamsRes = await fetch(`${BASE}/teams?organizationId=${organizationId}&pg[limit]=10`, { headers })
    const teamsData = await teamsRes.json()
    const teamId = teamsData?.teams?.[0]?.id
    if (!teamId) return err('Aucune team Make trouvée')

    // 3. Scénarios
    const scenRes = await fetch(`${BASE}/scenarios?teamId=${teamId}&pg[limit]=100`, { headers })
    const scenData = await scenRes.json()
    const scenarios = scenData?.scenarios || []

    const actifs   = scenarios.filter(s => s.isActive && !s.isPaused).length
    const erreur   = scenarios.filter(s => s.isPaused).length
    const inactifs = scenarios.length - actifs - erreur

    return ok({
      scenarios: { total: scenarios.length, actifs, inactifs, erreur },
      organisation: { nom: org?.name || 'AkilAI', plan: org?.plan || 'Core' },
    })
  } catch (e) {
    console.error('[make] exception:', e.message)
    return err(e.message)
  }
}
