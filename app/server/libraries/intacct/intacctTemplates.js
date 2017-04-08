

//Variables holding XML templates.  The Controller XMLBuilder function will use these to create the complete XML template
//Format: IntacctHeader + IntacctBody (Built using function) + IntacctFooter

exports.IntacctControl =
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<request>' +
    '<control>' +
    '<senderid>iCracked</senderid>' +
    '<password>SenderPassVar</password>' +
    '<controlid>foobar</controlid>' +
    '<uniqueid>false</uniqueid>' +
    '<dtdversion>2.1</dtdversion>' +
    '</control>';

exports.IntacctHeader =
    '<operation>' +
    '<authentication>' +
    '<login>' +
    '<userid>xml_gateway</userid>' +
    '<companyid>CompanyVar</companyid>' +
    '<password>LoginPassVar</password>' +
    '<locationid>LocationVar</locationid>' +
    '</login>' +
    '</authentication>' +
    '<content>' +
    '<function controlid="XML-API-Test22">' +
    '<create_gltransaction>' +
    '<journalid>JournalVar</journalid>' +
    '<datecreated>' +
    '<year>YearVar</year>' +
    '<month>MonthVar</month>' +
    '<day>DayVar</day>' +
    '</datecreated>' +
    '<description>DescriptionVar</description>' +
    '<referenceno>ReferenceVar</referenceno>' +
    '<sourceentity></sourceentity>' +
    '<customfields></customfields>' +
    '<gltransactionentries>';

exports.EntryLine =
    '<glentry>' +
    '<trtype>TypeVar</trtype>' +
    '<amount>AmountVar</amount>' +
    '<glaccountno>GLVar</glaccountno>' +
    '<document>DocVar</document>' +
    '<datecreated>' +
    '<year></year>' +
    '<month></month>' +
    '<day></day>' +
    '</datecreated>' +
    '<memo>MemoVar</memo>' +
    '<locationid></locationid>' +
    '<departmentid>DepartmentVar</departmentid>' +
    '<classid>ChannelVar</classid>' +
    '<customerid>CustomerVar</customerid>' +
    '<vendorid>VendorVar</vendorid>' +
    '<employeeid>EmployeeVar</employeeid>' +
    '<projectid>ProjectVar</projectid>' +
    '<itemid>ItemVar</itemid>' +
    '</glentry>';

exports.IntacctFooter =
    '</gltransactionentries>' +
    '</create_gltransaction>' +
    '</function>' +
    '</content>' +
    '</operation>' +
    '</request>';



exports.SOHeader =
    '<operation>' +
    '<authentication>' +
    '<login>' +
    '<userid>xml_gateway</userid>' +
    '<companyid>CompanyVar</companyid>' +
    '<password>LoginPassVar</password>' +
    '<locationid>LocationVar</locationid>' +
    '</login>' +
    '</authentication>' +
    '<content>' +
    '<function controlid="XML-API-Test22">' +
    '<create_sotransaction>' +
    '<transactiontype>TypeVar</transactiontype>' +
    '<datecreated>' +
    '<year>YearVar</year>' +
    '<month>MonthVar</month>' +
    '<day>DayVar</day>' +
    '</datecreated>' +
    '<dateposted>' +
    '<year>YearVar</year>' +
    '<month>MonthVar</month>' +
    '<day>DayVar</day>' +
    '</dateposted>' +
    '<createdfrom></createdfrom>' +
    '<customerid>CustomerVar</customerid>' +
    '<documentno>DocumentVar</documentno>' +
    '<origdocdate>' +
    '<year></year>' +
    '<month></month>' +
    '<day></day>' +
    '</origdocdate>' +
    '<referenceno>ReferenceVar</referenceno>' +
    '<termname></termname>' +
    '<datedue>' +
    '<year>YearVar</year>' +
    '<month>MonthVar</month>' +
    '<day>DayVar</day>' +
    '</datedue>' +
    '<message></message>' +
    '<shippingmethod></shippingmethod>' +
    '<supdocid></supdocid>' +
    '<externalid></externalid>' +
    '<basecurr>USD</basecurr>' +
    '<currency>USD</currency>' +
    '<exchratedate>' +
    '<year></year>' +
    '<month></month>' +
    '<day></day>' +
    '</exchratedate>' +
    '<exchratetype>Intacct Daily Rate</exchratetype>' +
    '<customfields></customfields>' +
    '<state></state>' +
    '<projectid></projectid>' +
    '<sotransitems>';

//Need to add doc number and test
exports.SOLine =
    '<sotransitem>' +
    '<itemid>ItemIdVar</itemid>' +
    '<itemdesc>ItemDescVar</itemdesc>' +
    '<warehouseid>WarehouseIdVar</warehouseid>' +
    '<quantity>QuantityVar</quantity>' +
    '<unit>UnitVar</unit>' +
    '<price>PriceVar</price>' +
    '<discsurchargememo></discsurchargememo>' +
    '<locationid></locationid>' +
    '<departmentid>DepartmentVar</departmentid>' +
    '<memo></memo>' +
    '</sotransitem>';

exports.SOFooter =
    '</sotransitems>' +
    '</create_sotransaction>' +
    '</function>' +
    '</content>' +
    '</operation>' +
    '</request>';

exports.IntacctReadQuery =
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<request>' +
    '<control>' +
    '<senderid>iCracked</senderid>' +
    '<password>SenderPassVar</password>' +
    '<controlid>foobar</controlid>' +
    '<uniqueid>false</uniqueid>' +
    '<dtdversion>3.0</dtdversion>' +
    '</control>' +
    '<operation>' +
    '<authentication>' +
    '<login>' +
    '<userid>xml_gateway</userid>' +
    '<companyid>CompanyVar</companyid>' +
    '<password>LoginPassVar</password>' +
    '<locationid>LocationVar</locationid>' +
    '</login>' +
    '</authentication>' +
    '<content>' +
    '<function controlid="XML-API-Test22">' +
    '<readByQuery>' +
    '<object>ObjectVar</object>' +
    '<query>QueryVar</query>' +
    '<fields>ReturnFieldsVar</fields>' +
    '<returnFormat>xml</returnFormat>' +
    '</readByQuery>' +
    '</function>' +
    '</content>' +
    '</operation>' +
    '</request>';