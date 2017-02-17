'use strict';

var RequestEvent = require('../classes/RequestEvent').RequestEvent;
var BusinessObject = require('../classes/BusinessObjects');
var Cron = require('../classes/Cron');

var transactionSearches = require('./transactionSearches');

//For testing
var intacct = require('../libraries/intacct/index');
var paypal = require('../libraries/paypal/index');

//This function is called by routes on a network request
exports.processEvent = (req, res) => {

    // Declare new Event Object
    // Constructor of RequestEvent uses logic to set a property "businessObject" which is read below
    var incomingEvent = new RequestEvent(req);

    // Read incomingEvent's businessObject property to determine what type of BusinessObject should be created
    switch (incomingEvent.getBusinessObject()) {

        case undefined:
            // If Object is not supported respond with status 220 so that webhooks still receive OK
            res.status(220).send('Business Object is not supported');

            break;

        case 'repair':

            //TODO we currently get refund details here, but we also need to make API calls to get transfer details
            // & application fee details (txn ID and amounts) of REFUNDS
            // call get transfer then reference: .reversals.data[0].balance_transaction & .reversals.data[0].amount

            //Determine if refunds variables should be passed into new BO
            var getRefundDetails = () => {
                if (incomingEvent.getEventDetails().refunded) {
                    return {
                        date: new Date(incomingEvent.getEventDetails().refunds.data[0].created * 1000),
                        amount: incomingEvent.getEventDetails().refunds.data[0].amount,
                        ID: incomingEvent.getEventDetails().refunds.data[0].id,
                        txnID: incomingEvent.getEventDetails().refunds.data[0].balance_transaction
                    }
                } else {
                    return ''
                }
            };

            // Create new repair object
            var BO = new BusinessObject.Repair({
                txnID:           incomingEvent.getEventDetails().balance_transaction,
                chargeID:        incomingEvent.getEventDetails().id,
                taxCollectionID: incomingEvent.getEventDetails().application_fee,
                transferID:      incomingEvent.getEventDetails().transfer,
                chargeAmount:    incomingEvent.getEventDetails().amount,
                tip:             incomingEvent.getEventDetails().metadata.tip,
                tax:             incomingEvent.getEventDetails().metadata.tax,
                repairID:        incomingEvent.getEventDetails().metadata.repair_id,
                date:            new Date(incomingEvent.getEventDetails().created * 1000),
                latitude:        incomingEvent.getEventDetails().metadata.latitude,
                longitude:       incomingEvent.getEventDetails().metadata.longitude,
                payoutAmount:    0,
                amountHeld:      0,
                isRefund:        incomingEvent.getEventDetails().refunded,
                refundDetails:   getRefundDetails()
            });

            // Call 3rd party APIs to set properties that will be used to createAccountingEntry
            // These set properties that were not already set in the constructor by passing Event properties in
            BO.setProps()
                .then( () =>{

                    BO.createAccountingEntry()
                        .then( () => {
                            res.status(200).send('Entry Posted')
                        })
                        .catch( rej => {
                            console.log('Error creating entry: ', JSON.stringify(rej));
                            res.status(500).send('Failed to post transaction, error: ' + rej);
                        })
                })
                .catch( rej => {
                    res.status(500).send('Failed to post transaction, error: ' + rej);
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
                    console.log('Error when creating entry: ', rej);
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

        default: console.log('BO type not supported')
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

