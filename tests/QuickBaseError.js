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

/* Main */
module.exports = function(pass, fail) {
	const qb = new QuickBase({
		realm: process.env.realm,
		appToken: process.env.appToken,
		ticket: process.env.ticket
	});

	const dummyDBID = 'abcdefghi';

	return qb.api('API_DoQuery', {
		dbid: dummyDBID
	}).then((results) => {
		fail('Should have errored on invalid dbid');
	}).catch(() => {
		qb.api('API_DoQuery', {
			dbid: dummyDBID
		}, function(err, res) {
			if (res)
				return fail('Should have errored on invalid dbid');

			pass();
		});
	});
};
