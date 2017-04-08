"use strict";

// ---Modules---
var request = require('request');

var slackHook = process.env.SLACK_HOOK;


class Slack {
	constructor() {
	}

	//TODO: need to add validation to ensure that this.options are set before calling
	sendToSlack(params){

		return new Promise( (resolve, reject) => {
			request.post(params, (err, httpResponse, body) => {
				if (err) {
					reject(err);
				}
				resolve(body);
			})
		})
	}
}

class Alert extends Slack {
	constructor(
		
		//TODO: add validation
		username,
		icon_url,
		channel,
		text,
		attachments
		
	)
	 {
		super();
		 
		this.username = username;
		this.icon_url = icon_url;
		this.channel = channel;
		this.text = text;
		this.attachments = attachments;
		 
		//Set options in format for passing to Slack
		this._setOptions();
	}

	_setOptions() {
		this.options = {
			uri:                     slackHook,
			resolveWithFullResponse: true,
			json:                    true,
			body:                    {
				username: this.username,
				icon_url: this.icon_url,
				channel: this.channel,
				text: this.text,
				attachments: this.attachments
			}
		}
		
		
	}
}

module.exports = {
	Alert: Alert
};
