const jwt = require('jsonwebtoken')
const config = require('../config')

async function authOptional(req, res, next) {
  try {
    const h = req.headers.authorization || ''
    const token = h.startsWith('Bearer ') ? h.slice(7) : null
    if (token) {
      const decoded = jwt.verify(token, config.jwtSecret)
      req.user = { sub: decoded.sub, name: decoded.name || '', email: decoded.email }
    }
  } catch (e) {}
  next()
}

function requireBearer(req, res, next) {
  try {
    const h = req.headers.authorization || ''
    const token = h.startsWith('Bearer ') ? h.slice(7) : null
    if (!token) return res.status(401).json({ error: 'auth required' })
    const decoded = jwt.verify(token, config.jwtSecret)
    req.user = { sub: decoded.sub, name: decoded.name || '', email: decoded.email }
    return next()
  } catch (e) {
    return res.status(401).json({ error: 'invalid token' })
  }
}

module.exports = { authOptional, requireBearer }
