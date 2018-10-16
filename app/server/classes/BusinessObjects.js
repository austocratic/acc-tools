'use strict';

var request = require('request');

var intacctTools = require('../libraries/intacct/index');
var slack = require('../libraries/slack/index');
var boSettings = require('./businessObjectsSettings');

var stripeOperating = require("stripe")(
    process.env.STRIPEKEYOPERATING
);

class BusinessObject {
    constructor() {}

    convertToDollar(amount) {
        return (Math.abs(amount) / 100);
    }

    setZip(lat, lon) {

        return new Promise((resolve, reject) => {

            this.determineZip(lat, lon)
                .then(res => {
                    this.props.zip = res;

                    resolve();
                })
            .catch(rej => {
                reject(rej)
            })
        })
    }

    determineZip(lat, lon) {
        return new Promise( (resolve, reject) => {

            //Set request options
            var options = {
                url: 'https://maps.googleapis.com/maps/api/geocode/json?latlng=' + lat + ',' + lon + '&key=' + process.env.GOOGLEMAPSKEY,
                headers: {
                    'Content-Type': 'application/json'
                }
            };

            request(options, function (error, response, body) {

                    //Replace results that are not JSON friendly
                    var address = body.replace(/[\n\t\r]/g, "");
                    address = address.replace(/[ ]/g, "");

                    //Parse JSON friendly results
                    address = JSON.parse(address);

                    //Check for zero results from Google
                    if (address.status == 'ZERO_RESULTS') {
                        resolve('N/A')
                    } else {

                        //  Filter Results to find the address_component for postal code
                        var PostalCodePosition = address.results[0].address_components.filter(PostalCodePosition => {
                            return PostalCodePosition.types[0] == "postal_code"
                        });

                        //Using PostalCode's position (found above), resolve its value.  Prioritize "long name", then
                        // "short name" then default
                        resolve(PostalCodePosition[0].long_name || PostalCodePosition[0].short_name || 'N/A');
                    }
                });
            });
    }
}

class Repair extends BusinessObject {
    constructor(props) {
        super();

        this.props = props;
    }

