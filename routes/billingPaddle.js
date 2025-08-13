const express = require('express')
const bodyParser = require('body-parser')
const config = require('../config')
const { getDb } = require('../db/mongo')
const { requireBearer } = require('../middleware/auth')

const router = express.Router()

function plansFromConfig() {
  return [
    { id: 'hobby', label: 'Hobby', amount: config.paddle.amounts.hobby, link: config.paddle.links.hobby, features: ['50k data req/mo','200 mini AI/mo'] },
    { id: 'pro', label: 'Pro', amount: config.paddle.amounts.pro, link: config.paddle.links.pro, features: ['250k data req/mo','1000 mini AI/mo','200 GPT-4.1/mo'] },
    { id: 'business', label: 'Business', amount: config.paddle.amounts.business, link: config.paddle.links.business, features: ['2M data req/mo','10k mini AI/mo','2k GPT-4.1/mo'] }
  ]
}

router.get('/prices', (req, res) => {
  const items = plansFromConfig().map(p => ({ id: p.id, label: p.label, amount: p.amount, paddleLink: p.link, features: p.features }))
  res.json({ items })
})

router.post('/checkout', express.json(), requireBearer, async (req, res) => {
  const { plan } = req.body || {}
  const planId = String(plan || '').toLowerCase().trim()
  if (!planId || !['hobby','pro','business'].includes(planId)) {
    return res.status(400).json({ error: 'invalid plan' })
  }
  const items = plansFromConfig()
  const chosen = items.find(x => x.id === planId)
  if (!chosen || !chosen.link) {
    return res.status(400).json({ error: 'plan not configured', message: 'Set PADDLE_LINK_* envs with your Paddle checkout links.' })
  }
  const passthrough = encodeURIComponent(JSON.stringify({ userId: req.user.sub }))
  const url = chosen.link.includes('?') ? `${chosen.link}&passthrough=${passthrough}` : `${chosen.link}?passthrough=${passthrough}`
  return res.json({ url })
})

router.post('/webhook', bodyParser.text({ type: '*/*' }), async (req, res) => {
  try {
    const raw = req.body || ''
    let event
    try { event = JSON.parse(raw) } catch { event = {} }

    const alertName = event.alert_name || event.event_type || ''

    if (alertName === 'checkout.completed' || alertName === 'payment_succeeded') {
      const passthrough = event.passthrough || event.custom_data || '{}'
      let userId
      try { userId = JSON.parse(passthrough).userId } catch {}
      let newPlan = null
      const title = (event?.subscription_plan_name || event?.product_name || '').toLowerCase()
      if (title.includes('hobby')) newPlan = 'hobby'
      if (title.includes('pro')) newPlan = 'pro'
      if (title.includes('business')) newPlan = 'business'
      if (userId && newPlan) {
        const db = await getDb()
        await db.collection('users').updateOne({ _id: userId }, { $set: { plan: newPlan, updatedAt: new Date() } })
      }
    }

    if (alertName === 'subscription.canceled' || alertName === 'subscription_payment_failed') {
      const passthrough = event.passthrough || event.custom_data || '{}'
      let userId
      try { userId = JSON.parse(passthrough).userId } catch {}
      if (userId) {
        const db = await getDb()
        await db.collection('users').updateOne({ _id: userId }, { $set: { plan: 'free', updatedAt: new Date() } })
      }
    }

    return res.json({ received: true })
  } catch (e) {
    return res.status(500).end()
  }
})

router.get('/success', (req, res) => {
  const base = (require('../config').webBase || 'http://localhost:3001')
  res.redirect(302, base + '/billing/success')
})
router.get('/cancel', (req, res) => {
  const base = (require('../config').webBase || 'http://localhost:3001')
  res.redirect(302, base + '/billing/cancel')
})

module.exports = router
