require('dotenv').config()

const config = {
  port: process.env.PORT || 3000,
  jwtSecret: process.env.JWT_SECRET || 'change-me',
  mongoUri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/isro',
  mailgun: {
    apiKey: process.env.MAILGUN_API_KEY || '',
    domain: process.env.MAILGUN_DOMAIN || '',
    from: process.env.MAILGUN_FROM || ''
  }
}

module.exports = config
