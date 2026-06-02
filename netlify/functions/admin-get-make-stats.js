const { ok, err, preflight } = require('./config')
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

  for (const BASE of ['https://eu1.make.com/api/v2', 'https://us1.make.com/api/v2']) {
    try {
      // 1. /users/me
      const meRes = await fetch(`${BASE}/users/me`, { headers })
      const meText = await meRes.text()
      console.log(`[make] ${BASE}/users/me → ${meRes.status}: ${meText.substring(0, 400)}`)
      if (!meRes.ok) continue

      // 2. Teams
      const teamsRes = await fetch(`${BASE}/teams?pg[limit]=10`, { headers })
      const teamsText = await teamsRes.text()
      console.log('[make] teams response:', teamsText.substring(0, 500))
      if (!teamsRes.ok) continue

      const teamsData = JSON.parse(teamsText)
      const teams = teamsData?.teams || []
      const teamId = teams[0]?.id
      console.log('[make] teamId:', teamId)

      if (!teamId) {
        console.warn('[make] aucune team trouvée, on continue vers la prochaine région')
        continue
      }

      // 3. Scénarios
      const scenRes = await fetch(`${BASE}/scenarios?teamId=${teamId}&pg[limit]=100`, { headers })
      const scenText = await scenRes.text()
      console.log(`[make] scenarios → ${scenRes.status}: ${scenText.substring(0, 400)}`)
      const scenarios = scenRes.ok ? (JSON.parse(scenText)?.scenarios || []) : []

      const actifs   = scenarios.filter(s => s.isActive && !s.isPaused).length
      const erreur   = scenarios.filter(s => s.isPaused).length
      const inactifs = scenarios.length - actifs - erreur

      // 4. Nom organisation
      let orgNom = teams[0]?.name || '', orgPlan = ''
      try {
        const orgRes = await fetch(`${BASE}/teams/${teamId}`, { headers })
        if (orgRes.ok) {
          const orgData = await orgRes.json()
          console.log('[make] team detail:', JSON.stringify(orgData).substring(0, 300))
          orgNom  = orgData?.team?.name  || orgNom
          orgPlan = orgData?.team?.license?.apps || orgData?.team?.plan || ''
        }
      } catch (_) {}

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
