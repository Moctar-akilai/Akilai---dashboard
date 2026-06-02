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
    // 1. Organisation
    const orgsRes = await fetch(`${BASE}/organizations?pg[limit]=5`, { headers })
    if (!orgsRes.ok) return err(`Make API error ${orgsRes.status}`)
    const orgsData = await orgsRes.json()
    const org = orgsData?.organizations?.[0]
    const organizationId = org?.id
    if (!organizationId) return err('Aucune organisation Make trouvée')

    // 2. Team
    const teamsRes = await fetch(`${BASE}/teams?organizationId=${organizationId}&pg[limit]=10`, { headers })
    const teamsData = await teamsRes.json()
    const teamId = teamsData?.teams?.[0]?.id
    if (!teamId) return err('Aucune team Make trouvée')

    // 3. Scénarios
    const scenRes = await fetch(`${BASE}/scenarios?teamId=${teamId}&pg[limit]=100`, { headers })
    const scenData = await scenRes.json()
    const rawScenarios = scenData?.scenarios || []

    const scenarios = rawScenarios.map(s => ({
      id: s.id,
      name: s.name,
      isActive: s.isActive,
      isPaused: s.isPaused,
      teamId: s.teamId,
      lastEdit: s.updatedAt || null,
      executionsCount: s.executionsCount || 0,
    }))

    const actifs   = scenarios.filter(s => s.isActive && !s.isPaused).length
    const enPause  = scenarios.filter(s => s.isPaused).length
    const inactifs = scenarios.length - actifs - enPause

    return ok({
      stats: { total: scenarios.length, actifs, inactifs, enPause },
      scenarios,
      organisation: { nom: org?.name || 'AkilAI', plan: org?.plan || 'Core' },
    })
  } catch (e) {
    console.error('[make] exception:', e.message)
    return err(e.message)
  }
}
