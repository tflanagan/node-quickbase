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
const expectedAddField = {
	action: 'API_AddField',
	errcode: 0,
	errtext: 'No error',
	fid: 0,
	label: 'Test Field'
};

const expectedDeleteField = {
	action: 'API_DeleteField',
	errcode: 0,
	errtext: 'No error'
};

/* Main */
module.exports = function(pass, fail) {
	const qb = new QuickBase({
		realm: process.env.realm,
		appToken: process.env.appToken,
		ticket: process.env.ticket
	});

	return qb.api('API_AddField', {
		dbid: process.env.dbid,
		label: 'Test Field',
		type: 'text'
	}).then((results) => {
		common.objStrctEqual(results, expectedAddField, 'Mismatched API_AddField Data Structure');

		return qb.api('API_DeleteField', {
			dbid: process.env.dbid,
			fid: results.fid
		}).then((results) => {
			common.objStrctEqual(results, expectedDeleteField, 'Mismatched API_DeleteField Data Structure');

			return results;
		});
	}).then(pass).catch(fail);
};
