'use strict';

var transactionSearches = require('./transactionSearches');

var RequestEvent = require('../classes/RequestEvent').RequestEvent;
var BusinessObject = require('../classes/BusinessObjects');
var Cron = require('../classes/Cron');

var google = require('../libraries/google/index');

var stripeOperating = require("stripe")(
    process.env.STRIPEKEYOPERATING
);

//This function is called by routes on a network request
exports.processEvent = (req, res) => {

    // Declare new Event Object
    // Constructor of RequestEvent uses logic to set a property "controllerType" which is read below
    var incomingEvent = new RequestEvent(req);

    // Read incomingEvent's controllerType property to determine what type of controller
    // Controllers provide procedural direction to creating a transaction
    switch (incomingEvent.getControllerType()) {

        case undefined:
            // If Object is not supported respond with status 220 so that webhooks still receive OK
            res.status(220).send('Business Object is not supported');

            break;

        case 'stripe.repair':

            var repairPromises = [];

            //If lat & lon properties exist, get the zip code of associate lat/lon
            if (incomingEvent.getEventDetails().metadata.latitude && incomingEvent.getEventDetails().metadata.longitude) {
                repairPromises.push(google.getZip(incomingEvent.getEventDetails().metadata.latitude, incomingEvent.getEventDetails().metadata.longitude));
            }

            //Create a promise to get details about the transaction, push promise into array
            repairPromises.push(stripeOperating.balance.retrieveTransaction(incomingEvent.getEventDetails().balance_transaction));

            //If charge has an associated transfer, create a promise to get details about transfer, push promise
            // into array
            if (incomingEvent.getEventDetails().transfer) {
                repairPromises.push(stripeOperating.transfers.retrieve(incomingEvent.getEventDetails().transfer));
            }
            //If charge has an associated application_fee, create a promise to get details about transfer, push promise
            // into array
            if (incomingEvent.getEventDetails().application_fee) {
                repairPromises.push(stripeOperating.applicationFees.retrieve(incomingEvent.getEventDetails().application_fee));
            }

            //Resolve above promises
            Promise.all(repairPromises)
                .then( repairObjects =>{

                    var address = repairObjects.find( repairObj =>{
                        return repairObj.object == 'address';
                    });

                    var balance_transaction = repairObjects.find( stripeObj =>{
                        return stripeObj.object == 'balance_transaction';
                    });

                    var transfer = repairObjects.find( stripeObj =>{
                        return stripeObj.object == 'transfer';
                    });

                    var application_fee = repairObjects.find( stripeObj =>{
                        return stripeObj.object == 'application_fee';
                    });

                    var convertToDollar = (amount) => {
                        return (Math.abs(amount) / 100);
                    };

                    //Default values, may get overridden if values are available
                    var appFeeTxnID = '', appFeeAmount = 0, payoutTxnID = '', payoutAmount = 0, processingFeeAmount = 0;

                    if (application_fee) {
                        appFeeTxnID = application_fee.balance_transaction;
                        appFeeAmount = convertToDollar(application_fee.amount);
                    }
                    if (transfer) {
                        payoutTxnID = transfer.balance_transaction;
                        payoutAmount = convertToDollar(transfer.amount);
                    }

                    if (balance_transaction){
                        processingFeeAmount = convertToDollar(balance_transaction.fee);
                    }
                        
                    var BO = new BusinessObject.Repair({
                        txnID:               incomingEvent.getEventDetails().balance_transaction,
                        chargeAmount:        convertToDollar(incomingEvent.getEventDetails().amount),
                        taxTxnID:            appFeeTxnID,
                        amountHeld:          appFeeAmount,
                        payoutTxnID:         payoutTxnID,
                        payoutAmount:        payoutAmount,
                        processingFeeAmount: processingFeeAmount,
                        chargeID:            incomingEvent.getEventDetails().id,
                        memo:      'Repair: App Sale | Repair ID: ' + incomingEvent.getEventDetails().metadata.repair_id + ' | Zip' +
                            ' Code: ' + address.zip,
                        tip:                 incomingEvent.getEventDetails().metadata.tip,
                        tax:                 incomingEvent.getEventDetails().metadata.tax,
                        //repairID:            incomingEvent.getEventDetails().metadata.repair_id,
                        date:                new Date(incomingEvent.getEventDetails().created * 1000),
                        latitude:            incomingEvent.getEventDetails().metadata.latitude,
                        longitude:           incomingEvent.getEventDetails().metadata.longitude,
                        direction:           'collection',
                        isRefund:            incomingEvent.getEventDetails().refunded
                    });

                    //Create entry documents and send to Intacct
                    BO.createAccountingEntry()
                        .then( response => {
                            res.status(200).send('Entry Posted')
                        })
                        .catch( rej => {
                            res.status(500).send('Failed to post transaction, error: ' + rej);
                        })
                })
                .catch((err)=>{
                    console.log('TESTING: ERROR getting stripe response: ', err)
                });

            break;

        case 'stripe.repair.refund':

            var repairRefundPromises = [];

            //If lat & lon properties exist, get the zip code of associate lat/lon
            if (incomingEvent.getEventDetails().metadata.latitude && incomingEvent.getEventDetails().metadata.longitude) {
                repairRefundPromises.push(google.getZip(incomingEvent.getEventDetails().metadata.latitude, incomingEvent.getEventDetails().metadata.longitude));
            }

            //A charge refunded event will always have an associated refund
            repairRefundPromises.push(stripeOperating.balance.retrieveTransaction(incomingEvent.getEventDetails().refunds.data[0].balance_transaction));

            //Look up the charge's transfer we will later see if it was reversed
            if (incomingEvent.getEventDetails().transfer) {
                repairRefundPromises.push(stripeOperating.transfers.retrieve(incomingEvent.getEventDetails().transfer));
            }
            //Look up the charge's application fee we will later see if it was reversed
            if (incomingEvent.getEventDetails().application_fee) {
                repairRefundPromises.push(stripeOperating.applicationFees.retrieve(incomingEvent.getEventDetails().application_fee));
            }

            //Resolve above promises
            Promise.all(repairRefundPromises)
                .then( repairObjects =>{

                    var address = repairObjects.find( repairObj =>{
                        return repairObj.object == 'address';
                    });

                    //Find the balance_transaction in the array of results
                    var balance_transaction = repairObjects.find(stripeObj => {
                        return stripeObj.object == 'balance_transaction';
                    });
                    //Find the transfer in the array of results
                    var transfer = repairObjects.find(stripeObj => {
                        return stripeObj.object == 'transfer';
                    });
                    //Find the application_fee in the array of results
                    var application_fee = repairObjects.find(stripeObj => {
                        return stripeObj.object == 'application_fee';
                    });

                    //Now determine if the transfer was refunded:
                    var refundPromises = [];

                    var convertToDollar = (amount) => {
                        return (Math.abs(amount) / 100);
                    };

                    //Default values, may get overridden if values are available
                    var balanceTxnID = '', balanceAmount = 0, appFeeTxnID = '', appFeeAmount = 0, payoutTxnID = '', payoutAmount = 0, processingFeeAmount = 0;

                    if (application_fee) {
                        if (application_fee.refunds.data.length > 0) {
                            appFeeTxnID = application_fee.refunds.data[0].balance_transaction;
                            appFeeAmount = convertToDollar(application_fee.refunds.data[0].amount);
                        }
                    }
                    if (transfer) {
                        if (transfer.reversals.data.length > 0) {
                            payoutTxnID = transfer.reversals.data[0].balance_transaction;
                            payoutAmount = convertToDollar(transfer.reversals.data[0].amount);
                        }
                    }

                    console.log('balance transaction: ', JSON.stringify(balance_transaction));

                    //Set attributes related to the
                    if (balance_transaction) {
                        balanceTxnID = balance_transaction.id;
                        processingFeeAmount = convertToDollar(balance_transaction.fee);
                        balanceAmount = convertToDollar(balance_transaction.amount);
                    }

                    var BO = new BusinessObject.Repair({
                        txnID:               balanceTxnID,
                        chargeAmount:        balanceAmount,
                        taxTxnID:            appFeeTxnID,
                        amountHeld:          appFeeAmount,
                        payoutTxnID:         payoutTxnID,
                        payoutAmount:        payoutAmount,
                        processingFeeAmount: processingFeeAmount,
                        chargeID:            incomingEvent.getEventDetails().id,
                        memo:      'REFUND: Repair: App Sale | Repair ID: ' + incomingEvent.getEventDetails().metadata.repair_id + ' | Zip' +
                                             ' Code: ' + address.zip,
                        tip:                 incomingEvent.getEventDetails().metadata.tip,
                        tax:                 incomingEvent.getEventDetails().metadata.tax,
                        date:                new Date(incomingEvent.getEventDetails().created * 1000),
                        latitude:            incomingEvent.getEventDetails().metadata.latitude,
                        longitude:           incomingEvent.getEventDetails().metadata.longitude,
                        direction:           'refund',
                        isRefund:            incomingEvent.getEventDetails().refunded
                    });

                    //Create entry documents and send to Intacct
                    BO.createAccountingEntry()
                        .then( response => {
                            console.log('Successfully posted: ', JSON.stringify(response));
                            res.status(200).send('Entry Posted')
                        })
                        .catch( rej => {
                            console.log('Error creating entry: ', JSON.stringify(rej));
                            res.status(500).send('Failed to post transaction, error: ' + rej);
                        })
                })
                .catch((err)=>{
                    console.log('TESTING: ERROR getting stripe response: ', err)
                });

            break;

        case 'bankTransfer':

            //TODO: move this function somewhere else maybe into a utility function file
            //Other business objects currently rely on this conversion in the object need to remove
            var convertToDollar = (amount) => {
                return (Math.abs(amount) / 100);
            };

            var bankTransfer = new BusinessObject.BankTransfer({
                txnID:           incomingEvent.getEventDetails().balance_transaction,
                description:     incomingEvent.getEventDetails().description,
                source:          incomingEvent.req.params.source,
                subSource:       incomingEvent.req.params.subSource,
                transferID:      incomingEvent.getEventDetails().id,
                amount:    convertToDollar(incomingEvent.getEventDetails().amount),
                date:      new Date(incomingEvent.getEventDetails().created * 1000),
                memo:       "Cash transfer | Account: " + incomingEvent.req.params.subSource + " | Description: " +
                            incomingEvent.getEventDetails().description
            });

            bankTransfer.createAccountingEntry()
                .then(()=>{
                    res.status(200).send('Entry Posted')
                })
                .catch( rej =>{
                    res.status(500).send('Failed to post transaction, error: ' + rej);
                });

            break;

        case 'repairTransfer':

            var discountedRepairTransfer = new BusinessObject.DiscountedRepairTransfer({
                txnID:           incomingEvent.getEventDetails().balance_transaction,
                description:     incomingEvent.getEventDetails().description,
                source:          incomingEvent.req.params.source,
                subSource:       incomingEvent.req.params.subSource,
                transferID:      incomingEvent.getEventDetails().id,
                amount:    incomingEvent.getEventDetails().amount,
                date:      new Date(incomingEvent.getEventDetails().created * 1000)
            });

            discountedRepairTransfer.createAccountingEntry()
                .then(()=>{
                    res.status(200).send('Entry Posted')
                })
                .catch( rej =>{
                    res.status(500).send('Failed to post transaction, error: ' + rej);
                });

            break;

        case 'chargeback':

            //TODO: move this function somewhere else maybe into a utility function file
            //Other business objects currently rely on this conversion in the object need to remove
            var convertToDollar = amount => {
                return ( amount / 100);
            };

            //Stripe dispute objects have a property of array of balance_transactions

            var txnID, amount, description, disputeFeeAmount;

            //If event is a funds withdrawn event, find the negative balanceTransaction
            if (incomingEvent.getEventDetails().type = 'charge.dispute.withdrawn') {
                incomingEvent.getEventDetails().balance_transactions.forEach(balanceTransaction => {
                    if (balanceTransaction.amount < 0) {
                        txnID = balanceTransaction.id;
                        amount = balanceTransaction.net;
                        description = balanceTransaction.description;
                        disputeFeeAmount = balanceTransaction.fee;
                    }
                })
            }

            //If event is a funds withdrawn event, find the positive balanceTransaction
            if (incomingEvent.getEventDetails().type = 'charge.dispute.funds_reinstated') {
                incomingEvent.getEventDetails().balance_transactions.forEach(balanceTransaction => {
                    if (balanceTransaction.amount > 0) {
                        txnID = balanceTransaction.id;
                        amount = balanceTransaction.net;
                        description = balanceTransaction.description;
                        disputeFeeAmount = balanceTransaction.fee;
                    }
                })
            }

            var chargeback = new BusinessObject.Chargeback({
                txnID:            txnID, //ok
                description:      description, //ok
                source:           incomingEvent.req.params.source, //ok
                subSource:        incomingEvent.req.params.subSource, //ok
                id:               incomingEvent.getEventDetails().id, //ok
                amount:           convertToDollar(amount), //ok
                disputeFeeAmount: Math.abs(convertToDollar(disputeFeeAmount)), //ok
                date:             new Date(incomingEvent.getEventDetails().created * 1000), //ok
                memo:             "Chargeback | Account: " + incomingEvent.req.params.subSource + " | Description: " +
                                  description
            });

            chargeback.createAccountingEntry()
                .then(()=> {
                    res.status(200).send('Entry Posted')
                })
                .catch(rej => {
                    res.status(500).send('Failed to post transaction, error: ' + rej);
                });

            break;

        case 'chargebackAlert':

            //TODO: I should consider removing chargebackAlert from Business objects.
            //Controller could declare a new slack object directly (why flow through BO?)
            var chargebackAlert = new BusinessObject.ChargebackAlert();

            chargeback.slackAlert()
                .then(()=> {
                    res.status(200).send('Alerted via Slack')
                })
                .catch(rej => {
                    res.status(500).send('Failed to alert via Slack: ' + rej);
                });


            break;


        default:

            res.status(220).send('BO type not supported');
    }
};


