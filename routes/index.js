'use strict';

var express = require('express');
var router = express.Router();

var controller = require('../app/server/controllers/index');

/// GET home page
router.get('/', function(req, res) {
  res.render('index', { title: 'acc-tools' });
});


//API Routing
router.post('/api/:source/:subSource', function(req, res, next) {
  controller.processEvent(req, res, next);
});


module.exports = router;
