'use strict';

var slack = require('../libraries/slack/index');


class RequestEvent {
    constructor(req) {

        //Validation, ensure req is defined
        if (req === undefined) {
            throw new Error('RequestEvent req argument is undefined')
        }

        this.req = req;

        //Use business logic to determine "businessObject"  This "businessObject" property will be referenced later
        this._setBusinessObject();
    }

    _setBusinessObject() {
       this.controllerType = this.determineController(this.req.params.source, this.req.body);
    }

    determineController(source, reqBody) {

        //Default value: not supported.  Overwrite businessType if supported
        var controllerType = undefined;

        switch(source) {
            case 'stripe':
                switch(reqBody.type) {
                    case 'charge.succeeded':
                        try {

                            var thresholdForAlert = 30000;

                            //Get & format the created date
                            var createdDate = new Date(reqBody.data.object.created * 1000);
                            var formattedCreatedDate = (createdDate.getMonth() + 1) + '/' + createdDate.getDate() + '/' + createdDate.getFullYear();
                            
                            //Slack Alert for charges over threshold
                            if (reqBody.data.object.amount > thresholdForAlert){
                                var chargeAlert = new slack.Alert(
                                    'acc-tools',
                                    'http://megaicons.net/static/img/icons_sizes/12/77/256/cat-grumpy-icon.png',
                                    'stripe_payments',
                                    'An In-App payment was charged in Stripe greater than $' + (Math.abs(thresholdForAlert) / 100),
                                    [{
                                        "text": "Charge Details:",
                                        "color": "#FFA500",
                                        "fields": [
                                            {
                                                "title": "Amount",
                                                "value": "$" + (Math.abs(reqBody.data.object.amount) / 100),
                                                "short": true
                                            },
                                            {
                                                "title": "Repair ID",
                                                "value": reqBody.data.object.metadata.repair_id,
                                                "short": true
                                            },
                                            {
                                                "title": "Date Charged",
                                                "value": formattedCreatedDate,
                                                "short": true
                                            },
                                            {
                                                "title": "Link to charge",
                                                "value": 'https://dashboard.stripe.com/payments/' + reqBody.data.object.id,
                                                "short": true
                                            }
                                        ]
                                    }]
                                );

                                //Send to Slack, no response or validation needed
                                chargeAlert.sendToSlack(chargeAlert.options)
                            }


                            if (reqBody.data.object.metadata.repair_id != null) {
                                controllerType = 'stripe.repair';
                            }
                        } catch(err){
                            console.log(err)
                        }
                        break;
                    case 'charge.refunded':
                        try {
                            if (reqBody.data.object.metadata.repair_id != null) {
                                controllerType = 'stripe.repair.refund';
                            }
                        } catch(err){
                            //Do nothing, keep default of undefined
                        }
                        break;
                    case 'charge.dispute.created':
                        controllerType = 'chargebackAlert';
                        break;
                    case 'charge.dispute.funds_withdrawn':
                        controllerType = 'chargeback';
                        break;
                    case 'charge.dispute.funds_reinstated':
                        controllerType = 'chargeback';
                        break;
                    //Only Bank transfers produce this event
                    case 'transfer.paid':
                        controllerType = 'bankTransfer';
                        break;
                    case 'transfer.created':

                        //When we pay the tech more than amount collected from customer, we generate a stand alone
                        // transfer.  These transfers always have "Repair" in the description
                        try {
                            if (reqBody.data.object.description) {
                                if (reqBody.data.object.description.substring(0, 6) == 'Repair') {
                                    controllerType = 'repairTransfer';
                                }
                            }

                            if (
                                typeof reqBody.data.object.metadata.repair_id !== "undefined"
                            ) {
                                console.log('passed meta data check');
                                controllerType = 'repairTransfer';
                            }

                        } catch(err){
                            console.log('Error thrown when determining transfer.created type: ', err)
                        }
                        break;
                }

                break;
            case 'shopify':

                break;
        }
        return controllerType;
    }

    getControllerType() {
            return this.controllerType;
    }

    getEventDetails() {
        return this.req.body.data.object;
    }

    getRouteParameters() {
        return this.req.params;
    }
}

module.exports = {
    RequestEvent: RequestEvent
};