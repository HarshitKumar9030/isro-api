const jwt = require('jsonwebtoken')
const config = require('../config')

async function authOptional(req, res, next) {
  // try read bearer token, if exist we attach user, else just pass
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
  // this one is strict, must have bearer
  try {
    const h = req.headers.authorization || ''
    const token = h.startsWith('Bearer ') ? h.slice(7) : null
    if (!token) return res.status(401).json({ error: 'auth required' })
    const decoded = jwt.verify(token, config.jwtSecret)
    req.user = { sub: decoded.sub, name: decoded.name || '', email: decoded.email }
    return next()
  } catch (e) {
    // token bad or expired, we say no
    return res.status(401).json({ error: 'invalid token' })
  }
}

module.exports = { authOptional, requireBearer }
