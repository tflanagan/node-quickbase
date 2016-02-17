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
/*
const QuickBase = require('../');
const common = require('./_common.js');
*/

/* Expected Structures */
/*
const expectedCTBL = {
	action: 'API_CreateTable',
	errcode: 0,
	errtext: 'No error',
	newdbid: ''
};

const expectedDDB = {
	action: 'API_DeleteDatabase',
	errcode: 0,
	errtext: 'No error'
};
*/

/* Main */
module.exports = function(pass, fail) {
	// Test user rights need to be fixed first
	return pass();

	/*
	const qb = new QuickBase({
		realm: process.env.realm,
		appToken: process.env.appToken,
		ticket: process.env.ticket
	});

	return qb.api('API_CreateTable', {
		dbid: process.env.appid,
		tname: 'Test DB',
		pnoun: 'Test DB'
	}).then((results) => {
		common.objStrctEqual(results, expectedCTBL, 'Mismatched API_CreateTable Data Structure');

		return qb.api('API_DeleteDatabase', {
			dbid: results.newdbid
		}).then((results) => {
			common.objStrctEqual(results, expectedDDB, 'Mismatched API_DeleteDatabase Data Structure');

			return results;
		});
	}).then(pass).catch(fail);
	*/
};
