require('dotenv').config()

const config = {
  port: process.env.PORT || 3000,
  jwtSecret: process.env.JWT_SECRET || 'change-me',
  sessionSecret: process.env.SESSION_SECRET || process.env.JWT_SECRET || 'change-me',
  mongoUri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/isro',
  webBase: process.env.WEB_BASE || 'http://localhost:3001',
  mailgun: {
    apiKey: process.env.MAILGUN_API_KEY || '',
    domain: process.env.MAILGUN_DOMAIN || '',
    from: process.env.MAILGUN_FROM || ''
  },
  azure: {
    apiKey: process.env.AZURE_API_KEY || '',
    endpoint: process.env.AZURE_TARGET_URI || process.env.AZURE_OPENAI_ENDPOINT || '',
    apiVersion: process.env.AZURE_API_VERSION || '2024-12-01-preview',
    deployments: {
      gpt4: process.env.AZURE_DEPLOYMENT_GPT4 || 'gpt-4.1',
      gpt5: process.env.AZURE_DEPLOYMENT_GPT5 || 'gpt-5-mini'
    }
  },
  paddle: {
    publicKey: (process.env.PADDLE_PUBLIC_KEY || '').replace(/\\n/g, '\n'),
    links: {
      hobby: process.env.PADDLE_LINK_HOBBY || '',
      pro: process.env.PADDLE_LINK_PRO || '',
      business: process.env.PADDLE_LINK_BUSINESS || ''
    },
    amounts: {
      hobby: Number(process.env.PADDLE_AMOUNT_HOBBY || 900),
      pro: Number(process.env.PADDLE_AMOUNT_PRO || 2900),
      business: Number(process.env.PADDLE_AMOUNT_BUSINESS || 9900)
    }
  }
}

module.exports = config
