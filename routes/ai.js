const express = require('express')
const fetch = require('node-fetch')
const config = require('../config')
const { getDb } = require('../db/mongo')
const { estimateCost, normalizeModel } = require('../utils/aiCost')

let AzureOpenAI = null
try { AzureOpenAI = require('openai').AzureOpenAI } catch (e) {}

const router = express.Router()

function toJSONSafe(x) { try { return JSON.stringify(x) } catch { return '"<unserializable>"' } }

async function callAzureChat({ messages, deployment, apiVersion, maxTokens = 1200 }) {
  if (!AzureOpenAI) throw new Error('openai sdk not installed')
  const { apiKey, endpoint } = config.azure
  if (!apiKey || !endpoint) throw new Error('azure openai not configured')
  const client = new AzureOpenAI({ apiKey, endpoint, deployment, apiVersion: apiVersion || config.azure.apiVersion })
  const resp = await client.chat.completions.create({ messages, max_completion_tokens: maxTokens, model: deployment })
  const content = resp?.choices?.[0]?.message?.content || ''
  const usage = resp?.usage || {}
  return { content, usage }
}

async function fetchApi({ baseUrl, endpoint, params, authorization }) {
  const url = new URL(endpoint, baseUrl)
  for (const [k, v] of Object.entries(params || {})) if (v != null && v !== '') url.searchParams.set(k, String(v))
  const res = await fetch(url.toString(), { headers: authorization ? { Authorization: authorization } : {} })
  if (!res.ok) throw new Error(`api request failed ${res.status}`)
  return await res.json()
}

async function logAiUsage(req, { route, model, usage, meta }) {
  try {
    const db = await getDb()
    const col = db.collection('ai_usage')
    const user = req.user || {}
    const usageDoc = {
      ts: new Date(),
      userId: user.sub || null,
      email: user.email || null,
      route,
      model: normalizeModel(model),
      usage,
      meta: meta || {},
      cost_estimated_usd: estimateCost({ model, inputTokens: usage?.prompt_tokens || 0, outputTokens: usage?.completion_tokens || 0 })
    }
    await col.insertOne(usageDoc)
    return usageDoc
  } catch (_) {
    return null
  }
}

router.post('/summarize', async (req, res) => {
  try {
    const { text, endpoint, params } = req.body || {}
    let source = String(text || '').trim()
    let meta = {}
    if (!source && endpoint) {
      const baseUrl = `${req.protocol}://${req.get('host')}`
      const authorization = req.headers.authorization || ''
      const data = await fetchApi({ baseUrl, endpoint, params, authorization })
      meta = { total: data?.total, page: data?.page, limit: data?.limit }
      source = toJSONSafe(data).slice(0, 28000)
    }
    if (!source) return res.status(400).json({ error: 'text or endpoint required' })

    const sys = { role: 'system', content: 'Summarize clearly and concisely for a general audience. Keep key facts, dates, and names. Use bullet points when listing items. Avoid speculation.' }
    const usr = { role: 'user', content: source }
  const { content, usage } = await callAzureChat({ messages: [sys, usr], deployment: config.azure.deployments.gpt4, maxTokens: 800 })
  const log = await logAiUsage(req, { route: '/ai/summarize', model: config.azure.deployments.gpt4, usage, meta })
  return res.json({ ok: true, meta, summary: content, usage, cost: log?.cost_estimated_usd })
  } catch (e) {
    const msg = (e && e.message) ? e.message : String(e)
    return res.status(500).json({ error: 'failed', message: msg })
  }
})

