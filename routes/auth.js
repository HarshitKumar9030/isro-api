const express = require('express')
const jwt = require('jsonwebtoken')
const formData = require('form-data')
const Mailgun = require('mailgun.js')
const { createUser, findByEmail } = require('../utils/users')
const config = require('../config')

const router = express.Router()

router.post('/token', (req, res) => {
  const sub = String(req.body.sub || 'user')
  const name = String(req.body.name || 'user')
  const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 24
  const token = jwt.sign({ sub, name, exp }, config.jwtSecret)
  res.json({ token, token_type: 'Bearer', expires_in: 60 * 60 * 24 })
})

router.post('/exchange', async (req, res) => {
  const email = String(req.body.email || '')
  const apiKey = String(req.body.apiKey || '')
  const user = await findByEmail(email)
  if (!user) return res.status(400).json({ error: 'invalid user' })
  const { hash } = require('../utils/users')
  if (user.apiKeyHash !== hash(apiKey)) return res.status(400).json({ error: 'invalid key' })
  const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 24
  const token = jwt.sign({ sub: user._id, name: user.name, email: user.email, exp }, config.jwtSecret)
  res.json({ token, token_type: 'Bearer', expires_in: 60 * 60 * 24 })
})

router.get('/signup', (req, res) => {
  res.render('signup', {})
})

router.post('/signup', async (req, res) => {
  const email = String(req.body.email || '').trim()
  const name = String(req.body.name || '').trim() || 'user'
  if (!email) return res.status(400).json({ error: 'email required' })
  const existing = await findByEmail(email)
  if (existing) return res.status(400).json({ error: 'already exists' })
  const created = await createUser(email, name)
  if (!created) return res.status(500).json({ error: 'failed' })
  const { user, apiKey } = created
  const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 24
  const token = jwt.sign({ sub: user.id || user._id, name, email, exp }, config.jwtSecret)
  try {
    const mg = new Mailgun(formData).client({ username: 'api', key: config.mailgun.apiKey })
    const domain = config.mailgun.domain
    if (!domain) throw new Error('missing domain')
    await mg.messages.create(domain, {
      from: config.mailgun.from || `ISRO API <noreply@${domain}>`,
      to: [email],
      subject: 'Your ISRO API Access',
      text: `Hi ${name},\n\nWelcome! Here are your credentials:\n\nAPI Key (keep it safe):\n${apiKey}\n\nBearer Token (valid ~24h):\n${token}\n\nUse the token in requests as:\nAuthorization: Bearer ${token}\n\nYou can also exchange your API key later at:\nPOST /auth/exchange { email, apiKey }\n\n— ISRO API`,
    })
  } catch (e) {
    return res.status(500).json({ error: 'email failed' })
  }
  res.json({ ok: true, message: 'Access details sent to your email' })
})

module.exports = router
