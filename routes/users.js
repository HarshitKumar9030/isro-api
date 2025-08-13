const express = require('express');
const { requireBearer } = require('../middleware/auth')
const { getPlan, userPlanName } = require('../utils/plans')
const { getDb } = require('../db/mongo')

const router = express.Router();


router.get('/me', requireBearer, async (req, res) => {
  const db = await getDb()
  const users = db.collection('users')
  const user = await users.findOne({ _id: req.user.sub })
  const planKey = userPlanName(user || {})
  const plan = getPlan(user || {})
  res.json({
    id: req.user.sub,
    name: user?.name || 'User',
    email: user?.email || '',
    plan: {
      key: planKey,
      name: plan.name,
      limits: {
        dataDaily: plan.dataDaily ?? null,
        dataMonthly: plan.dataMonthly ?? null,
        aiMiniDaily: plan.aiMiniDaily ?? null,
        aiMiniMonthly: plan.aiMiniMonthly ?? null,
        ai41Daily: plan.ai41Daily ?? null,
        ai41Monthly: plan.ai41Monthly ?? null,
      }
    }
  })
})

module.exports = router;
