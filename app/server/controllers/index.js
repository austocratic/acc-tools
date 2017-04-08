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
                        .then( () => {
                            res.status(200).send('Entry Posted')
                        })
                        .catch( rej => {
                            res.status(500).send('Failed to post transaction, error: ' + rej);
                        })
                })
                .catch( err =>{
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

            var txnID, amount, description, disputeFeeAmount, source;

            //If event is a funds withdrawn event, find the negative balanceTransaction
            if (incomingEvent.getEventDetails().type = 'charge.dispute.withdrawn') {
                incomingEvent.getEventDetails().balance_transactions.forEach(balanceTransaction => {
                    if (balanceTransaction.amount < 0) {
                        txnID = balanceTransaction.id;
                        amount = balanceTransaction.net;
                        description = balanceTransaction.description;
                        disputeFeeAmount = balanceTransaction.fee;
                        source = balanceTransaction.source;
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
                        source = balanceTransaction.source;
                    }
                })
            }

            var chargeback = new BusinessObject.Chargeback({
                txnID:            txnID, //ok
                description:      description, //ok
                source:           incomingEvent.req.params.source, //ok
                subSource:        incomingEvent.req.params.subSource, //ok
                id:               source,
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

            //Get & format the created date
            var createdDate = new Date(incomingEvent.getEventDetails().created * 1000);
            var formattedCreatedDate = (createdDate.getMonth() + 1) + '/' + createdDate.getDate() + '/' + createdDate.getFullYear();

            //Get & format the evidence due date
            var dueDate = new Date(incomingEvent.getEventDetails().evidence_details.due_by * 1000);
            var formattedDueDate = (dueDate.getMonth() + 1) + '/' + dueDate.getDate() + '/' + dueDate.getFullYear();

            var chargebackAlert = new BusinessObject.ChargebackAlert(
                (incomingEvent.getEventDetails().amount / 100),
                incomingEvent.getEventDetails().id,
                formattedCreatedDate,
                formattedDueDate,
                incomingEvent.getEventDetails().reason,
                incomingEvent.getEventDetails().charge,
                //Route specific properties used to capture the event source (platform & specific platform account)
                incomingEvent.getRouteParameters().source,
                incomingEvent.getRouteParameters().subSource
              );

            chargebackAlert.slackAlert()
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

    //Deployed to multiple servers, don't want requests to fire simultaneously.  Add seed value
    function getRandomInt(min, max) {
        min = Math.ceil(min);
        max = Math.floor(max);
        return Math.floor(Math.random() * (max - min)) + min;
    }

    //Seed by 5-20 seconds
    var seed = getRandomInt(5000, 20000);

    //TODO: Set cron delay with a config file.  May eventually set w/ UI show a list of crons displaying as "active"
    // or "inactive" & allow user to change the cron delay.
    var cron = new Cron.Cron((43200000 + seed));

    //Add Paypal Transferes query to cron. This function does the following:
    //1. Search PayPal for recent transfer transactions
    //2. Identifies which do not exist in Intacct
    //3. Creates Transfer Business Objects for them
    //4. Posts them to accounting system
    cron.addProcess('paypalTransfers', transactionSearches.payPalTransfers);

    //Start the cron
    cron.startCron();

};

