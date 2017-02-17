

//Set environment variables based on local .env file if USE_LOCAL_ENV is true
//dev script sets USE_LOCAL_ENV, start does not
if(process.env.USE_LOCAL_ENV) {
  require('dotenv').config();
}

var express = require('express');
var bodyParser = require('body-parser');
var path = require('path');

var index = require('./routes/index');
var entry = require('./app/server/entry');

var app = express();

// view engine setup
app.set('views', path.join(__dirname, 'app/client/views'));
app.set('view engine', 'jade');

app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

app.use('/', index);

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  var err = new Error('Not Found');
  err.status = 404;
  next(err);
});

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

module.exports = app;
