'use strict';

class Cron {
	constructor(delay) {
		this.cronID = '';
		this.processList = [];
		this.delay = delay;
		this.interval = '';
	}

	_iterateAllProcesses() {
		this.processList.forEach( process => {
			process.action();
		})
	}

	startCron() {
		this.interval = setInterval( () => {
			this._iterateAllProcesses()
		}, this.delay);

		console.log('Started interval: ', this.interval);
	}

	stopCron() {
		clearInterval(this.interval);

		console.log('Cleared interval: ', this.interval);
	}

	addProcess(name, process) {

		console.log('Process being added: ', process);

		var task = new Process(name, process);

		console.log('declared a new object: ', task);

		task.setProcessLogID(this._addToProcessLog(task));
	}

	_addToProcessLog(process){
		return (this.processList.push(process) - 1);
	}
}

class Process {
	constructor(name, action) {
		this.name = name;
		this.action = action;
	}

	setProcessLogID(id) {
		this.processLogID = id;
	}

	//TODO: add an 'active' property.  cron will only call Processes with active = true
}

var delayedFunc1 = () => {

	console.log('Process 1 fired!')
};

var delayedFunc2 = () => {

	console.log('Process 2 fired!')
};

/*
var cron1 = new Cron(500);

cron1.addProcess('delayedFunc1', delayedFunc1);
cron1.addProcess('delayedFunc2', delayedFunc2);

cron1.startCron();




setTimeout(function() {
	console.log('Stopping Processes');
	cron1.stopCron();
}, 3000);*/


module.exports = {
	Cron: Cron
};