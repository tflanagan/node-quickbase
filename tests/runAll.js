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
let fs = require('fs'),
	path = require('path'),
	Promise = require('bluebird'),
	QuickBase = require('../');

/* Globals */
if(!!process.env.TRAVIS === false){
	if(process.argv.length !== 7){
		console.error([
			'ERROR: Incorrect CI Test Usage.',
			'',
			'\t$ npm test <realm> <username> <password> <appToken> <dbid>',
			'',
			'\trealm:    www',
			'\tusername: foo@bar.com',
			'\tpassword: foobar',
			'\tappToken: dn23iuct88jvbcx7v9vttp2an6',
			'\tdbid:     bkcamms4m',
			'\t          (must be a table dbid, not an application dbid)',
			''
		].join('\n'));

		return process.exit(1);
	}

	process.env.realm    = process.argv[2];
	process.env.username = process.argv[3];
	process.env.password = process.argv[4];
	process.env.appToken = process.argv[5];
	process.env.dbid     = process.argv[6];
}

/* Helpers */
let getTests = () => {
	return new Promise((resolve, reject) => {
		try {
			let tests = fs.readdirSync(__dirname)
				.filter((test) => {
					return test.indexOf('.') !== 0 && test !== 'runAll.js';
				});

			resolve(tests);
		}catch(err){
			reject(err);
		}
	});
};

let runTest = (test) => {
	return new Promise((resolve, reject) => {
		require(path.join(__dirname, test))(resolve, reject);
	});
};

/* Main */
getTests()
	.then((tests) => {
		// Force API_Authenticate to be first
		// Need 'ticket' for the rest of the tests.
		let i = tests.indexOf('API_Authenticate.js');

		if(i === -1){
			throw new Error('Missing API_Authenticate.js test.');
		}

		let authTest = tests.splice(i, 1);

		return authTest.concat(tests);
	})
	.map((test) => {
		return runTest(test)
			.then((results) => {
				if(results.ticket){
					process.env.ticket = results.ticket;
				}

				console.log('Test Complete: %s', test);
			})
			.catch((err) => {
				console.error('Test Failed: %s', test);

				throw err;
			});
	}, {
		concurrency: 1
	});
