const DAY_MS = 24 * 60 * 60 * 1000

const PLAN_DEFS = {
  free: {
    name: 'Free',
    dataDaily: 100,
    aiMiniDaily: 5,
    ai41Daily: 0,
  },
  hobby: {
    name: 'Hobby', price: 9,
    dataMonthly: 50_000,
    aiMiniMonthly: 200,
    ai41Monthly: 0,
  },
  pro: {
    name: 'Pro', price: 29,
    dataMonthly: 250_000,
    aiMiniMonthly: 1_000,
    ai41Monthly: 200,
  },
  business: {
    name: 'Business', price: 99,
    dataMonthly: 2_000_000,
    aiMiniMonthly: 10_000,
    ai41Monthly: 2_000,
  },
  enterprise: {
    name: 'Enterprise', price: null,
    dataMonthly: null, // null is unlimited
    aiMiniMonthly: null, 
    ai41Monthly: null, 
  }
}

function userPlanName(user) {
  const p = (user && (user.plan || user.tier)) || 'free'
  return PLAN_DEFS[p] ? p : 'free'
}

function getPlan(user) { return PLAN_DEFS[userPlanName(user)] }

function monthKey(d = new Date()) {
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

function dayKey(d = new Date()) {
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

function aiKindsForPath(pathname) {
  if (!pathname) return []
  if (pathname.startsWith('/ai/extract') || pathname.startsWith('/ai/classify')) return ['mini']
  if (pathname.startsWith('/ai/summarize') || pathname.startsWith('/ai/compare') || pathname.startsWith('/ai/rewrite') || pathname.startsWith('/ai/qna')) return ['gpt41']
  if (pathname.startsWith('/enquire')) return ['mini', 'gpt41']
  return []
}

module.exports = { PLAN_DEFS, getPlan, userPlanName, monthKey, dayKey, aiKindsForPath }