    createAccountingEntry(){
        return new Promise((resolve, reject) => {

            var year, month, day, chargeNetOfFee, chargeTxnID, appFeeTxnID, transferTxnID, repairID, amountHeld, amountPaid, amountTax, amountTip;

            year = this.props.date.getFullYear();
            //.getMonth() returns 0-11, so add 1
            month = this.props.date.getMonth() + 1;
            day = this.props.date.getDate();

            chargeNetOfFee = +(this.props.chargeAmount - this.props.processingFeeAmount).toFixed(2);

            //TODO replace entry lines with .props references this is extra
            chargeTxnID = this.props.txnID;
            appFeeTxnID = this.props.taxTxnID;
            transferTxnID = this.props.payoutTxnID;
            repairID = this.props.repairID;

            amountHeld = +this.props.amountHeld;
            amountPaid = +this.props.payoutAmount;
            amountTax = +this.props.tax;
            amountTip = +this.props.tip;
            amountTip = amountTip.toFixed(2);

            //Declare a new glEntry object
            var entry = new intacctTools.GlEntry();

            //Set the entry header
            //journal, memo, year, month, day, reference
            entry.setHeader(boSettings.account.operating.journal, this.props.memo, year, month, day, this.props.chargeID);

            var netOfTaxAmount = (this.props.chargeAmount - this.props.tax - amountTip).toFixed(2);

            console.log('Testing, netOfTaxAmount: ', netOfTaxAmount);

            var netPaid = (amountPaid - amountHeld).toFixed(2);

            //Default amount charged to technician = $0
            var techFee = +0;
            var labor = +0;
            var part = +0;

            //taxAmount = amount withheld from payout, tax equals amount as a property
            //Any amount withheld greater than tax amount is amount charged to technician
            if ((this.props.amountHeld - this.props.tax).toFixed(2) > 0) {
                techFee = +(this.props.amountHeld - this.props.tax).toFixed(2)
            }

            //var netPaidWithFee = (amountPaid - amountHeld + Number(techFee)).toFixed(2);
            var netPaidWithFee = (amountPaid - amountHeld + techFee).toFixed(2);

            var amountTipPaid = 0;

            //Only set the tip payout amount if there was a transfer (a payout to the technician)
            if (netPaidWithFee > 0) {
                labor = Number(boSettings.objects.repair.laborCost);

                if (netPaidWithFee < labor) {
                    labor = 0;
                }
                //Part cost = Net paid less fixed labor component and tip (tip will be recorded on another line)
                part = (netPaidWithFee - labor - amountTip).toFixed(2);

                //New way to calculate part cost - this will allow us to key off of part
                //part = (netOfTaxAmount - labor).toFixed(2);

                //Tip paid does not necessarily = tip calculated and passed in charge object (usually due to rounding)
                //Calculate the tip
                amountTipPaid = amountTip;
                //amountTipPaid = amountPaid - labor - part - techFee <-- This way was causing issues
            }

            //addLine(type, acct, doc, amt, dept, channel, memo, vend, cust, emp, prj, item)
            //if (chargeNetOfTax > 0) {
            entry.addLine(boSettings.objects.repair[this.props.direction].entryDirection.chargeCash, boSettings.account.operating.accountGL, chargeTxnID, chargeNetOfFee, '', '', this.props.memo, '', '', '', '', '');
            //}
            if (netOfTaxAmount > 0) {
                entry.addLine(boSettings.objects.repair[this.props.direction].entryDirection.sale, boSettings.objects.repair[this.props.direction].accounts.sale, '', netOfTaxAmount, '', boSettings.objects.repair.channel, this.props.memo, '', '', '', '', '');
            }
            if (amountTax > 0) {
                entry.addLine(boSettings.objects.repair[this.props.direction].entryDirection.tax, boSettings.account.operating.taxGL, '', amountTax, '', '', this.props.memo, '', '', '', '', '');
            }
            if (amountTip > 0) {
                entry.addLine(boSettings.objects.repair[this.props.direction].entryDirection.tipCollected, boSettings.account.operating.tipGL, repairID, amountTip, '', '', this.props.memo, '', '', '', '', '');
            }
            if (this.props.processingFeeAmount > 0) {
                //TODO: account is currently hard coded as "operating".  I should be able to read the event object here
                entry.addLine(boSettings.objects.repair[this.props.direction].entryDirection.feeIncurred, boSettings.account.operating.processorFeeGL, '', this.props.processingFeeAmount, '', boSettings.objects.repair.channel, this.props.memo, boSettings.account.operating.processorVend, '', '', '', '');
            }
            if (amountPaid > 0) {
                entry.addLine(boSettings.objects.repair[this.props.direction].entryDirection.transferCash, boSettings.account.operating.accountGL, transferTxnID, amountPaid, '', '', this.props.memo, '', '', '', '', '');
            }
            if (amountHeld > 0) {
                entry.addLine(boSettings.objects.repair[this.props.direction].entryDirection.feeCash, boSettings.account.operating.accountGL, appFeeTxnID, amountHeld, '', '', this.props.memo, '', '', '', '', '');
            }
            if (part > 0) {
                entry.addLine(boSettings.objects.repair[this.props.direction].entryDirection.part, boSettings.objects.repair[this.props.direction].accounts.part, '', part, '', boSettings.objects.repair.channel, this.props.memo, '', '', '', '', '');
            }
            if (labor > 0) {
                entry.addLine(boSettings.objects.repair[this.props.direction].entryDirection.labor, boSettings.objects.repair[this.props.direction].accounts.labor, '', labor, '', boSettings.objects.repair.channel, this.props.memo, '', '', '', '', '');
            }
            if (amountTipPaid > 0) {
                entry.addLine(boSettings.objects.repair[this.props.direction].entryDirection.tipPaid, boSettings.account.operating.tipGL, '', amountTipPaid, '', '', this.props.memo, '', '', '', '', '');
            }
            if (techFee > 0) {
                entry.addLine(boSettings.objects.repair[this.props.direction].entryDirection.feeCharged, boSettings.account.operating.processorFeeGL, '', techFee, '', boSettings.objects.repair.channel, this.props.memo, boSettings.account.operating.processorVend, '', '', '', '');
            }

            //Convert to XML
            var convertedEntry = entry.convertToIntacctXML();
            
            console.log('Converted entry: ', convertedEntry);

            entry.sendRequest(convertedEntry)
                .then( resObj => {
                    resolve(resObj);
                })
                .catch(rejObj => {
                    console.log('Error returned from accounting system: ', JSON.stringify(rejObj));
                    reject(rejObj);
                })
        });
    }
}

