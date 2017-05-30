'use strict';

var RequestEvent = require('../classes/RequestEvent').RequestEvent;
var BusinessObject = require('../classes/BusinessObjects');
var Cron = require('../classes/Cron');

//For testing
var intacct = require('../libraries/intacct/index');
var paypal = require('../libraries/paypal/index');


exports.payPalTransfers = () => {

	getPayPalTransfers(25)
		.then( transferIDs => {

			//Pull out transaction IDs and store in an array
			var resultsArray = getTransactionIDs(transferIDs);

			//Iterate through transaction ID array searching Intacct for results
			//Create new array of transaction IDs that do not exist in Intacct
			getMissingTransactions(resultsArray)
				.then( missingTransactions => {

					//Iterate through the "missing" transactions create array of Intacct Entry promises
					var intacctRequests = missingTransactions.map(singleTransactionID => {

						return new Promise((resolve, reject) => {

							var ppRequest = new paypal.TransactionSearch('2014-01-01T00:00:00Z', '', '', singleTransactionID);

								ppRequest.sendRequest(ppRequest.request)
									.then(ppDetails => {

										var subSource = 'paypal';

										//creating business object
										var bankTransfer = new BusinessObject.BankTransfer({
											txnID:       ppDetails.L_TRANSACTIONID0,
											description: 'paypal bank transfer',
											source:      '',
											subSource:   subSource,
											transferID:  ppDetails.L_TRANSACTIONID0,
											amount:      -(ppDetails.L_AMT0), //Negative transaction in Paypal means
											// it is going to the bank.  Opposite of Stripe
											date:        new Date(ppDetails.L_TIMESTAMP0),
											memo:        "Cash transfer | Account: " + subSource
										});

										bankTransfer.createAccountingEntry()
												.then(res => {
													resolve(res);
												})
												.catch(err => {
													reject(err);
												});
									})
						})
					});
					Promise.all(intacctRequests)
				})
				.catch( (err) => {
					console.log('failure - getMissingTransactions: ', err)
				})
		});

	//Search PayPal for transfer transactions from the past few days
	function getPayPalTransfers(daysBack) {

		return new Promise((resolve, reject) => {

			//Determine date range to search
			var today = new Date();
			var convertedToday = today.toISOString();

			var yesterday = new Date(today.setDate(today.getDate() - daysBack));
			var convertedYesterday = yesterday.toISOString();

			var queryPP = new paypal.TransactionSearch(convertedYesterday, convertedToday, 'FundsWithdrawn');

			queryPP.sendRequest(queryPP.request)
				.then((res)=> {
					resolve(res)
				})
				.catch((err)=> {
					console.log('ERROR when sending PayPal request: ', err);
					reject(err)
				})
		});
	}

	//Extract the transaction ID and store in an array
	function getTransactionIDs(payPalObject) {

		var transactions = [];

		//Maximum Paypal Transactions returned = 100.  Loop maximum 105 (if break doesnt happen)
		//TODO: build in functionality to handle more than 100 results (pagination)
		for (var x = 0; x < 104; x++) {

			var transID = String(('L_TRANSACTIONID' + x));

			if (payPalObject[transID]) {

				//If transID exists, add to array
				transactions.push(payPalObject[transID]);
			} else {

				//When loop runs out of transIDs, Exit the loop
				break;
			}
		}
		return transactions;
	}

	function getMissingTransactions(idArray) {

		return new Promise((resolve, reject)=>{

			getIntacctDetails()
				.then( detailsArray => {

					//Create array of transaction IDs that do not exist in Intacct
					var missingIDs = detailsArray.map( details => {

						//TODO: need to fix so response is not response.response
						if(details.response.response.operation[0].result[0].data[0].$.count == 0){
							return details.input
						} else {
							return undefined;
						}
					})
					//Array will have undefined values if transaction does not exist.  Filter these out (we only
					// want transactions in the array the do exist
					.filter( value =>{
						if (value !== undefined) {
							return value
						}
					});

					//Resolve array of transaction IDs that do not exist in Intacct
					resolve(missingIDs);
				});
		});

			function getIntacctDetails() {
				return new Promise((resolve, reject) => {

					//Iterate through transaction array creating promises for each & mapping those promises into promiseArray
					var promiseArray = idArray.map(id => {

						return new Promise((resolve, reject) => {

							var referenceNo = "REFERENCENO = '" + id + "'";

							var query = new intacct.Query('GLBATCH', referenceNo, 'REFERENCENO');

							query.sendRequest(query.xmlQuery)
								.then(res => {
									resolve({input: id, response: res})
								})
								.catch(err => {
									reject(err)
								})
						});
					});
					Promise.all(promiseArray)
						.then(res => {
							resolve(res)
						})
						.catch(err => {
							reject(err)
						})
				});
			}
	}



};