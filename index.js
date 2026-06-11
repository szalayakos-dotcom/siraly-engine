require('dotenv').config()
const PocketBase = require('pocketbase/cjs')

const PB_URL = process.env.PB_URL || 'http://127.0.0.1:8090'
const PB_ADMIN_EMAIL = process.env.PB_ADMIN_EMAIL
const PB_ADMIN_PASSWORD = process.env.PB_ADMIN_PASSWORD
const TICK_INTERVAL = parseInt(process.env.TICK_INTERVAL || '10000')
const TICK_SECS = TICK_INTERVAL / 1000

const pb = new PocketBase(PB_URL)

const CLASS_MAP = {
  '9g4us1y1ye7afym': 'ys1',
  '40t0bopld7pwwo4': 'ys2',
  'lgtakoks0p1jnvd': 'ys3',
}

const YS1_POLAR = [
  { twa:0,speeds:[0,0,0,0,0] },{ twa:45,speeds:[2.8,3.5,4.2,4.8,5.2] },
  { twa:60,speeds:[3.2,4.0,4.8,5.4,5.8] },{ twa:75,speeds:[3.5,4.3,5.1,5.7,6.1] },
  { twa:90,speeds:[3.6,4.5,5.3,5.9,6.3] },{ twa:110,speeds:[3.4,4.3,5.1,5.7,6.1] },
  { twa:130,speeds:[3.0,3.8,4.6,5.2,5.6] },{ twa:150,speeds:[2.6,3.3,4.0,4.6,5.0] },
  { twa:180,speeds:[2.2,2.8,3.4,3.9,4.3] },
]
const YS2_POLAR = [
  { twa:0,speeds:[0,0,0,0,0] },{ twa:45,speeds:[3.2,4.0,4.8,5.5,6.0] },
  { twa:60,speeds:[3.7,4.6,5.5,6.2,6.7] },{ twa:75,speeds:[4.0,5.0,5.9,6.6,7.1] },
  { twa:90,speeds:[4.1,5.1,6.1,6.8,7.3] },{ twa:110,speeds:[3.9,4.9,5.8,6.5,7.0] },
  { twa:130,speeds:[3.5,4.4,5.2,5.9,6.4] },{ twa:150,speeds:[3.0,3.8,4.6,5.2,5.7] },
  { twa:180,speeds:[2.5,3.2,3.9,4.4,4.9] },
]
const YS3_POLAR = [
  { twa:0,speeds:[0,0,0,0,0] },{ twa:45,speeds:[3.8,4.7,5.6,6.4,7.0] },
  { twa:60,speeds:[4.3,5.3,6.3,7.2,7.8] },{ twa:75,speeds:[4.6,5.7,6.8,7.7,8.3] },
  { twa:90,speeds:[4.7,5.9,7.0,7.9,8.5] },{ twa:110,speeds:[4.5,5.6,6.7,7.5,8.1] },
  { twa:130,speeds:[4.0,5.0,6.0,6.8,7.4] },{ twa:150,speeds:[3.5,4.4,5.2,5.9,6.5] },
  { twa:180,speeds:[2.9,3.7,4.4,5.0,5.6] },
]
const TWS_STEPS = [4,8,12,16,20]

function interpolatePolar(polar, twa, tws) {
  const absTwa = Math.abs(twa)
  let lo = polar[0], hi = polar[polar.length-1]
  for (let i=0; i<polar.length-1; i++) {
    if (polar[i].twa<=absTwa && polar[i+1].twa>=absTwa) { lo=polar[i]; hi=polar[i+1]; break }
  }
  const twaFrac = lo.twa===hi.twa ? 0 : (absTwa-lo.twa)/(hi.twa-lo.twa)
  const twsIdx = TWS_STEPS.findIndex(s=>s>=tws)
  const twsI = twsIdx<=0 ? 0 : twsIdx-1
  const twsJ = Math.min(twsI+1, TWS_STEPS.length-1)
  const twsFrac = TWS_STEPS[twsJ]===TWS_STEPS[twsI] ? 0 : (tws-TWS_STEPS[twsI])/(TWS_STEPS[twsJ]-TWS_STEPS[twsI])
  const speedLo = lo.speeds[twsI]+(lo.speeds[twsJ]-lo.speeds[twsI])*twsFrac
  const speedHi = hi.speeds[twsI]+(hi.speeds[twsJ]-hi.speeds[twsI])*twsFrac
  return speedLo+(speedHi-speedLo)*twaFrac
}

