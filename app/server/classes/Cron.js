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
	}

	stopCron() {
		clearInterval(this.interval);
	}

	addProcess(name, process) {

		var task = new Process(name, process);

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


module.exports = {
	Cron: Cron
};