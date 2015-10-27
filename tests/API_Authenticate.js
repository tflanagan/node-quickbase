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
const expectedAuthenticate = {
	action: 'API_Authenticate',
	errcode: 0,
	errtext: 'No error',
	ticket: '',
	userid: ''
};

/* Main */
module.exports = function(pass, fail){
	let qb = new QuickBase({
		realm: process.env.realm,
		appToken: process.env.appToken
	});

	return qb.api('API_Authenticate', {
		username: process.env.username,
		password: process.env.password
	}).then((results) => {
		common.objStrctEqual(results, expectedAuthenticate, 'Mismatched API_Authenticate Data Structure');

		return results;
	}).then(pass).catch(fail);
};