class BankTransfer extends BusinessObject {
    constructor(props) {
        super();
        this.props = props;
    }

    createAccountingEntry(){
        return new Promise((resolve, reject) => {

            //TODO add property validation

            var entry = new intacctTools.GlEntry();

            //Entry Specfic variables:
            var year = this.props.date.getFullYear();
            //.getMonth() returns 0-11, so add 1
            var month = this.props.date.getMonth() + 1;
            var day = this.props.date.getDate();

            var amount = this.props.amount;
            var transferDirection = this.props.transferDirection;
            var debitGL, creditGL;
            
            entry.setHeader(boSettings.account[this.props.subSource].journal, this.props.memo, year, month, day, this.props.transferID);

            //Bank
            entry.addLine(boSettings.objects.bankTransfer[transferDirection].entryDirection.bank, boSettings.account[this.props.subSource].bankGL, this.props.txnID, amount, '', '', this.props.memo, '', '', '', '', '');

            //Platform
            entry.addLine(boSettings.objects.bankTransfer[transferDirection].entryDirection.platform, boSettings.account[this.props.subSource].accountGL, this.props.txnID, amount, '', '', this.props.memo, '', '', '', '', '');

            var convertedEntry = entry.convertToIntacctXML();

            entry.sendRequest(convertedEntry)
                .then( resObj => {
                    resolve(resObj);
                })
                .catch(rejObj => {
                    reject(rejObj);
                })
        })
    }
}

class DiscountedRepairTransfer extends BusinessObject {
    constructor(props) {
        super();

        this.props = props;
    }

    createAccountingEntry() {
        return new Promise((resolve, reject) => {

            var entry = new intacctTools.GlEntry();

            //Entry Specfic variables:
            var year = this.props.date.getFullYear();
            //.getMonth() returns 0-11, so add 1
            var month = this.props.date.getMonth() + 1;
            var day = this.props.date.getDate();

            //TODO: remove convertToDollar this needs to happen before declaring the BO
            var amount = this.convertToDollar(this.props.amount).toFixed(2);
            var laborCost = Number(boSettings.objects.repair.laborCost).toFixed(2);
            //var amountTip = this.props.tip;

            //var partCost = (amount - laborCost - amountTip).toFixed(2);
            var partCost = (amount - laborCost).toFixed(2);

            //Check to see if calculated partCost is negative.
            if (partCost < 0) {
                laborCost = 0;
                partCost = amount;
            }

            var memo = "Repair, Payout: Stripe Transfer | Stripe Account: " + this.props.subSource +
            " | Stripe Description:  " + this.props.description;

            entry.setHeader(boSettings.account.operating.journal, memo, year, month, day, this.props.transferID);

            if (amount > 0) {
                entry.addLine(boSettings.objects.discountedRepairTransfer.collection.entryDirection.cash, boSettings.account[this.props.subSource].accountGL, this.props.txnID, amount, '', '', memo, '', '', '', '', '');
            }
            if (amount > 0) {
                entry.addLine(boSettings.objects.discountedRepairTransfer.collection.entryDirection.part, boSettings.objects.discountedRepairTransfer.collection.accounts.part, '', partCost, '', boSettings.objects.discountedRepairTransfer.channel, memo, '', '', '', '', '');
            }
            if (amount > 0) {
                entry.addLine(boSettings.objects.discountedRepairTransfer.collection.entryDirection.labor, boSettings.objects.discountedRepairTransfer.collection.accounts.labor, '', laborCost, '', boSettings.objects.discountedRepairTransfer.channel, memo, '', '', '', '', '');
            }
            /*
            if (amountTip > 0) {
                entry.addLine(boSettings.objects.discountedRepairTransfer.collection.entryDirection.tipPaid, boSettings.account[this.props.subSource].tipGL, '', amountTip, '', boSettings.objects.discountedRepairTransfer.channel, memo, '', '', '', '', '');
            }*/
            
            var convertedEntry = entry.convertToIntacctXML();

            console.log('DiscountedRepairTransfer, convertedEntry: ', convertedEntry);
            
            entry.sendRequest(convertedEntry)
                .then( resObj => {
                    resolve(resObj);
                })
                .catch(rejObj => {
                    reject(rejObj);
                })
        });
    }
}

