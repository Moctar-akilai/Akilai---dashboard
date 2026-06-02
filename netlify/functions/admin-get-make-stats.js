const { ok, err, preflight, corsHeaders } = require('./config')
const { verifyAdminToken, unauthorized } = require('./admin-utils')

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return preflight()
  if (!verifyAdminToken(event)) return unauthorized()

  const MAKE_API_KEY = process.env.MAKE_API_KEY
  if (!MAKE_API_KEY) {
    console.error('[make] MAKE_API_KEY manquante')
    return err('MAKE_API_KEY not configured')
  }

  const headers = {
    'Authorization': `Token ${MAKE_API_KEY}`,
    'Content-Type': 'application/json',
  }

  // Essayer eu1 puis us1
  for (const BASE of ['https://eu1.make.com/api/v2', 'https://us1.make.com/api/v2']) {
    try {
      // 1. /users/me
      const meRes = await fetch(`${BASE}/users/me`, { headers })
      const meText = await meRes.text()
      console.log(`[make] ${BASE}/users/me → ${meRes.status}: ${meText.substring(0, 400)}`)
      if (!meRes.ok) continue

      const me = JSON.parse(meText)
      const teamId = me?.user?.defaultOrganizationId
                  || me?.user?.organizationId
                  || me?.defaultOrganizationId
                  || me?.organizationId
                  || me?.user?.teams?.[0]?.id
      console.log('[make] teamId:', teamId)

      // 2. Scénarios
      const scenUrl = `${BASE}/scenarios${teamId ? `?organizationId=${teamId}&pg[limit]=100` : '?pg[limit]=100'}`
      const scenRes = await fetch(scenUrl, { headers })
      const scenText = await scenRes.text()
      console.log(`[make] scenarios → ${scenRes.status}: ${scenText.substring(0, 400)}`)
      const scenData = scenRes.ok ? JSON.parse(scenText) : {}
      const scenarios = scenData?.scenarios || []

      const actifs   = scenarios.filter(s => s.isActive && !s.isPaused).length
      const erreur   = scenarios.filter(s => s.isPaused).length
      const inactifs = scenarios.length - actifs - erreur

      // 3. Organisation
      let orgNom = '', orgPlan = ''
      if (teamId) {
        const orgRes = await fetch(`${BASE}/organizations/${teamId}`, { headers })
        if (orgRes.ok) {
          const orgData = await orgRes.json()
          console.log('[make] org:', JSON.stringify(orgData).substring(0, 300))
          orgNom  = orgData?.organization?.name  || ''
          orgPlan = orgData?.organization?.license?.apps || orgData?.organization?.plan || ''
        }
      }

      return ok({
        scenarios: { total: scenarios.length, actifs, inactifs, erreur },
        organisation: { nom: orgNom || 'AkilAI', plan: orgPlan || 'Core' },
        region: BASE.includes('eu1') ? 'EU' : 'US',
      })
    } catch (e) {
      console.error(`[make] erreur ${BASE}:`, e.message)
    }
  }

  return err('Impossible de joindre l\'API Make (eu1 et us1 en échec)')
}
