const express = require('express');
const config = require('../config');
const router = express.Router();

// Root Swagger is configured in app.js; this fallback redirects /docs to web
router.get('/docs', (req, res) => {
  const to = (config.webBase || 'http://localhost:3001') + '/'
  res.redirect(302, to)
});

module.exports = router;
