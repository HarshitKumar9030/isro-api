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

var app = express();

app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');
app.locals.site = { title: 'ISRO API' }

app.use(logger('dev'));
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.use(authOptional);
app.use((req, res, next) => {
  const p = req.path || ''
  if (p === '/' || p === '/auth/signup') return next()
  return makeLimiter({ windowMs: 24 * 60 * 60 * 1000, unauthLimit: 200, authLimit: 200 })(req, res, next)
});

app.use('/', indexRouter);
app.use('/users', usersRouter);
app.use('/api', requireBearer, apiRouter);
app.use('/auth', authRouter);
app.use('/enquire', requireBearer, enquireRouter);

app.use(function(req, res, next) {
  next(createError(404));
});

app.use(function(err, req, res, next) {
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  res.status(err.status || 500);
  res.render('error');
});

module.exports = app;
