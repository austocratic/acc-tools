## Overview

acc-tools is designed to capture and act on financial transactions.  Most commonly the action taken is to generate record a transaction in the accounting platform

## Transaction flow

Platform transactions are captured by acc-tools by two main controllers:

1. processEvent - triggered by incoming http requests sent to end points
2. processCron - cron that proactively polls platforms for transactions

After capturing transactions the system uses logic (based on properties of event) to determine which additional controller should process the request


## Sample Transaction

1. Stripe 'charge' event sent via POST to /api/stripe/operating.

2. processEvent - controller triggered by all POST requests to /api/stripe

3. new RequestEvent - declare a standard event object

4. RequestEvent.getControllerType - determine which controller to use

5. getControllerType return stripe.repair - controller has been determined

6. API requests to gather additional details about event

7. new BusinessObject.Repair - declare a repair business object (contains repair specific properties)

8. createAccountingEntry - creates entry object (accounting system specific object)

9. convertToIntacctXML - convert entry object into XML

10. sendRequest - send XML to accounting system and respond






