// Small helper to estimate Azure OpenAI cost
// Price is for 1M tokens, same like Azure pricing table
// Source: https://azure.microsoft.com/en-us/pricing/details/cognitive-services/openai-service/ (checked today)

const config = require('../config')

// You can change price using env vars, e.g.
// AICOST_GPT41_IN=2.00 AICOST_GPT41_OUT=8.00 (USD per 1M tokens)
function envNum(key, def) {
  const v = process.env[key]
  if (!v) return def
  const n = Number(v)
  return Number.isFinite(n) ? n : def
}

// Default price (USD per 1M tokens). Your region maybe different.
// - GPT-4.1: input $2 per 1M, output $8 per 1M
// - GPT-4.1-mini: input $0.40 per 1M, output $1.60 per 1M
const DEFAULT_PRICING = {
  'gpt-4.1': { in: envNum('AICOST_GPT41_IN', 2.00), out: envNum('AICOST_GPT41_OUT', 8.00) },
  'gpt-5-mini': { in: envNum('AICOST_GPT5MINI_IN', 0.40), out: envNum('AICOST_GPT5MINI_OUT', 1.60) },
}

function normalizeModel(model) {
  const m = String(model || '').toLowerCase()
  if (m.includes('gpt-4.1')) return 'gpt-4.1'
  if (m.includes('gpt-5-mini')) return 'gpt-5-mini'
  return model
}

function estimateCost({ model, inputTokens = 0, outputTokens = 0 }) {
  const key = normalizeModel(model)
  const p = DEFAULT_PRICING[key]
  if (!p) return 0
  // Turn tokens to millions to match per-1M price
  const cost = (inputTokens / 1_000_000) * p.in + (outputTokens / 1_000_000) * p.out
  return Number(cost.toFixed(6))
}

module.exports = { estimateCost, normalizeModel, DEFAULT_PRICING }
