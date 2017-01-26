'use strict';

var request = require('request');

var intacctTools = require('../libraries/intacct-tools/index');
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

        //Use logic to determine repair type, this will be used
        this.setRepairType(this.props);
    }

    // Different repair types have different sets of logic required to gather all relevant properties required to
    // create an accounting entry
    prepareEntry() {

        return new Promise((resolve, reject) => {

            var setZipPromise = this.setZip(this.props.latitude, this.props.longitude);

            // Promises that gather needed properties
            var setProcessingFeePromise, setPayoutDetailsPromise, setTaxDetailsPromise;

            if (this.props.isRefund) {

                setProcessingFeePromise = this.setProcessingFeeDetails(this.props.refundDetails.txnID, 'stripe');

                switch (this.props.repairType) {

                    case '0':

                        //Depending on source, reach out to that source to set payout related properties
                        setPayoutDetailsPromise = this.setPayoutDetails(this.props.transferID, 'stripe');

                        //Stripe metadata does have tax amount.  However, this does not always match actual amount charged
                        setTaxDetailsPromise = this.setTaxDetails(this.props.taxCollectionID, 'stripe');
                        break;
                    case '1':

                        //Depending on source, reach out to that source to set payout related properties
                        setPayoutDetailsPromise = this.setPayoutDetails(this.props.transferID, 'stripe');
                        break;
                }

            } else {
                setProcessingFeePromise = this.setProcessingFeeDetails(this.props.txnID, 'stripe');

                switch (this.props.repairType) {

                    case '0':

                        //Depending on source, reach out to that source to set payout related properties
                        setPayoutDetailsPromise = this.setPayoutDetails(this.props.transferID, 'stripe');

                        //Stripe metadata does have tax amount.  However, this does not always match actual amount charged
                        setTaxDetailsPromise = this.setTaxDetails(this.props.taxCollectionID, 'stripe');

                        break;
                    case '1':

                        //Depending on source, reach out to that source to set payout related properties
                        setPayoutDetailsPromise = this.setPayoutDetails(this.props.transferID, 'stripe');

                        break;
                }
            }

            //Wait for all promises to resolve. These promises set values, so we do not need to take action from results
            Promise.all([setZipPromise, setProcessingFeePromise, setPayoutDetailsPromise, setTaxDetailsPromise])
                .then( ()=> {
                    resolve();
                })
                .catch( err =>{
                    reject('Error during prepareEntry(), failed to resolve Promise.all. Err message: ' + err);

                })
        });
    }

    setRepairType(toCheck) {
        this.props.repairType = this.determineRepairType(toCheck);
    }

    determineRepairType(toCheck){

        //TODO: I may want to define these IDs in a config JSON file to allow easy changing later
        var repairType = '0';
        //Repairs w/ transfer & without application fee = repair w/ no sales tax charged
        // (Application fee), paid out in cash (Stripe transfer)
        if (toCheck.transferID && toCheck.taxCollectionID == null) {
            repairType = '1';

            //Repairs w/ no transfer = repair paid out in iCredit (Separate transaction)
        } else if (!toCheck.transferID) {
            repairType = '2';
        }
        return repairType;
    }

    setProcessingFeeDetails(id, source) {
        return new Promise((resolve, reject) => {
            this.determineProcessingFeeDetails(id, source)
                .then((processingFeeDetails)=> {

                    this.props.processingFeeAmount = this.convertToDollar(processingFeeDetails.fee);

                    resolve();

                })
        })
    }

    determineProcessingFeeDetails(id, source){
        return new Promise((resolve, reject) => {
            switch (source) {
                case 'stripe':
                    stripeOperating.balance.retrieveTransaction(
                        id,
                        //this.props.txnID,
                        function (err, details) {
                            if (err){
                                reject(err)
                            } else {
                                resolve(details)
                            }
                        });
                    break;

                default:
                    resolve('default');
            }
        })
    }

    setPayoutDetails(id, source) {
        return new Promise((resolve, reject) => {
            this.determinePayoutDetails(id, source)
                .then((txnDetails)=> {
                    this.props.payoutAmount = this.convertToDollar(txnDetails.amount);
                    this.props.payoutID = txnDetails.balance_transaction;
                    resolve();
                })
        })
    }

    determinePayoutDetails(id, source){
        return new Promise((resolve, reject) => {
            switch (source) {
                case 'stripe':
                    stripeOperating.transfers.retrieve(
                        id,
                        //this.props.txnID,
                        function (err, details) {
                            if (err){
                                reject(err)
                            } else {
                                resolve(details)
                            }
                        });

                    break;

                default:
                    resolve('default');
            }
        })
    }

    setTaxDetails(id, source) {
        return new Promise((resolve, reject) => {
            this.determineTaxDetails(id, source)
                .then((taxDetails)=> {
                    this.props.taxAmount = this.convertToDollar(taxDetails.amount);
                    this.props.taxID = taxDetails.balance_transaction;
                    resolve()
                })
        })
    }

    determineTaxDetails(id, source){
        return new Promise((resolve, reject) => {
            switch (source) {
                case 'stripe':
                    stripeOperating.applicationFees.retrieve(
                        id,
                        //this.props.txnID,
                        function (err, details) {
                            if (err){
                                reject(err)
                            } else {
                                resolve(details)
                            }
                        });
                    break;
                default:
                    resolve('default');
            }
        })
    }

    createAccountingEntry(){
        return new Promise((resolve, reject) => {

            //Validate that isRefund flag is set and determine collection/refund
            //collection/refund will determine setting in businessObjects
            //set variables that depend on collection/refund

            var year, month, day, direction, memo, chargeNetOfTax;

            if (this.props.isRefund) {
                direction = 'refund';

                console.log('RefundDetails: ', this.props.refundDetails);

                year = this.props.refundDetails.date.getFullYear();
                //.getMonth() returns 0-11, so add 1
                month = this.props.refundDetails.date.getMonth() + 1;
                day = this.props.refundDetails.date.getDate();

                memo = 'REFUND: Repair: App Sale | Repair ID: ' + this.props.repairID + ' | Zip' +
                    ' Code: ' + this.props.zip;

                chargeNetOfTax = (this.convertToDollar(this.props.refundDetails.amount) - this.props.processingFeeAmount).toFixed(2);

            } else {
                direction = 'collection';

                year = this.props.date.getFullYear();
                //.getMonth() returns 0-11, so add 1
                month = this.props.date.getMonth() + 1;
                day = this.props.date.getDate();

                memo = 'Repair: App Sale | Repair ID: ' + this.props.repairID + ' | Zip' +
                    ' Code: ' + this.props.zip;

                chargeNetOfTax = (this.convertToDollar(this.props.chargeAmount) - this.props.processingFeeAmount).toFixed(2);

            }

            //Declare a new glEntry object
            var entry = new intacctTools.GlEntry();

            //Set the entry header
            //journal, memo, year, month, day, reference
            entry.setHeader(boSettings.account.operating.journal, memo, year, month, day, this.props.chargeID);


            var netTransferAmount = (this.convertToDollar(this.props.chargeAmount) - this.props.tax).toFixed(2);

            //Default amount charged to technician = $0
            var techFee = 0;
            var labor = 0;

            //taxAmount = amount withheld from payout, tax equals amount as a property
            //Any amount withheld greater than tax amount is amount charged to technician
            techFee = (this.props.taxAmount - this.props.tax).toFixed(2);

            //If payoutAmount is $0, part & labor should be $0 (and will not be added to transaction)
            if (this.props.payoutAmount > 0) {
                labor = 40;
                var part = (netTransferAmount - labor).toFixed(2);
            } else {
                var part = 0;
            }

            //TODO: remove hard coding of accounts (move to BOsettings)
            if (chargeNetOfTax > 0) {
                entry.addLine(boSettings.objects.repair[direction].entryDirection.chargeCash, boSettings.account.operating.accountGL, '', chargeNetOfTax, '', '', memo, '', '', '', '', '');
            }
            if (this.props.taxAmount > 0) {
                entry.addLine(boSettings.objects.repair[direction].entryDirection.feeCash, boSettings.account.operating.accountGL, '', this.props.taxAmount, '', '', memo, '', '', '', '', '');
            }
            if (this.props.payoutAmount > 0) {
                entry.addLine(boSettings.objects.repair[direction].entryDirection.transferCash, boSettings.account.operating.accountGL, '', this.props.payoutAmount, '', '', memo, '', '', '', '', '');
            }
            if (this.props.tax > 0) {
                entry.addLine(boSettings.objects.repair[direction].entryDirection.tax, boSettings.account.operating.taxGL, '', this.props.tax, '', '', memo, '', '', '', '', '');
            }
            if (netTransferAmount > 0) {
                entry.addLine(boSettings.objects.repair[direction].entryDirection.sale, boSettings.objects.repair[direction].accounts.sale, '', netTransferAmount, '', boSettings.objects.repair.channel, memo, '', '', '', '', '');
            }
            if (part > 0) {
                entry.addLine(boSettings.objects.repair[direction].entryDirection.part, boSettings.objects.repair[direction].accounts.part, '', part, '', boSettings.objects.repair.channel, memo, '', '', '', '', '');
            }
            if (labor > 0) {
                entry.addLine(boSettings.objects.repair[direction].entryDirection.labor, boSettings.objects.repair[direction].accounts.labor, '', labor, '', boSettings.objects.repair.channel, memo, '', '', '', '', '');
            }
            if (this.props.processingFeeAmount > 0) {
                //TODO: account is currently hard coded as "operating".  I should be able to read the event object here
                entry.addLine(boSettings.objects.repair[direction].entryDirection.feeIncurred, boSettings.account.operating.processorFeeGL, '', this.props.processingFeeAmount, '', boSettings.objects.repair.channel, memo, boSettings.account.operating.processorVend, '', '', '', '');
            }
            if (techFee > 0) {
                entry.addLine(boSettings.objects.repair[direction].entryDirection.feeCharged, boSettings.account.operating.processorFeeGL, '', techFee, '', boSettings.objects.repair.channel, memo, '', '', '', '', '');
            }

            //Convert to XML
            var convertedEntry = entry.convertToIntacctXML();

            console.log('Accounting entry: ', convertedEntry);

            entry.sendRequest(convertedEntry)
                .then( resObj => {
                    resolve(resObj);
                })
                .catch(rejObj => {
                    console.log('Caught rejection from entry.sendRequest: ', rejObj);
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

    //Determine if source is supported

    //Validate transaction by reaching out to that source

    createAccountingEntry(){
        return new Promise((resolve, reject) => {

            //TODO need to make sure this.props.subSource is valid before trying to use

            var entry = new intacctTools.GlEntry();

            //Entry Specfic variables:
            var year = this.props.date.getFullYear();
            //.getMonth() returns 0-11, so add 1
            var month = this.props.date.getMonth() + 1;
            var day = this.props.date.getDate();

            var amount = this.convertToDollar(this.props.amount);
            var debitGL, creditGL, transferDirection;

            //Determine if the transfer is stripe --> bank or bank --> stripe, this changes account to debit &
            // credit
            if (amount < 0) {
                amount = -amount;
                transferDirection = "toPlatform"
            } else {
                transferDirection = "toBank"
            }

            var memo = "Stripe bank transfer | Stripe Account: " + this.props.subSource + " | Stripe" +
                " Description: " + this.props.description;

            entry.setHeader(boSettings.account.operating.journal, memo, year, month, day, this.props.transferID);

            //Bank
            entry.addLine(boSettings.objects.bankTransfer[transferDirection].entryDirection.bank, boSettings.account[this.props.subSource].bankGL, this.props.txnID, amount, '', '', memo, '', '', '', '', '');

            //Platform
            entry.addLine(boSettings.objects.bankTransfer[transferDirection].entryDirection.platform, boSettings.account[this.props.subSource].accountGL, this.props.txnID, amount, '', '', memo, '', '', '', '', '');


            var convertedEntry = entry.convertToIntacctXML();

            console.log('Create transfer entry: ', convertedEntry);

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

            var amount = this.convertToDollar(this.props.amount).toFixed(2);
            var laborCost = Number(boSettings.objects.repair.laborCost).toFixed(2);
            var partCost = (amount - laborCost).toFixed(2);

            //Check to see if calculated partCost is negative.
            if (partCost < 0) {
                laborCost = 0;
                partCost = amount;
            }

            var memo = "Repair: discounted, Payout: Stripe Transfer | Stripe Account: " + this.props.subSource +
            " | Stripe Description:  " + this.props.description;

            entry.setHeader(boSettings.account.operating.journal, memo, year, month, day, this.props.transferID);

            if (amount > 0) {
                entry.addLine(boSettings.objects.discountedRepairTransfer.collection.entryDirection.part, boSettings.objects.discountedRepairTransfer.collection.accounts.part, this.props.txnID, partCost, '', boSettings.objects.discountedRepairTransfer.channel, memo, '', '', '', '', '');
            }
            if (amount > 0) {
                entry.addLine(boSettings.objects.discountedRepairTransfer.collection.entryDirection.labor, boSettings.objects.discountedRepairTransfer.collection.accounts.labor, this.props.txnID, laborCost, '', boSettings.objects.discountedRepairTransfer.channel, memo, '', '', '', '', '');
            }
            if (amount > 0) {
                entry.addLine(boSettings.objects.discountedRepairTransfer.collection.entryDirection.cash, boSettings.account[this.props.subSource].bankGL, this.props.txnID, amount, '', '', memo, '', '', '', '', '');
            }

            var convertedEntry = entry.convertToIntacctXML();

            console.log('Create transfer entry: ', convertedEntry);

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

module.exports = {
    BusinessObject: BusinessObject,
    Repair: Repair,
    BankTransfer: BankTransfer,
    DiscountedRepairTransfer: DiscountedRepairTransfer
};