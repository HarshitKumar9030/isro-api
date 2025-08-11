const fs = require('fs')
const path = require('path')
const { getDb } = require('../db/mongo')

function isHeaderArtifact(val) {
  if (!val) return false
  const s = String(val)
  return s.includes('⇅') || /UpArrowDownArrow/i.test(s)
}

function cleanItem(o) {
  const out = {}
  for (const [k, v] of Object.entries(o || {})) {
  if (isHeaderArtifact(v)) continue
    let nk = k
    if (nk === 'serial') nk = 'sl_no'
    if (nk === 's_no' || nk === 'sl_no_') nk = 'sl_no'
  if (nk === 'date') nk = 'launch_date'
    if (nk === 'name_of_satellite' || nk === 'spacecraft' || nk === 'satellite') nk = 'name'
  nk = nk.replace(/_uparrowdownarrow$/i, '')
    out[nk] = v
  }
  if (out.launch_vehicle_mission && (!out.launch_vehicle || !out.mission)) {
    const lvm = String(out.launch_vehicle_mission)
    if (lvm.includes('/')) {
      const parts = lvm.split('/')
      const lv = parts.shift()
      const ms = parts.join('/')
      out.launch_vehicle = out.launch_vehicle || (lv ? lv.trim() : '')
      out.mission = out.mission || (ms ? ms.trim() : '')
    }
  }
  return out
}

function cleanData(arr) {
  const rows = Array.isArray(arr) ? arr : []
  const cleaned = rows
    .map(cleanItem)
    .filter(r => Object.keys(r).length > 0)
    .filter(r => !Object.values(r).some(isHeaderArtifact))
  return cleaned
}

function readJson(fp) {
  try {
    const p = path.join(process.cwd(), fp)
    const raw = fs.readFileSync(p, 'utf8')
    return JSON.parse(raw)
  } catch (e) {
    return []
  }
}

async function ensureIndexes(col) {
  const idx = await col.indexes()
  for (const i of idx) {
    if (i.name !== '_id_') {
      try { await col.dropIndex(i.name) } catch (e) { /* ignore */ }
    }
  }
  await col.createIndex({ name: 1, launch_date: 1 }, { unique: true })
}

async function upsertMany(col, docs, keyFields) {
  if (!docs || !docs.length) return { upserts: 0 }
  let upserts = 0
  for (const d of docs) {
    const q = {}
    for (const k of keyFields) q[k] = d[k]
    const res = await col.updateOne(q, { $set: d, $setOnInsert: { createdAt: new Date() } }, { upsert: true })
    if (res.upsertedCount || res.matchedCount === 0) upserts += 1
  }
  return { upserts }
}

async function pushLaunchesToMongo({ file = 'data/launch_missions.json' } = {}) {
  const db = await getDb()
  const raw = readJson(file)
  const data = cleanData(raw)
  const col = db.collection('launches')
  await ensureIndexes(col)
  const { upserts } = await upsertMany(col, data, ['name', 'launch_date'])
  const total = await col.countDocuments({})
  return { file, read: Array.isArray(raw) ? raw.length : 0, cleaned: data.length, upserts, total }
}

module.exports = { pushLaunchesToMongo }
