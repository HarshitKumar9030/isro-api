var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
var helmet = require('helmet');
var config = require('./config');

var { authOptional, requireBearer } = require('./middleware/auth');
var { makeLimiter } = require('./middleware/rateLimit');

var indexRouter = require('./routes/index');
var usersRouter = require('./routes/users');
var apiRouter = require('./routes/api');
var authRouter = require('./routes/auth');
var enquireRouter = require('./routes/enquire');
var aiRouter = require('./routes/ai');
var swaggerUi = require('swagger-ui-express');
var fs = require('fs');

var app = express();

app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');
app.locals.site = { title: 'ISRO API' }

app.use(logger('dev'));
// helmet keep things safe, I turn off strict csp for docs ui
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.use(authOptional);
// I allow homepage and signup not rate limited much
app.use((req, res, next) => {
  const p = req.path || ''
  if (p === '/' || p === '/auth/signup') return next()
  return makeLimiter({ windowMs: 24 * 60 * 60 * 1000, unauthLimit: 200, authLimit: 200 })(req, res, next)
});

app.use('/', indexRouter);
app.use('/users', usersRouter);
// api and ai need bearer, so we block if no token
app.use('/api', requireBearer, apiRouter);
app.use('/auth', authRouter);
app.use('/enquire', requireBearer, enquireRouter);
app.use('/ai', requireBearer, aiRouter);
// openapi + swagger for pretty docs, simple serve
app.get('/openapi.json', (req, res) => {
  try {
    const spec = fs.readFileSync(path.join(__dirname, 'openapi.json'), 'utf8')
    res.setHeader('Content-Type', 'application/json')
    return res.send(spec)
  } catch (e) { return res.status(500).json({ error: 'spec not found' }) }
});
app.use('/swagger', swaggerUi.serve, swaggerUi.setup(require('./openapi.json')));

app.use(function(req, res, next) {
  next(createError(404));
});

app.use(function(err, req, res, next) {
  // if crash happen, we show error page simple
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  res.status(err.status || 500);
  res.render('error');
});

module.exports = app;
