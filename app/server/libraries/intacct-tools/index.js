"use strict";

// ---Modules---
var request = require('request');
var parseString = require('xml2js').parseString;

var intacctTemplates = require('./intacctTemplates');
var intacctAPI = 'https://api.intacct.com/ia/xml/xmlgw.phtml';

class IntacctRequest {
    constructor() {}

    sendRequest(intacctRequest){

        //TODO: Add validation
        return new Promise((resolve, reject) => {

            //TODO: remove hard coding
            var options = {
                url: intacctAPI,
                headers: {
                    'Content-Type': 'x-intacct-xml-request'
                },
                body: intacctRequest
            };

            request.post(options, (err, res, body) => {

                if (err) {
                    reject('Error during call to Intacct: ' + err);
                } else {
                    // Read formatted response header, only convert to JSON if text/xml
                    if ( res.headers['content-type'].split("; ")[0] === 'text/xml') {
                        this.convertResponseJSON(body)
                            .then(convertedBody => {
                                //1. check for authentication success
                                switch (convertedBody.response.operation[0].authentication[0].status[0]) {
                                    case 'failure':
                                        reject('Failure to authenticate to Intacct');
                                        break;
                                    case 'success':
                                        //2. check result status
                                        switch (convertedBody.response.operation[0].result[0].status[0]) {
                                            case 'failure':
                                                reject('Failed:' +
                                                    ' ' + convertedBody.response.operation[0].result[0].errormessage[0].error[0] );
                                                break;
                                            case 'success':
                                                resolve('Successfully posted to intacct');
                                                break;
                                        }
                                        break;
                                }
                            });
                    } else {
                        console.log('content type not xml:', res.headers['content-type'] )
                    }
                }
            })
        })
    }

    convertResponseJSON(xml){
        return new Promise((resolve, reject) => {
            parseString(xml, (err, result) => {
                if (err) {
                    throw new Error('Error when parsing XML.  Error: ', err);
                } else {
                    resolve(result)
                }
            });
        });
    }


}

class GlEntry extends IntacctRequest {
    constructor(){
        super();

        this.entryHeader = '';
        this.entryBody = {};

        //Hold the entry string built so far
        this.entryString = '';

        //Running Balances, updated when GL line is added
        this.debitBalance = 0;
        this.creditBalance = 0;

        //Keep track of the number of lines in the entry string
        this.lineCount = 0;

    }

    //Add header line to the entryString
    //TODO: remove hard coding
    setHeader(journal, memo, year, month, day, reference) {

        this.entryHeader = {
            SenderPassVar: process.env.SENDERPASS,
            JournalVar: journal,
            LoginPassVar: process.env.INTACCTPASS,
            CompanyVar: process.env.INTACCT_ENV,
            LocationVar: '100',
            DescriptionVar: memo,
            YearVar: year,
            MonthVar: month,
            DayVar: day,
            ReferenceVar: reference
        };
    };

    //Add an entry line to the entryString property
    //Arguments: debit/credit, amount, ect.
    addLine(type, acct, doc, amt, dept, channel, memo, vend, cust, emp, prj, item) {

        //---Parameter Validation---

        //TODO: determine if localAmt validation is necessary
        let localAmt;
        //Test amt, should be a Decimal class object, or number
        try {
            //localAmt = amt.toNumber()
            localAmt = amt
        } catch(err){
            //Value is not a Decimal object, try traditional number checks
            if (!isNaN(parseFloat(amt)) && isFinite(amt)) {
                throw ('Error: method - .addLine. Argument ' + amt + ' is not a number');
            } else {
                localAmt = amt;
            }
        }

        //Add to running balance & validate
        //NOTE: I need to make this support both numbers and decimal objects
        if (type === 'debit') {
            this.debitBalance = this.debitBalance + localAmt;
        } else if (type === 'credit') {
            this.creditBalance = this.creditBalance + localAmt;
        } else {
            throw ('Error: method - .addLine. Argument ' + type + ' must be word "debit" or "credit"');
        }

        this.lineCount++;

        let entryLine = {

            'lineNum': this.lineCount,
            ['TypeVar' + this.lineCount]: type,
            ['GLVar' + this.lineCount]: acct,
            ['DocVar' + this.lineCount]: doc,
            ['AmountVar' + this.lineCount]: amt,
            ['DepartmentVar' + this.lineCount]: dept,
            ['ChannelVar' + this.lineCount]: channel,
            ['MemoVar' + this.lineCount]: memo,
            ['VendorVar' + this.lineCount]: vend,
            ['YearVar' + this.lineCount]: "",
            ['MonthVar' + this.lineCount]: "",
            ['DayVar' + this.lineCount]: "",
            ['CustomerVar' + this.lineCount]: cust,
            ['EmployeeVar' + this.lineCount]: emp,
            ['ProjectVar' + this.lineCount]: prj,
            ['ItemVar' + this.lineCount]: item
        };

        //Add the new line properties into the running entryBody property
        this.entryBody = Object.assign(this.entryBody, entryLine);
    };


    //TODO: add remove line functionality
    removeLine(){}

    //Method to convert entryString to XML (Returns XML string)
    convertToIntacctXML() {

        console.log('Attempting to convert to XML');

        //Replace function to be used to swap object properties into XML template
        var replaceAll = (replaceThisXML, replaceWithObj) => {

            Object.keys(replaceWithObj).forEach(key => {

                replaceThisXML = replaceThisXML.replace(new RegExp(key, 'g'), replaceWithObj[key]);
            });

            return replaceThisXML;
        };

        //-------Entry Header-------
        //Includes control portion of header

        let convertedHeader = (() => {

            return replaceAll(intacctTemplates.IntacctControl + intacctTemplates.IntacctHeader, this.entryHeader);
        })();

        //--------Entry Body--------

        let convertedBody = (() => {

            //Create XML template for entry body line items
            let bodyTemplate = '';

            //Build an XML body template with # of entry lines = entry object
            for (let line = 1; line <= this.lineCount; line++){

                bodyTemplate = bodyTemplate +
                    '<glentry>' +
                    '<trtype>TypeVar' + line + '</trtype>' +
                    '<amount>AmountVar' + line + '</amount>' +
                    '<glaccountno>GLVar' + line + '</glaccountno>' +
                    '<document>DocVar' + line + '</document>' +
                    '<datecreated>' +
                    '<year></year>' +
                    '<month></month>' +
                    '<day></day>' +
                    '</datecreated>' +
                    '<memo>MemoVar' + line + '</memo>' +
                    '<locationid></locationid>' +
                    '<departmentid>DepartmentVar' + line + '</departmentid>' +
                    '<customerid>CustomerVar' + line + '</customerid>' +
                    '<vendorid>VendorVar' + line + '</vendorid>' +
                    '<employeeid>EmployeeVar' + line + '</employeeid>' +
                    '<projectid>ProjectVar' + line + '</projectid>' +
                    '<itemid>ItemVar' + line + '</itemid>' +
                    '<classid>ChannelVar' + line + '</classid>' +
                    '</glentry>';
            }

            return replaceAll(bodyTemplate, this.entryBody);
        })();

        //--------Entry Footer--------

        let convertedFooter = (() => {

            return intacctTemplates.IntacctFooter;
        })();

        //Concatenate Entry pieces & return
        return convertedHeader + convertedBody + convertedFooter;
    };
}


module.exports = {
    GlEntry: GlEntry
};