function calcPhysics(boatClass, sails, trim, hdg, windDir, windSpeedKn) {
  if (!Object.values(sails).some(Boolean)) return { boatSpeed:0, driftAngle:0 }
  const rawTwa = windDir-hdg
  const twa = ((rawTwa+180)%360)-180
  const absTwa = Math.abs(twa)
  const polar = boatClass==='ys3' ? YS3_POLAR : boatClass==='ys2' ? YS2_POLAR : YS1_POLAR
  const idealSpeed = interpolatePolar(polar, absTwa, windSpeedKn)
  const trimEff = calcTrimEfficiency(trim, twa, windSpeedKn, sails)
  const trimMult = 0.6+(trimEff/100)*0.4
  const fSide = windSpeedKn*Math.sin((absTwa*Math.PI)/180)
  const trimPenalty = 1-trimEff/100
  const heel = Math.min(40, fSide*0.65*(1+trimPenalty*2.5))
  const driftAngle = heel>5 ? Math.max(0, 0.3*fSide*Math.tan((Math.min(heel,35)*Math.PI)/180)) : 0
  const driftMult = Math.cos((driftAngle*Math.PI)/180)
  const boatSpeed = Math.max(0, idealSpeed*trimMult*driftMult)
  return { boatSpeed: Math.round(boatSpeed*100)/100, driftAngle: Math.round(driftAngle*10)/10 }
}

// Optimális trim értékek szélirány alapján (ugyanaz mint a frontenden)
function calcOptimalTrim(twa, tws) {
  const abs = Math.abs(twa)
  if (abs < 70)  return { mainsheet: 85, jibtrim: 80, boomvang: 60, backstay: 75, cunningham: 50, spinnshot: 0,  genakkershot: 0  }
  if (abs < 110) return { mainsheet: 65, jibtrim: 55, boomvang: 45, backstay: 50, cunningham: 30, spinnshot: 0,  genakkershot: 0  }
  if (abs < 150) return { mainsheet: 45, jibtrim: 35, boomvang: 70, backstay: 30, cunningham: 15, spinnshot: 50, genakkershot: 50 }
  return           { mainsheet: 30, jibtrim: 20, boomvang: 85, backstay: 20, cunningham: 10, spinnshot: 30, genakkershot: 0  }
}

// Trim hatékonyság: az optimumtól való átlagos eltérés alapján
function calcTrimEfficiency(trim, twa, tws, sails) {
  const optimal = calcOptimalTrim(twa, tws)
  const keys = ['mainsheet', 'boomvang', 'backstay', 'cunningham']
  if (sails.fock || sails.genua) keys.push('jibtrim')
  if (sails.spinn) keys.push('spinnshot')
  if (sails.genakker) keys.push('genakkershot')
  const diffs = keys.map(k => Math.abs((trim[k] ?? 50) - (optimal[k] ?? 50)))
  const avgDiff = diffs.reduce((a, b) => a + b, 0) / diffs.length
  return Math.max(20, Math.round((1 - avgDiff / 100) * 100))
}
function distanceKm(lat1, lng1, lat2, lng2) {
  const R = 6371
  const dLat = (lat2-lat1)*Math.PI/180
  const dLng = (lng2-lng1)*Math.PI/180
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2
  return R*2*Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
}