//This function is called by entry.js on server boot
exports.processCron = () => {

    var delayedFunc1 = () => {

        console.log('Test Cron Process 1 fired!')
    };

    var delayedFunc2 = () => {

        console.log('Test Cron Process 2 fired!')
    };

    //TODO: need to set cron delay here.  This should probably be set with a config file.  The UI will eventually
    // show a list of crons displaying as "active" or "inactive" & allow user to change the cron delay.
    var cron1 = new Cron.Cron(43200000);
    //var cron1 = new Cron.Cron(5000);

    cron1.addProcess('function1', delayedFunc1);
    cron1.addProcess('function2', delayedFunc2);

    //Add Paypal Transferes query to cron. This function does the following:
    //1. Search PayPal for recent transfer transactions
    //2. Identifies which do not exist in Intacct
    //3. Creates Transfer Business Objects for them
    //4. Posts them to accounting system
    cron1.addProcess('paypalTransfers', transactionSearches.payPalTransfers);

    //Start the cron
    cron1.startCron();

};


//Testing to delete
/*
exports.testing = () => {

    var balance_transaction = "txn_19SxCcF6QqXJdGIYJjuo3p2n";

    stripeOperating.balance.retrieveTransaction(balance_transaction)
        .then((res)=>{
            console.log('TESTING: got stripe response: ', res)
        })
        .catch((err)=>{
            console.log('TESTING: ERROR getting stripe response: ', err)
        })
};*/

