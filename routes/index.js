

var express = require('express');
var router = express.Router();

var controller = require('../app/server/controllers/index');


// GET home page

router.get('/', function(req, res) {
  res.render('index', { title: 'acc-tools' });
});

// GET cron page
/*
router.get('/cron', function(req, res) {

  var localProcesses = controller.getCronProcesses();

  console.log('exported processList: ', JSON.stringify(controller.getCronProcesses()) );

  res.render('cron', { title: 'cron jobs', processName: localProcesses });
});*/

//API Routing
router.post('/api/:source/:subSource', function(req, res, next) {
  controller.processEvent(req, res, next);
});


module.exports = router;




