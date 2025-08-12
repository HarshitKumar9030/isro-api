var express = require('express');
var router = express.Router();

router.get('/', function(req, res, next) {
  res.render('docs', {});
});

router.get('/docs', function(req, res) {
  res.render('docs', {})
})

module.exports = router;
