const { getDb } = require('../db/mongo')
const { getPlan, userPlanName, monthKey, dayKey, aiKindsForPath } = require('../utils/plans')
const { normalizeModel } = require('../utils/aiCost')
const { findById } = require('../utils/users')

async function getUser(req) {
  const sub = req?.user?.sub
  if (!sub) return null
  try { return await findById(sub) } catch { return null }
}

function periodForData(planName) {
  return planName === 'free' ? 'day' : 'month'
}

async function planDataLimiter(req, res, next) {
  try {
    const user = await getUser(req)
    if (!user) return res.status(401).json({ error: 'auth required' })
    const planName = userPlanName(user)
    const plan = getPlan(user)
    if (plan.dataMonthly == null && plan.dataDaily == null) return next()

    const pr = periodForData(planName)
    const key = pr === 'day' ? dayKey() : monthKey()
    const limit = pr === 'day' ? (plan.dataDaily || 0) : (plan.dataMonthly || 0)
    const db = await getDb()
    const col = db.collection('api_usage')
    const docKey = { userId: user._id || user.id || req.user.sub, period: pr, key }
    const doc = await col.findOne(docKey)
    const used = doc?.count || 0
    const remaining = Math.max(0, limit - used)
    res.set('X-Plan', plan.name)
    res.set('X-Plan-Period', pr)
    res.set('X-Plan-Data-Limit', String(limit))
    res.set('X-Plan-Data-Remaining', String(remaining))
    if (used >= limit) return res.status(429).json({ error: 'plan data limit exceeded', plan: plan.name, period: pr })
    await col.updateOne(docKey, { $inc: { count: 1 }, $setOnInsert: { createdAt: new Date() } }, { upsert: true })
    return next()
  } catch (e) {
    return next()
  }
}

function monthBounds() {
  const now = new Date()
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
  return { start, end }
}
function dayBounds() {
  const now = new Date()
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000)
  return { start, end }
}

async function countAiCalls(db, userId, kind, period) {
  const { start, end } = period === 'day' ? dayBounds() : monthBounds()
  const col = db.collection('ai_usage')
  const match = { userId, ts: { $gte: start, $lt: end } }
  // kind mapping: 'mini' => model contains 'mini'; 'gpt41' => model starts with 'gpt-4.1'
  if (kind === 'mini') match.model = /mini/i
  if (kind === 'gpt41') match.model = /^gpt-4\.1/i
  const rows = await col.aggregate([
    { $match: match },
    { $group: { _id: null, calls: { $sum: 1 } } }
  ]).toArray()
  return rows[0]?.calls || 0
}

async function planAiLimiter(req, res, next) {
  try {
    const user = await getUser(req)
    if (!user) return res.status(401).json({ error: 'auth required' })
    const planName = userPlanName(user)
    const plan = getPlan(user)
    const kinds = aiKindsForPath(req.path || '')
    if (!kinds.length) return next()

    const unlimited = (plan.aiMiniMonthly == null && plan.ai41Monthly == null && plan.aiMiniDaily == null && plan.ai41Daily == null)
    if (unlimited) return next()

    const db = await getDb()
    const userId = user._id || user.id || req.user.sub
    const results = {}
    for (const k of kinds) {
      const limit = planName === 'free'
        ? (k === 'mini' ? (plan.aiMiniDaily || 0) : (plan.ai41Daily || 0))
        : (k === 'mini' ? (plan.aiMiniMonthly || 0) : (plan.ai41Monthly || 0))
      const period = planName === 'free' ? 'day' : 'month'
      const used = await countAiCalls(db, userId, k, period)
      const remaining = Math.max(0, limit - used)
      results[k] = { limit, used, remaining, period }
      res.set(`X-Plan-AI-${k}-Limit`, String(limit))
      res.set(`X-Plan-AI-${k}-Remaining`, String(remaining))
      res.set(`X-Plan-AI-${k}-Period`, period)
      if (used >= limit) return res.status(429).json({ error: 'ai quota exceeded', plan: plan.name, kind: k, period })
    }
    return next()
  } catch (e) {
    return next()
  }
}

module.exports = { planDataLimiter, planAiLimiter }
