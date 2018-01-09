'use strict';

const rp = require('request-promise-native');
var _ = require('lodash');

exports.AllLocations = (bot_id, type_location) => locations({ bot_id: bot_id, type_location: type_location });

exports.NearLocations = (bot_id, type_location, latitude, longitude, distance = 5000) =>
	locations({ bot_id: bot_id, type_location: type_location, latitude: latitude, longitude: longitude, distance: distance }, 'near');

exports.SearchLocations = (bot_id, type_location, q) => locations({ bot_id: bot_id, type_location: type_location, q: q }, 'search');

function locations({bot_id, type_location}) {
	const args = Array.from(arguments);
	const optionPart = args.shift() || {};
	const resource = args.shift() || '';
	const uri = `${process.env.LOC_HOST}${resource.startsWith('/') ? resource : `/${resource}`}`;
	const options = _.merge(
		{
			headers: { 'Accept': 'application/json', 'Accept-Charset': 'utf-8' },
			qs: { bot: bot_id, type: type_location }
		},
		{
			qs: optionPart
		});

	return rp.get(uri, options)
		.then(data => JSON.parse(data))
		.catch(error => console.error(error));
}
