const { MongoClient } = require('mongodb')
const config = require('../config')

const uri = config.mongoUri
let client

async function getClient() {
  if (client && client.topology && client.topology.isConnected()) return client
  client = new MongoClient(uri, { ignoreUndefined: true })
  await client.connect()
  return client
}

async function getDb() {
  const c = await getClient()
  const url = new URL(uri)
  const dbName = url.pathname.replace(/^\//, '') || 'isro'
  return c.db(dbName)
}

module.exports = { getClient, getDb }
