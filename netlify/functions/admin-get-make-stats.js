const fetch = require('node-fetch')
const { verifyAdminToken } = require('./admin-utils')

exports.handler = async (event) => {
  if (!verifyAdminToken(event)) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) }
  }

  const MAKE_API_KEY = process.env.MAKE_API_KEY
  const headers = {
    'Authorization': `Token ${MAKE_API_KEY}`,
    'Content-Type': 'application/json'
  }

  // Tester eu1 puis us1
  let BASE = 'https://eu1.make.com/api/v2'

  try {
    // 1. Récupérer le teamId
    let res = await fetch(`${BASE}/users/me`, { headers })
    if (!res.ok) {
      BASE = 'https://us1.make.com/api/v2'
      res = await fetch(`${BASE}/users/me`, { headers })
    }
    const me = await res.json()
    console.log('[make] users/me:', JSON.stringify(me).substring(0, 300))

    const teamId = me?.defaultOrganizationId ||
                   me?.organizationId ||
                   me?.teams?.[0]?.id
    console.log('[make] teamId:', teamId)

    // 2. Récupérer les scénarios
    const scenRes = await fetch(
      `${BASE}/scenarios?teamId=${teamId}&pg[limit]=100`,
      { headers }
    )
    const scenData = await scenRes.json()
    console.log('[make] scenarios:', scenData?.scenarios?.length)

    const scenarios = scenData?.scenarios || []
    const actifs = scenarios.filter(s => s.isActive).length
    const erreur = scenarios.filter(s => s.isPaused).length
    const inactifs = scenarios.length - actifs - erreur

    // 3. Infos organisation
    const orgRes = await fetch(
      `${BASE}/organizations/${teamId}`,
      { headers }
    )
    const orgData = await orgRes.json()

    return {
      statusCode: 200,
      body: JSON.stringify({
        scenarios: {
          total: scenarios.length,
          actifs,
          inactifs,
          erreur
        },
        organisation: {
          nom: orgData?.organization?.name || 'AkilAI',
          plan: orgData?.organization?.license?.apps || 'Core'
        },
        region: BASE.includes('eu1') ? 'EU' : 'US'
      })
    }
  } catch (err) {
    console.error('[make] erreur:', err.message)
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    }
  }
}
