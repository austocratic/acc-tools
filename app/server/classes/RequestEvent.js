'use strict';



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
                            if (reqBody.data.object.metadata.repair_id != null) {
                                controllerType = 'stripe.repair';
                            }
                        } catch(err){
                            //Do nothing, keep default of undefined
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
                            if (reqBody.data.object.description.substring(0, 6) == 'Repair') {
                                controllerType = 'repairTransfer';
                            }
                        } catch(err){
                            //Do nothing, leave default businessType undefined
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