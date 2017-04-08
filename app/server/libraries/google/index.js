'use strict';

// ---Modules---
var request = require('request');


exports.getZip = (lat, lon) => {
	return new Promise((resolve, reject) => {

		//Set request options
		var options = {
			url:     'https://maps.googleapis.com/maps/api/geocode/json?latlng=' + lat + ',' + lon + '&key=' + process.env.GOOGLEMAPSKEY,
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
				resolve({object: 'address', zip: 'N/A'})
			} else {

				//  Filter Results to find the address_component for postal code
				var PostalCodePosition = address.results[0].address_components.filter(PostalCodePosition => {
					return PostalCodePosition.types[0] == "postal_code"
				});

				//Using PostalCode's position (found above), resolve its value.  Prioritize "long name", then
				// "short name" then default
				resolve(
					{object: 'address', zip: PostalCodePosition[0].long_name}
					||
					{object: 'address', zip: PostalCodePosition[0].short_name}
					||
					{object: 'address', zip: 'N/A'}
				);
			}
		});
	});
};


















