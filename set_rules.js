require('dotenv').config()

const PB_URL = process.env.PB_URL || 'http://127.0.0.1:8090'
const ADMIN_EMAIL = process.env.PB_ADMIN_EMAIL
const ADMIN_PASSWORD = process.env.PB_ADMIN_PASSWORD

const COLLECTIONS = [
  'races', 'courses', 'checkpoints', 'checkpoint_locations',
  'checkpoint_results', 'weather_segments', 'player_races',
  'player_profiles', 'race_positions', 'boats', 'captains',
  'chat_messages', 'route_options', 'tips', 'credit_transactions',
]

async function main() {
  // Auth
  const authRes = await fetch(`${PB_URL}/api/collections/_superusers/auth-with-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  })
  const auth = await authRes.json()
  if (!auth.token) { console.error('Auth hiba:', auth); process.exit(1) }
  const token = auth.token
  console.log('✓ Admin bejelentkezve')

  for (const name of COLLECTIONS) {
    try {
      // Collection lekérése
      const res = await fetch(`${PB_URL}/api/collections/${name}`, {
        headers: { Authorization: token },
      })
      const col = await res.json()
      if (!col.id) { console.log(`⚠ Nem található: ${name}`); continue }

      // Rules beállítása
      const updateRes = await fetch(`${PB_URL}/api/collections/${col.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: token },
        body: JSON.stringify({
          listRule:   '@request.auth.id != ""',
          viewRule:   '@request.auth.id != ""',
          createRule: '@request.auth.id != ""',
          updateRule: '@request.auth.id != ""',
          deleteRule: '@request.auth.id != ""',
        }),
      })
      const updated = await updateRes.json()
      if (updated.id) {
        console.log(`✓ ${name}`)
      } else {
        console.log(`⚠ ${name} hiba:`, JSON.stringify(updated))
      }
    } catch (e) {
      console.log(`⚠ ${name} exception:`, e.message)
    }
  }
  console.log('\nKész!')
}

main().catch(console.error)
