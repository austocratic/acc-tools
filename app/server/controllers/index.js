'use strict';

var RequestEvent = require('../classes/RequestEvent').RequestEvent;
var BusinessObject = require('../classes/BusinessObjects');


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
                taxAmount:       0,
                isRefund:        incomingEvent.getEventDetails().refunded,
                refundDetails:   getRefundDetails()
            });

            // Call 3rd party APIs to set properties that will be used to createAccountingEntry
            BO.prepareEntry()
                .then( () =>{
                    BO.createAccountingEntry()
                        .then( () => {
                            res.status(200).send('Entry Posted')
                        })
                        .catch( rej => {
                            res.status(500).send('Failed to post transaction, error: ' + rej);
                        })
                })
                .catch( rej => {
                    res.status(500).send('Failed to post transaction, error: ' + rej);
                });

            break;

        case 'bankTransfer':

            var bankTransfer = new BusinessObject.BankTransfer({
                txnID:           incomingEvent.getEventDetails().balance_transaction,
                description:     incomingEvent.getEventDetails().description,
                source:          incomingEvent.req.params.source,
                subSource:       incomingEvent.req.params.subSource,
                transferID:      incomingEvent.getEventDetails().id,
                amount:    incomingEvent.getEventDetails().amount,
                date:      new Date(incomingEvent.getEventDetails().created * 1000)
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

            console.log('Received BO request for repairTransfer');

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



