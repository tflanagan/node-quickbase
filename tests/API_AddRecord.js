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
const expectedAddRecord = {
	action: 'API_AddRecord',
	errcode: 0,
	errtext: 'No error',
	rid: 0,
	update_id: 0
};

const expectedDeleteRecord = {
	action: 'API_DeleteRecord',
	errcode: 0,
	errtext: 'No error',
	rid: 0
};

/* Main */
module.exports = function(pass, fail) {
	const qb = new QuickBase({
		realm: process.env.realm,
		appToken: process.env.appToken,
		ticket: process.env.ticket
	});

	return qb.api('API_AddRecord', {
		dbid: process.env.dbid
	}).then((results) => {
		common.objStrctEqual(results, expectedAddRecord, 'Mismatched API_AddRecord Data Structure');

		return qb.api('API_DeleteRecord', {
			dbid: process.env.dbid,
			rid: results.rid
		}).then((results) => {
			common.objStrctEqual(results, expectedDeleteRecord, 'Mismatched API_DeleteRecord Data Structure');

			return results;
		});
	}).then(pass).catch(fail);
};
