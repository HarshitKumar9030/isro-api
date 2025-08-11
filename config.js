require('dotenv').config()

const config = {
  port: process.env.PORT || 3000,
  jwtSecret: process.env.JWT_SECRET || 'change-me',
  mongoUri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/isro',
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
  }
}

module.exports = config
