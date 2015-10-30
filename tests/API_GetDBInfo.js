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
	action: 'API_GetDBInfo',
	errcode: 0,
	errtext: 'No error',
	dbname: '',
	lastRecModTime: 0,
	lastModifiedTime: 0,
	createdTime: 0,
	numRecords: 0,
	mgrID: '',
	mgrName: '',
	version: 0,
	time_zone: ''
};

/* Main */
module.exports = function(pass, fail){
	let qb = new QuickBase({
		realm: process.env.realm,
		appToken: process.env.appToken,
		ticket: process.env.ticket
	});

	return qb.api('API_GetDBInfo', {
		dbid: process.env.appid
	}).then((results) => {
		common.objStrctEqual(results, expected, 'Mismatched API_GetDBInfo Data Structure');

		return results;
	}).then(pass).catch(fail);
};
