/* Copyright 2014 Tristian Flanagan
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
*/

'use strict';

/* Dependencies */
const QuickBase = require('../');
const common = require('./_common.js');

/* Expected Structures */
const expected = {
	action: 'API_ImportFromCSV',
	errcode: 0,
	errtext: 'No error',
	num_recs_input: 0,
	num_recs_added: 0,
	num_recs_updated: 0,
	num_recs_unchanged: 0
};

/* Main */
module.exports = function(pass, fail) {
	const qb = new QuickBase({
		realm: process.env.realm,
		appToken: process.env.appToken,
		ticket: process.env.ticket
	});

	return qb.api('API_ImportFromCSV', {
		dbid: process.env.dbid,
		clist: 3,
		records_csv: [ '' ]
	}).then((results) => {
		common.objStrctEqual(results, expected, 'Mismatched API_ImportFromCSV Data Structure');

		return results;
	}).then(pass).catch(fail);
};