router.post('/compare', async (req, res) => {
  try {
    const { type = 'launches', left, right } = req.body || {}
    if (!left || !right) return res.status(400).json({ error: 'left and right required' })
    const baseUrl = `${req.protocol}://${req.get('host')}`
    const authorization = req.headers.authorization || ''
    const endpoint = type === 'spacecraft' ? '/api/spacecraft' : (type === 'details' ? '/api/details' : (type === 'upcoming' ? '/api/upcoming' : '/api/launches'))
    const [a, b] = await Promise.all([
      fetchApi({ baseUrl, endpoint, params: { q: left, limit: 5 }, authorization }).catch(() => ({ items: [] })),
      fetchApi({ baseUrl, endpoint, params: { q: right, limit: 5 }, authorization }).catch(() => ({ items: [] })),
    ])
    const payload = { left: { query: left, sample: a?.items?.[0] || null }, right: { query: right, sample: b?.items?.[0] || null }, type }
    const sys = { role: 'system', content: 'Compare the two given ISRO items side-by-side. Use a compact table-like text: Field | Left | Right. Focus on name, date, vehicle/type, payload/objective, outcome/status. If a field is missing, leave blank. Keep it factual and concise.' }
    const usr = { role: 'user', content: toJSONSafe(payload) }
  const { content, usage } = await callAzureChat({ messages: [sys, usr], deployment: config.azure.deployments.gpt4, maxTokens: 900 })
  const log = await logAiUsage(req, { route: '/ai/compare', model: config.azure.deployments.gpt4, usage, meta: { type } })
  return res.json({ ok: true, comparison: content, context: payload, usage, cost: log?.cost_estimated_usd })
  } catch (e) {
    const msg = (e && e.message) ? e.message : String(e)
    return res.status(500).json({ error: 'failed', message: msg })
  }
})

router.post('/extract', async (req, res) => {
  try {
    const { text, schema, endpoint, params } = req.body || {}
    let src = String(text || '').trim()
    let meta = {}
    if (!src && endpoint) {
      const baseUrl = `${req.protocol}://${req.get('host')}`
      const authorization = req.headers.authorization || ''
      const data = await fetchApi({ baseUrl, endpoint, params, authorization })
      meta = { from: endpoint, total: data?.total, page: data?.page }
      src = toJSONSafe(data).slice(0, 24000)
    }
    if (!src) return res.status(400).json({ error: 'text or endpoint required' })

    const fields = Array.isArray(schema?.fields) && schema.fields.length ? schema.fields : ['mission', 'date', 'vehicle', 'payload', 'orbit', 'result']
    const sys = { role: 'system', content: 'You extract structured info. Output must be valid JSON object ONLY, no extra text. Use exactly the given keys. If not found, set null. For date, if present, use ISO like YYYY-MM-DD or null. No markdown, no explanation.' }
    const usr = { role: 'user', content: `keys=${toJSONSafe(fields)}\n\ntext=${src}` }

    const { content, usage } = await callAzureChat({ messages: [sys, usr], deployment: config.azure.deployments.gpt5, maxTokens: 500 })

    function pickFields(obj, keys) {
      const out = {}
      for (const k of keys) out[k] = obj && Object.prototype.hasOwnProperty.call(obj, k) ? obj[k] : null
      return out
    }
    function tryParseJsonStrict(s) { try { return JSON.parse(s) } catch { return null } }
    function extractFirstJson(s) {
      let start = -1, depth = 0
      for (let i = 0; i < s.length; i++) {
        const ch = s[i]
        if (ch === '{') { if (depth === 0) start = i; depth++ }
        else if (ch === '}') { depth--; if (depth === 0 && start !== -1) { const sub = s.slice(start, i + 1); const parsed = tryParseJsonStrict(sub); if (parsed) return parsed; start = -1 } }
      }
      return null
    }

    let parsed = tryParseJsonStrict(content) || extractFirstJson(content)
    let data
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      data = pickFields(parsed, fields)
    } else {
      data = { raw: content, ...pickFields({}, fields) }
    }

    const log = await logAiUsage(req, { route: '/ai/extract', model: config.azure.deployments.gpt5, usage, meta })
    return res.json({ ok: true, data, usage, cost: log?.cost_estimated_usd })
  } catch (e) {
    const msg = (e && e.message) ? e.message : String(e)
    return res.status(500).json({ error: 'failed', message: msg })
  }
})

router.post('/rewrite', async (req, res) => {
  try {
    const { text, tone = 'neutral', length = 'medium' } = req.body || {}
    const src = String(text || '').trim()
    if (!src) return res.status(400).json({ error: 'text required' })
    const sys = { role: 'system', content: 'Rewrite the user text. Preserve factual content, improve clarity. Obey requested tone and length. Output plain text only.' }
    const usr = { role: 'user', content: `tone=${tone}; length=${length};\n\n${src}` }
    const { content, usage } = await callAzureChat({ messages: [sys, usr], deployment: config.azure.deployments.gpt4, maxTokens: 700 })
    const log = await logAiUsage(req, { route: '/ai/rewrite', model: config.azure.deployments.gpt4, usage, meta: { tone, length } })
    return res.json({ ok: true, text: content, usage, cost: log?.cost_estimated_usd })
  } catch (e) {
    const msg = (e && e.message) ? e.message : String(e)
    return res.status(500).json({ error: 'failed', message: msg })
  }
})

