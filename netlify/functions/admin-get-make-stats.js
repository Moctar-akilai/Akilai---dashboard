const { ok, err, preflight } = require('./config')
const { verifyAdminToken, unauthorized } = require('./admin-utils')

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return preflight()
  if (!verifyAdminToken(event)) return unauthorized()

  const MAKE_API_KEY = process.env.MAKE_API_KEY
  if (!MAKE_API_KEY) return err('MAKE_API_KEY not configured')

  const BASE = 'https://eu1.make.com/api/v2'
  const headers = { 'Authorization': `Token ${MAKE_API_KEY}`, 'Content-Type': 'application/json' }

  try {
    // 1. /users/me → récupérer organizationId
    const meRes = await fetch(`${BASE}/users/me`, { headers })
    const meData = await meRes.json()
    console.log('[make] authUser:', JSON.stringify(meData?.authUser))

    const user = meData?.authUser
    const organizationId = user?.organizationId
                        || user?.defaultOrganizationId
                        || user?.organizations?.[0]?.id
    console.log('[make] organizationId:', organizationId)
    if (!organizationId) return err('organizationId introuvable dans authUser')

    // 2. Teams avec organizationId obligatoire
    const teamsRes = await fetch(`${BASE}/teams?organizationId=${organizationId}&pg[limit]=10`, { headers })
    const teamsData = await teamsRes.json()
    console.log('[make] teams:', JSON.stringify(teamsData).substring(0, 500))
    const teams = teamsData?.teams || []
    const teamId = teams[0]?.id
    if (!teamId) return err('Aucune team trouvée')

    // 3. Scénarios
    const scenRes = await fetch(`${BASE}/scenarios?teamId=${teamId}&pg[limit]=100`, { headers })
    const scenData = await scenRes.json()
    console.log('[make] scenarios count:', scenData?.scenarios?.length)
    const scenarios = scenData?.scenarios || []

    const actifs   = scenarios.filter(s => s.isActive && !s.isPaused).length
    const erreur   = scenarios.filter(s => s.isPaused).length
    const inactifs = scenarios.length - actifs - erreur

    // 4. Infos organisation
    const orgRes = await fetch(`${BASE}/organizations/${organizationId}`, { headers })
    const orgData = orgRes.ok ? await orgRes.json() : {}
    console.log('[make] org:', JSON.stringify(orgData).substring(0, 300))
    const orgNom  = orgData?.organization?.name  || teams[0]?.name || 'AkilAI'
    const orgPlan = orgData?.organization?.license?.apps || orgData?.organization?.plan || 'Core'

    return ok({
      scenarios: { total: scenarios.length, actifs, inactifs, erreur },
      organisation: { nom: orgNom, plan: orgPlan },
    })
  } catch (e) {
    console.error('[make] erreur:', e.message)
    return err(e.message)
  }
}
