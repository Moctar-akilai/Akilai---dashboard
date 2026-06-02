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
    // 1. /users/me — log complet sans troncature
    const meRes = await fetch(`${BASE}/users/me`, { headers })
    const meData = await meRes.json()
    console.log('[make] authUser FULL:', JSON.stringify(meData?.authUser))

    const user = meData?.authUser
    let organizationId = user?.organizationId
                      || user?.defaultOrganizationId
                      || user?.organizations?.[0]?.id
    console.log('[make] organizationId from authUser:', organizationId)

    // 2. Si pas trouvé → essayer GET /organizations
    if (!organizationId) {
      const orgsRes = await fetch(`${BASE}/organizations?pg[limit]=5`, { headers })
      const orgsData = await orgsRes.json()
      console.log('[make] /organizations response:', JSON.stringify(orgsData))
      organizationId = orgsData?.organizations?.[0]?.id
      console.log('[make] organizationId from /organizations:', organizationId)
    }

    if (!organizationId) return err('organizationId introuvable (authUser + /organizations)')

    // 3. Teams
    const teamsRes = await fetch(`${BASE}/teams?organizationId=${organizationId}&pg[limit]=10`, { headers })
    const teamsData = await teamsRes.json()
    console.log('[make] teams:', JSON.stringify(teamsData).substring(0, 500))
    const teams = teamsData?.teams || []
    const teamId = teams[0]?.id
    console.log('[make] teamId:', teamId)
    if (!teamId) return err(`Aucune team pour organizationId=${organizationId}`)

    // 4. Scénarios
    const scenRes = await fetch(`${BASE}/scenarios?teamId=${teamId}&pg[limit]=100`, { headers })
    const scenData = await scenRes.json()
    console.log('[make] scenarios count:', scenData?.scenarios?.length, '| raw:', JSON.stringify(scenData).substring(0, 300))
    const scenarios = scenData?.scenarios || []

    const actifs   = scenarios.filter(s => s.isActive && !s.isPaused).length
    const erreur   = scenarios.filter(s => s.isPaused).length
    const inactifs = scenarios.length - actifs - erreur

    // 5. Infos organisation
    const orgRes = await fetch(`${BASE}/organizations/${organizationId}`, { headers })
    const orgData = orgRes.ok ? await orgRes.json() : {}
    const orgNom  = orgData?.organization?.name  || teams[0]?.name || 'AkilAI'
    const orgPlan = orgData?.organization?.license?.apps || orgData?.organization?.plan || 'Core'

    return ok({
      scenarios: { total: scenarios.length, actifs, inactifs, erreur },
      organisation: { nom: orgNom, plan: orgPlan },
    })
  } catch (e) {
    console.error('[make] exception:', e.message, e.stack)
    return err(e.message)
  }
}