router.post('/classify', async (req, res) => {
  try {
    const { text, labels } = req.body || {}
    const src = String(text || '').trim()
    const labs = Array.isArray(labels) && labels.length ? labels : ['launch', 'spacecraft', 'news', 'timeline', 'other']
    if (!src) return res.status(400).json({ error: 'text required' })
    const sys = { role: 'system', content: 'Classify the text into one of the given labels. Return compact JSON: { label, confidence }.' }
    const usr = { role: 'user', content: `labels=${JSON.stringify(labs)}\n\ntext=${src}` }
    const { content, usage } = await callAzureChat({ messages: [sys, usr], deployment: config.azure.deployments.gpt5, maxTokens: 200 })
    let data
    try { data = JSON.parse(content) } catch { data = { label: 'other', raw: content } }
    const log = await logAiUsage(req, { route: '/ai/classify', model: config.azure.deployments.gpt5, usage, meta: { labels: labs } })
    return res.json({ ok: true, result: data, usage, cost: log?.cost_estimated_usd })
  } catch (e) {
    const msg = (e && e.message) ? e.message : String(e)
    return res.status(500).json({ error: 'failed', message: msg })
  }
})

router.post('/qna', async (req, res) => {
  try {
    const { question, endpoint = '/api/launches', params } = req.body || {}
    const q = String(question || '').trim()
    if (!q) return res.status(400).json({ error: 'question required' })
    const baseUrl = `${req.protocol}://${req.get('host')}`
    const authorization = req.headers.authorization || ''
    const data = await fetchApi({ baseUrl, endpoint, params: params || { q }, authorization })
    const sys = { role: 'system', content: 'Answer the user question strictly using the provided JSON. If unknown, state that briefly. Keep answers concise and factual.' }
    const usr = { role: 'user', content: `Question: ${q}\n\nData: ${toJSONSafe(data).slice(0, 24000)}` }
    const { content, usage } = await callAzureChat({ messages: [sys, usr], deployment: config.azure.deployments.gpt4, maxTokens: 800 })
    const log = await logAiUsage(req, { route: '/ai/qna', model: config.azure.deployments.gpt4, usage, meta: { endpoint } })
    return res.json({ ok: true, answer: content, context: { total: data?.total, page: data?.page }, usage, cost: log?.cost_estimated_usd })
  } catch (e) {
    const msg = (e && e.message) ? e.message : String(e)
    return res.status(500).json({ error: 'failed', message: msg })
  }
})

router.get('/usage/today', async (req, res) => {
  try {
    const db = await getDb()
    const col = db.collection('ai_usage')
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    const rows = await col.aggregate([
      { $match: { ts: { $gte: start } } },
      { $group: { _id: null, calls: { $sum: 1 }, cost: { $sum: '$cost_estimated_usd' }, inTok: { $sum: '$usage.prompt_tokens' }, outTok: { $sum: '$usage.completion_tokens' } } }
    ]).toArray()
    const s = rows[0] || { calls: 0, cost: 0, inTok: 0, outTok: 0 }
    return res.json({ date: start.toISOString().slice(0,10), ...s, _id: undefined })
  } catch (e) {
    return res.status(500).json({ error: 'failed' })
  }
})

router.get('/usage', async (req, res) => {
  try {
    const db = await getDb()
    const col = db.collection('ai_usage')
    const { days = '7' } = req.query
    const d = Math.max(1, Math.min(90, parseInt(days, 10) || 7))
    const since = new Date(Date.now() - d * 24 * 60 * 60 * 1000)
    const rows = await col.aggregate([
      { $match: { ts: { $gte: since } } },
      { $group: { _id: { day: { $dateToString: { date: '$ts', format: '%Y-%m-%d' } }, model: '$model' }, calls: { $sum: 1 }, cost: { $sum: '$cost_estimated_usd' } } },
      { $sort: { '_id.day': 1, '_id.model': 1 } }
    ]).toArray()
    return res.json({ since: since.toISOString(), items: rows })
  } catch (e) { return res.status(500).json({ error: 'failed' }) }
})

module.exports = router
