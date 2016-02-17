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
const fs = require('fs');
const path = require('path');
const Promise = require('bluebird');

/* Globals */
if (!!process.env.TRAVIS === false) {
	if (process.argv.length !== 8) {
		console.error([
			'ERROR: Incorrect CI Test Usage.',
			'',
			'\t$ npm test <realm> <username> <password> <appToken> <dbid> <appid>',
			'',
			'\trealm:    www',
			'\tusername: foo@bar.com',
			'\tpassword: foobar',
			'\tappToken: dn23iuct88jvbcx7v9vttp2an6',
			'\tdbid:     bkcamms4m',
			'\tappid:    bkcamms4l',
			''
		].join('\n'));

		return process.exit(1);
	}

	process.env.realm    = process.argv[2];
	process.env.username = process.argv[3];
	process.env.password = process.argv[4];
	process.env.appToken = process.argv[5];
	process.env.dbid     = process.argv[6];
	process.env.appid    = process.argv[7];
}

/* Helpers */
const getTests = () => {
	return new Promise((resolve, reject) => {
		fs.readdir(__dirname, (err, tests) => {
			if (err)
				return reject(err);

			tests = tests.reduce((tests, test) => {
				if (test.indexOf('.') !== 0 && test !== 'runAll.js' && test !== '_common.js')
					tests.push(test);

				return tests;
			}, []);

			resolve(tests);
		});
	});
};

const runTest = (test) => {
	return new Promise((resolve, reject) => {
		require(path.join(__dirname, test))(resolve, reject);
	});
};

/* Main */
getTests().then((tests) => {
	// Force API_Authenticate to be first
	// Need 'ticket' for the rest of the tests.
	const i = tests.indexOf('API_Authenticate.js');

	if (i === -1)
		throw new Error('Missing API_Authenticate.js test.');

	const authTest = tests.splice(i, 1);

	return authTest.concat(tests);
}).map((test) => {
	return runTest(test).then((results) => {
		if (results && results.ticket)
			process.env.ticket = results.ticket;

		console.log('Test Complete: %s', test);
	}).catch((err) => {
		console.error('Test Failed: %s', test);

		throw err;
	});
}, {
	concurrency: 1
});
