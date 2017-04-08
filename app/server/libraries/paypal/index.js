"use strict";

// ---Modules---
var request = require('request');
var querystring = require('querystring');

const PAYPAL_NVP = 'https://api-3t.paypal.com/nvp';

class PayPalRequest {
	constructor() {}

	sendRequest(params) {
		return new Promise( (resolve, reject) => {
			//request.post(this.payPalRequest, (err, httpResponse, body) => {
			request.post(params, (err, httpResponse, body) => {
				if (err) {
					reject(err);
				}
				resolve(querystring.parse(body));
			})
		})
	}
}

class TransactionSearch extends PayPalRequest {
	constructor(start, end, type, id) {
		super();

		this.request = {
			url:  PAYPAL_NVP,
			form: {
				USER:            	process.env.PAYPAL_USER,
				PWD:              	process.env.PAYPAL_PASS,
				SIGNATURE:       	process.env.PAYPAL_SIG,
				STATUS:           	'Success',
				VERSION:          	94,
				METHOD: 			'TransactionSearch',
				TRANSACTIONCLASS: 	type,
				STARTDATE: 			start,
				ENDDATE: 			end,
				TRANSACTIONID: 		id
			}
		};
	}
}

class GetTransactionDetails extends PayPalRequest {
	constructor(id) {
		super();

		this.request = {
			url:  PAYPAL_NVP,
			form: {
				USER:            	process.env.PAYPAL_USER,
				PWD:              	process.env.PAYPAL_PASS,
				SIGNATURE:       	process.env.PAYPAL_SIG,
				VERSION:          	94,
				METHOD: 			'GetTransactionDetails',
				TRANSACTIONID: 		id
			}
		};
	}
}

module.exports = {
	TransactionSearch: TransactionSearch,
	GetTransactionDetails: GetTransactionDetails
};



