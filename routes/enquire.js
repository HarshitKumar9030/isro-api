const express = require('express')
const fetch = require('node-fetch')
const config = require('../config')
const { getDb } = require('../db/mongo')
const { estimateCost, normalizeModel } = require('../utils/aiCost')

let AzureOpenAI = null
try { AzureOpenAI = require('openai').AzureOpenAI } catch (e) {}

const router = express.Router()

function toJSONSafe(x) {
  try { return JSON.stringify(x) } catch { return '"<unserializable>"' }
}

async function callAzureChat({ messages, deployment, apiVersion }) {
  if (!AzureOpenAI) throw new Error('openai sdk not installed')
  const { apiKey, endpoint } = config.azure
  if (!apiKey || !endpoint) throw new Error('azure openai not configured')
  const client = new AzureOpenAI({ apiKey, endpoint, deployment, apiVersion: apiVersion || config.azure.apiVersion })
  const resp = await client.chat.completions.create({ messages, max_completion_tokens: 1500, model: deployment })
  const content = resp?.choices?.[0]?.message?.content || ''
  const usage = resp?.usage || {}
  return { content, usage }
}

async function planSearch(query) {
  const sys = { role: 'system', content: 'You help map user queries to the correct ISRO API endpoints and parameters. Output compact JSON with fields: endpoint (one of /api/spacecraft, /api/launches, /api/timeline, /api/upcoming, /api/details), params (object with q, sort, page, limit as needed), and rationale (short text). Keep it strictly JSON.' }
  const usr = { role: 'user', content: `Query: ${query}` }
  const text = await callAzureChat({ messages: [sys, usr], deployment: config.azure.deployments.gpt5 })
  let parsed
  try { parsed = JSON.parse(text) } catch {
    const low = String(query).toLowerCase()
    const endpoint = low.includes('launch') ? '/api/launches' : (low.includes('upcoming') ? '/api/upcoming' : (low.includes('timeline') ? '/api/timeline' : (low.includes('detail') ? '/api/details' : '/api/spacecraft')))
    parsed = { endpoint, params: { q: query }, rationale: 'heuristic fallback' }
  }
  if (!parsed.endpoint) parsed.endpoint = '/api/spacecraft'
  if (!parsed.params) parsed.params = { q: query }
  return parsed
}

async function fetchApi({ baseUrl, endpoint, params, authorization }) {
  const url = new URL(endpoint, baseUrl)
  for (const [k, v] of Object.entries(params || {})) if (v != null && v !== '') url.searchParams.set(k, String(v))
  const res = await fetch(url.toString(), { headers: authorization ? { Authorization: authorization } : {} })
  if (!res.ok) throw new Error(`api request failed ${res.status}`)
  return await res.json()
}

router.get('/', async (req, res) => {
  const q = String(req.query.q || '').trim()
  if (!q) return res.status(400).json({ error: 'q required' })
  try {
    const plan = await planSearch(q)

    const baseUrl = `${req.protocol}://${req.get('host')}`
    const authorization = req.headers.authorization || ''
    let apiData = await fetchApi({ baseUrl, endpoint: plan.endpoint, params: plan.params, authorization })

    if ((apiData?.total === 0 || (Array.isArray(apiData?.items) && apiData.items.length === 0)) && plan.endpoint === '/api/launches') {
      try {
        const db = await getDb()
        const s = String(plan.params?.q || q).trim()
        const tokens = s.split(/\s+/).filter(Boolean).map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        const pattern = tokens.join('[\\s\\-_/]*')
        const re = new RegExp(pattern, 'i')
        const col = db.collection('launches')
        let sort = undefined
        if (plan.params?.sort) {
          let sp = String(plan.params.sort)
          if (!sp.includes(':') && /_/.test(sp)) {
            const m = sp.match(/^([a-z_]+)_([ad]sc)$/i)
            if (m) sp = `${m[1]}:${m[2]}`
          }
          let [field, dirRaw] = sp.split(':')
          if (field === 'date') field = 'launch_date'
          sort = { [field]: (dirRaw || 'asc').toLowerCase() === 'desc' ? -1 : 1 }
        }
        const qMongo = { $or: [
          { name: { $regex: re } },
          { payload: { $regex: re } },
          { remarks: { $regex: re } },
          { launcher_type: { $regex: re } },
          { launch_date: { $regex: re } },
          { mission: { $regex: re } },
          { launch_vehicle: { $regex: re } },
          { launch_vehicle_mission: { $regex: re } },
          { orbit: { $regex: re } }
        ] }
        const limit = Math.min(200, Math.max(1, parseInt(plan.params?.limit || '10', 10) || 10))
        const page = Math.max(1, parseInt(plan.params?.page || '1', 10) || 1)
        const skip = (page - 1) * limit
        const total = await col.countDocuments(qMongo)
        const docs = await col.find(qMongo, { sort }).skip(skip).limit(limit).toArray()
        apiData = { items: docs, page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) }
      } catch (_) { /* ignore fallback errors */ }
    }

    const sys = { role: 'system', content: 'You generate a concise, helpful, and accurate response grounded strictly in the provided ISRO API data. If the data does not contain the requested info, say so briefly and suggest the closest available info. Include key fields, short context, and relevant list items where helpful. Answer in plain text.' }
    const usr = { role: 'user', content: `User query: ${q}\n\nSelected endpoint: ${plan.endpoint}\nParams: ${toJSONSafe(plan.params)}\nRationale: ${plan.rationale || ''}\n\nAPI response JSON (truncate long arrays to highlight key items):\n${toJSONSafe(apiData).slice(0, 28000)}` }
    const { content, usage } = await callAzureChat({ messages: [sys, usr], deployment: config.azure.deployments.gpt4 })
    try {
      const db = await getDb()
      await db.collection('ai_usage').insertOne({
        ts: new Date(),
        userId: req.user?.sub || null,
        email: req.user?.email || null,
        route: '/enquire',
        model: normalizeModel(config.azure.deployments.gpt4),
        usage,
        meta: { endpoint: plan.endpoint },
        cost_estimated_usd: estimateCost({ model: config.azure.deployments.gpt4, inputTokens: usage?.prompt_tokens || 0, outputTokens: usage?.completion_tokens || 0 })
      })
    } catch (_) {}

    return res.json({ ok: true, plan, data_summary: { total: apiData?.total, page: apiData?.page, limit: apiData?.limit }, answer: content, usage })
  } catch (e) {
    const msg = (e && e.message) ? e.message : String(e)
    return res.status(500).json({ error: 'failed', message: msg })
  }
})

module.exports = router
