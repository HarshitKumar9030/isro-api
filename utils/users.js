const crypto = require('crypto')
const { getDb } = require('../db/mongo')

function hash(s) { return crypto.createHash('sha256').update(s).digest('hex') }
async function ensureIndexes(col) {
  await col.createIndex({ email: 1 }, { unique: true })
  await col.createIndex({ apiKeyHash: 1 }, { unique: true })
}

async function findByEmail(email) {
  const db = await getDb()
  const col = db.collection('users')
  await ensureIndexes(col)
  return await col.findOne({ email: String(email).toLowerCase() })
}

async function createUser(email, name) {
  const db = await getDb()
  const col = db.collection('users')
  await ensureIndexes(col)
  const existing = await col.findOne({ email: String(email).toLowerCase() })
  if (existing) return null
  const id = crypto.randomUUID()
  const apiKey = crypto.randomBytes(24).toString('hex')
  const doc = {
    _id: id,
    email: String(email).toLowerCase(),
    name,
    apiKeyHash: hash(apiKey),
    plan: 'free', // default plan
    createdAt: new Date()
  }
  await col.insertOne(doc)
  return { user: { id, email: doc.email, name: doc.name }, apiKey }
}
async function findByApiKey(key) {
  const db = await getDb()
  const col = db.collection('users')
  await ensureIndexes(col)
  const h = hash(String(key || ''))
  return await col.findOne({ apiKeyHash: h })
}

async function findById(id) {
  const db = await getDb()
  const col = db.collection('users')
  await ensureIndexes(col)
  return await col.findOne({ _id: id })
}

module.exports = { findByEmail, findByApiKey, createUser, findById, hash }