class Chargeback extends BusinessObject {
    constructor(props) {
        super();

        this.props = props;
    }

    createAccountingEntry(){
        return new Promise((resolve, reject) => {

            var entry = new intacctTools.GlEntry();

            var year = this.props.date.getFullYear();
            //.getMonth() returns 0-11, so add 1
            var month = this.props.date.getMonth() + 1;
            var day = this.props.date.getDate();

            var cashAmount = this.props.amount;
            var chargebackDirection;

            //Determine if the chargeback with withdrawing or returning funds
            if (cashAmount < 0) {
                cashAmount = -cashAmount;
                chargebackDirection = "withdrawal"
            } else {
                chargebackDirection = "reversal"
            }

            var grossAmount = (cashAmount - this.props.disputeFeeAmount).toFixed(2);

            entry.setHeader(boSettings.account[this.props.subSource].journal, this.props.memo, year, month, day, this.props.id);

            //Platform
            entry.addLine(boSettings.objects.chargeback[chargebackDirection].entryDirection.cash, boSettings.account[this.props.subSource].accountGL, this.props.txnID, cashAmount, '', '', this.props.memo, '', '', '', '', '');

            //Fee
            entry.addLine(boSettings.objects.chargeback[chargebackDirection].entryDirection.fee, boSettings.account[this.props.subSource].processorFeeGL, '', this.props.disputeFeeAmount, '', boSettings.account[this.props.subSource].chargebackChannel, this.props.memo, boSettings.account[this.props.subSource].processorVend, '', '', '', '');

            //Gross
            entry.addLine(boSettings.objects.chargeback[chargebackDirection].entryDirection.gross, boSettings.objects.chargeback[chargebackDirection].accounts.gross, '', grossAmount, '', boSettings.account[this.props.subSource].chargebackChannel, this.props.memo, '', '', '', '', '');

            var convertedEntry = entry.convertToIntacctXML();

            entry.sendRequest(convertedEntry)
                .then( resObj => {
                    resolve(resObj);
                })
                .catch(rejObj => {
                    reject(rejObj);
                })
        })
    }
}

class ChargebackAlert extends BusinessObject {
    constructor(
        amount,
        disputeID,
        dateCreated,
        dateDue,
        reason,
        chargeID,
        platformName,
        platformAccount
    ) {
        super();

        this.attachments = [{
            "text": "Dispute details:",
            "color": "#FFA500",
            "fields": [
                {
                    "title": "Amount",
                    "value": "$" + (amount),
                    "short": true
                },
                {
                    "title": "Stripe Dispute ID",
                    "value": disputeID,
                    "short": true
                },
                {
                    "title": "Date Created",
                    "value": dateCreated,
                    "short": true
                },
                {
                    "title": "Evidence Due Date",
                    "value": dateDue,
                    "short": true
                }
            ]
        }];

        this.text = '\n*Chargeback filed.*' +
            '\nPlatform: ' + platformName +
            '\nPlatform account: ' + platformAccount +
            '\nLink to disputed charge: https://dashboard.stripe.com/payments/' + chargeID +
            '\nDispute Reason: ' + reason;

        //Slack properties set in business objects settings file: businessObjectsSettings.json
        this.username = boSettings.objects.chargebackAlert.slackUserName;
        this.icon_url = boSettings.objects.chargebackAlert.slackIcon;
        this.channel = boSettings.objects.chargebackAlert.slackChannel;
    }

    slackAlert(){
        return new Promise((resolve, reject) => {

            var alert = new slack.Alert(
                this.username,
                this.icon_url,
                this.channel,
                this.text,
                this.attachments
            );

            alert.sendToSlack(alert.options)
                .then( resObj => {
                    resolve(resObj);
                })
                .catch(rejObj => {
                    reject(rejObj);
                })
        })
    }

 
}


module.exports = {
    BusinessObject: BusinessObject,
    Repair: Repair,
    BankTransfer: BankTransfer,
    DiscountedRepairTransfer: DiscountedRepairTransfer,
    Chargeback: Chargeback,
    ChargebackAlert: ChargebackAlert
};