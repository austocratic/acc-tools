'use strict';

var express = require('express');
var router = express.Router();

var controller = require('../app/server/controllers/index');

//TODO: Delete this.  For testing only
var Cron = require('../app/server/classes/Cron');

/// GET home page
router.get('/', function(req, res) {
  res.render('index', { title: 'acc-tools' });
});

//TODO: likely delete this unless I really have a list of processes running
router.get('/cron', function(req, res) {

  res.render('cron', { title: 'cron list', processName: ''/*cron1.processList[0].name*/ });
});


//API Routing
router.post('/api/:source/:subSource', function(req, res, next) {
  controller.processEvent(req, res, next);
});


module.exports = router;
