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
       this.businessObject = this.determineBusinessObject(this.req.params.source, this.req.body);
    }

    determineBusinessObject(source, reqBody) {

        //Default value: not supported.  Overwrite businessType if supported
        var businessType = undefined;

        switch(source) {
            case 'stripe':
                switch(reqBody.type) {
                    case 'charge.succeeded':

                        try {
                            if (reqBody.data.object.metadata.repair_id != null) {
                                businessType = 'repair';
                            }
                        } catch(err){
                            //Do nothing, keep default of undefined
                        }
                        break;
                    case 'charge.refunded':

                        try {
                            if (reqBody.data.object.metadata.repair_id != null) {
                                businessType = 'repair';
                            }
                        } catch(err){
                            //Do nothing, keep default of undefined
                        }

                        break;
                    case 'charge.dispute.created':

                        break;
                    case 'charge.dispute.funds_withdrawn':

                        break;
                    case 'charge.dispute.funds_reinstated':

                        break;
                    //Only Bank transfers produce this event
                    case 'transfer.paid':
                        businessType = 'bankTransfer';

                        break;
                    case 'transfer.created':

                        //When we pay the tech more than amount collected from customer, we generate a stand alone
                        // transfer.  These transfers always have "Repair" in the description
                        if (reqBody.data.object.description.substring(0, 6) == 'Repair') {
                            businessType = 'repairTransfer';
                        }

                        break;
                }

                break;
            case 'shopify':

                break;
        }
        return businessType;
    }

    getBusinessObject() {
            return this.businessObject;
    }

    getEventDetails() {
        return this.req.body.data.object;
    }
}

module.exports = {
    RequestEvent: RequestEvent
};