// Irány két pont között (fok)
function bearing(lat1, lng1, lat2, lng2) {
  const dLng = (lng2-lng1)*Math.PI/180
  const y = Math.sin(dLng)*Math.cos(lat2*Math.PI/180)
  const x = Math.cos(lat1*Math.PI/180)*Math.sin(lat2*Math.PI/180)-Math.sin(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.cos(dLng)
  return (Math.atan2(y,x)*180/Math.PI+360)%360
}

// Új pozíció kiszámítása (sebesség km/h, idő sec)
function movePosition(lat, lng, hdg, speedKmh, secs) {
  const distKm = (speedKmh*secs)/3600
  const R = 6371
  const lat1 = lat*Math.PI/180
  const lng1 = lng*Math.PI/180
  const hdgRad = hdg*Math.PI/180
  const lat2 = Math.asin(Math.sin(lat1)*Math.cos(distKm/R)+Math.cos(lat1)*Math.sin(distKm/R)*Math.cos(hdgRad))
  const lng2 = lng1+Math.atan2(Math.sin(hdgRad)*Math.sin(distKm/R)*Math.cos(lat1), Math.cos(distKm/R)-Math.sin(lat1)*Math.sin(lat2))
  return { lat: lat2*180/Math.PI, lng: lng2*180/Math.PI }
}

// Pálya cache
const courseCache = {}

async function getCoursePoints(race) {
  if (courseCache[race.id]) return courseCache[race.id]
  try {
    // course_id-ból töltjük a pályát
    const courseId = race.course_id
    if (!courseId) return null
    const course = await pb.collection('courses').getOne(courseId)
    const points = typeof course.points === 'string' ? JSON.parse(course.points || '[]') : (course.points || [])
    // Csak start/checkpoint/finish típusú pontok, order szerint rendezve
    const mainPts = points
      .filter(p => p.type === 'start' || p.type === 'checkpoint' || p.type === 'finish')
      .sort((a, b) => a.order - b.order)
    courseCache[race.id] = mainPts
    return mainPts
  } catch (e) {
    console.error('Pálya betöltési hiba:', e.message)
    return null
  }
}

async function engineTick() {
  try {
    // Auto-aktiválás: published verseny aminek lejárt a scheduled_start
    try {
      const now = new Date().toISOString()
      const publishedRaces = await pb.collection('races').getFullList({
        filter: `status='published' && scheduled_start != "" && scheduled_start <= "${now}"`
      })
      for (const race of publishedRaces) {
        await pb.collection('races').update(race.id, { status: 'active' })
        console.log(`[AUTO-AKTÍV] ${race.name} → active`)
      }
    } catch {}

    const races = await pb.collection('races').getFullList({ filter:"status='active'" })

    for (const race of races) {
      // Pálya pontok
      const coursePoints = await getCoursePoints(race)

      // Nevezők akik elindultak de még nincs race_positions rekordjuk
      try {
        const startedPrs = await pb.collection('player_races').getFullList({
          filter: `race_id="${race.id}" && started_at != ""`
        })
        for (const pr of startedPrs) {
          const existingPos = await pb.collection('race_positions').getFullList({
            filter: `race_id="${race.id}" && player_id="${pr.player_id}"`
          })
          if (existingPos.length === 0 && coursePoints && coursePoints.length > 0) {
            const boat = await pb.collection('boats').getOne(pr.boat_id).catch(() => null)
            const classId = boat?.class_id || ''
            await pb.collection('race_positions').create({
              race_id: race.id,
              player_id: pr.player_id,
              lat: coursePoints[0].lat,
              lng: coursePoints[0].lng,
              cp_index: 0,
              speed_kmh: 0,
              heading_deg: 270,
              drift_angle: 0,
              status: 'racing',
              boat_class: classId,
              sail_gross: true,
              sail_fock: true,
              sail_genua: false,
              sail_spinn_bool: false,
              sail_genakker: false,
              trim_mainsheet: 78,
              trim_jibtrim: 64,
              trim_boomvang: 52,
              trim_backstay: 71,
              trim_cunningham: 40,
              trim_spinnshot: 50,
              trim_genakkershot: 50,
            })
            console.log(`[POS LÉTREHOZVA] ${pr.player_id} verseny: ${race.name}`)
          }
        }
      } catch (e) {
        console.error('Pozíció létrehozási hiba:', e?.message)
      }
      // Időjárás — az aktuális CP szegmens alapján
      // Alapértelmezett
      let windDir=225, windSpeedKn=10
      try {
        const segs = await pb.collection('weather_segments').getFullList({
          filter:`race_id="${race.id}"`, sort:'from_cp_index',
        })
        if (segs.length) {
          // Minden pozícióhoz majd egyénileg töltjük, itt csak alapértelmezett
          windDir = segs[0].wind_dir
          windSpeedKn = segs[0].wind_speed * 0.539957
        }
      } catch {}

      // Pozíciók
      const positions = await pb.collection('race_positions').getFullList({
        filter:`race_id="${race.id}"`,
      })

      for (const pos of positions) {
        const sailGross = pos.sail_gross ?? false
        const sailFock = pos.sail_fock ?? false
        const anySail = sailGross || sailFock || pos.sail_genua || pos.sail_spinn_bool || pos.sail_genakker
        const sails = {
          gross:    anySail ? (sailGross ?? false) : true,
          fock:     anySail ? (sailFock ?? false) : true,
          genua:    pos.sail_genua    ?? false,
          spinn:    pos.sail_spinn_bool ?? false,
          genakker: pos.sail_genakker ?? false,
        }
        const trim = {
          mainsheet:    pos.trim_mainsheet    ?? 78,
          jibtrim:      pos.trim_jibtrim      ?? 64,
          boomvang:     pos.trim_boomvang     ?? 52,
          backstay:     pos.trim_backstay     ?? 71,
          cunningham:   pos.trim_cunningham   ?? 40,
          spinnshot:    pos.trim_spinnshot    ?? 50,
          genakkershot: pos.trim_genakkershot ?? 50,
        }
        // Hajóosztály: player_races → boat → class_id
        let boatClass = CLASS_MAP[pos.boat_class] || null
        if (!boatClass) {
          try {
            const pr = await pb.collection('player_races').getFirstListItem(
              `race_id="${race.id}" && player_id="${pos.player_id}"`
            )
            const boat = await pb.collection('boats').getOne(pr.boat_id)
            const classId = boat.class_id || ''
            boatClass = CLASS_MAP[classId] || 'ys1'
            await pb.collection('race_positions').update(pos.id, { boat_class: classId })
          } catch (e) { 
            boatClass = 'ys1' 
          }
        }

        // Jelenlegi pozíció és CP index
        let cpIndex = pos.cp_index ?? 0
        let lat = pos.lat
        let lng = pos.lng

        // Ha nincs még pozíció (0,0) és van pálya → rajtra tesszük
        if ((!lat || !lng || (lat===0&&lng===0)) && coursePoints && coursePoints.length > 0) {
          lat = coursePoints[0].lat
          lng = coursePoints[0].lng
          cpIndex = 0
        }

        // Verseny vége ellenőrzés
        const isFinished = pos.status === 'finished'
        if (isFinished) continue

        // started_at ellenőrzés — csak akkor mozog ha a játékos elindult
        try {
          const pr = await pb.collection('player_races').getFirstListItem(
            `race_id="${race.id}" && player_id="${pos.player_id}"`
          )
          if (!pr.started_at) continue  // Még nem nyomta meg a START gombot
        } catch { continue }

        const isLastCp = coursePoints && cpIndex >= coursePoints.length - 1

        // Következő checkpoint iránya
        let hdg = pos.heading_deg ?? 270
        if (coursePoints && coursePoints.length > cpIndex+1) {
          const nextCp = coursePoints[cpIndex+1]
          hdg = Math.round(bearing(lat, lng, nextCp.lat, nextCp.lng))

          // CP elérés ellenőrzése (200m-en belül)
          const dist = distanceKm(lat, lng, nextCp.lat, nextCp.lng)
          if (dist < 0.05) {
            cpIndex = Math.min(cpIndex+1, coursePoints.length-1)
            console.log(`[CP] ${pos.player_id} elérte CP ${cpIndex}-t`)

            // CP kredit jóváírás (minden bojánál 10 kr)
            try {
              const profile = await pb.collection('player_profiles').getFirstListItem(`user_id="${pos.player_id}"`)
              await pb.collection('player_profiles').update(profile.id, {
                credits: (profile.credits || 0) + 10
              })
              console.log(`[KREDIT] ${pos.player_id} +10 kr (CP ${cpIndex})`)
            } catch {}

            // Cél elérés — verseny vége
            if (cpIndex >= coursePoints.length - 1) {
              console.log(`[FINISH] ${pos.player_id} célba ért!`)

              // Helyezés meghatározása
              const finishedSoFar = await pb.collection('race_positions').getFullList({
                filter: `race_id="${race.id}" && status="finished"`,
                sort: 'finished_at',
              })
              const placement = finishedSoFar.length + 1

              // Top 3 extra nyeremény
              let bonusCredits = 0, bonusXp = 0
              try {
                const raceData = await pb.collection('races').getOne(race.id)
                if (placement === 1) { bonusCredits = raceData.prize_1st || 500; bonusXp = raceData.prize_xp_1st || 1000 }
                else if (placement === 2) { bonusCredits = raceData.prize_2nd || 300; bonusXp = raceData.prize_xp_2nd || 600 }
                else if (placement === 3) { bonusCredits = raceData.prize_3rd || 150; bonusXp = raceData.prize_xp_3rd || 300 }
              } catch {}

              // Kredit + XP jóváírás
              if (bonusCredits > 0 || bonusXp > 0) {
                try {
                  const profile = await pb.collection('player_profiles').getFirstListItem(`user_id="${pos.player_id}"`)
                  await pb.collection('player_profiles').update(profile.id, {
                    credits: (profile.credits || 0) + bonusCredits,
                    xp: (profile.xp || 0) + bonusXp,
                  })
                  console.log(`[FINISH] ${pos.player_id} ${placement}. hely +${bonusCredits}kr +${bonusXp}xp`)
                } catch {}
              }

              // player_races frissítése
              try {
                const pr = await pb.collection('player_races').getFirstListItem(
                  `race_id="${race.id}" && player_id="${pos.player_id}"`
                )
                await pb.collection('player_races').update(pr.id, {
                  placement,
                  finished_at: new Date().toISOString(),
                })
              } catch {}

              await pb.collection('race_positions').update(pos.id, {
                cp_index: cpIndex,
                speed_kmh: 0,
                status: 'finished',
                finished_at: new Date().toISOString(),
              })
              continue
            }
          }
        }

        // Ha utolsó CP-n áll → áll a hajó
        if (isLastCp) {
          await pb.collection('race_positions').update(pos.id, {
            speed_kmh: 0,
            status: 'finished',
            finished_at: new Date().toISOString(),
          })
          continue
        }

        // Fizika számítás — időjárás a CP index alapján
        let posWindDir = windDir, posWindSpeedKn = windSpeedKn
        try {
          const segs = await pb.collection('weather_segments').getFullList({
            filter:`race_id="${race.id}"`, sort:'from_cp_index',
          })
          if (segs.length) {
            // Az aktuális CP-hez tartozó szegmens: from_cp_index <= cpIndex
            const seg = [...segs].reverse().find(s => s.from_cp_index <= cpIndex) || segs[0]
            posWindDir = seg.wind_dir
            posWindSpeedKn = seg.wind_speed * 0.539957
          }
        } catch {}
        const physics = calcPhysics(boatClass, sails, trim, hdg, posWindDir, posWindSpeedKn)
        const speedKmh = physics.boatSpeed * 1.852

        // Pozíció frissítése
        const newPos = movePosition(lat, lng, hdg, speedKmh, TICK_SECS)

        await pb.collection('race_positions').update(pos.id, {
          lat:         newPos.lat,
          lng:         newPos.lng,
          speed_kmh:   speedKmh,
          heading_deg: hdg,
          cp_index:    cpIndex,
          drift_angle: physics.driftAngle,
        })
      }

      console.log(`[${new Date().toISOString()}] Tick — verseny: ${race.name}, versenyzők: ${positions.length}`)
    }
  } catch (e) {
    console.error('Tick hiba:', e?.message || e, e?.data ? JSON.stringify(e.data) : '')
  }
}

async function main() {
  console.log('Sirály Engine indul...')
  console.log('PocketBase:', PB_URL)
  try {
    await pb.collection('_superusers').authWithPassword(PB_ADMIN_EMAIL, PB_ADMIN_PASSWORD)
    console.log('✓ Admin bejelentkezve')
  } catch (e) {
    console.error('Admin auth hiba:', e?.message)
    process.exit(1)
  }
  await engineTick()
  setInterval(engineTick, TICK_INTERVAL)
  console.log(`✓ Engine fut — tick: ${TICK_INTERVAL/1000}mp`)
}

main()
