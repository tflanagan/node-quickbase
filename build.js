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
const cp = require('child_process');
const path = require('path');
const Promise = require('bluebird');
const inquirer = require('inquirer');

/* Constants */
const BABEL = path.join('.', 'node_modules', 'babel-cli', 'bin', 'babel.js');
const BROWSERIFY = path.join('.', 'node_modules', 'browserify', 'bin', 'cmd.js');
const COMMENTED_LICENSE = path.join('.', 'tools', 'LICENSE.js');
const ESLINT = path.join('.', 'node_modules', 'eslint', 'bin', 'eslint.js');

/* Helpers */
const browserify = () => {
	console.log('Running Browserify...');

	return new Promise((resolve, reject) => {
		cp.exec([
			'node ' + BROWSERIFY + ' quickbase.es5.js > quickbase.browserify.js',
			'cat ' + COMMENTED_LICENSE + ' > quickbase.browserify.min.js',
			'minify quickbase.browserify.js >> quickbase.browserify.min.js',
			'rm quickbase.browserify.js'
		].join(' && '), (err, stdout, stderr) => {
			if (err)
				return reject(new Error(err));

			console.log('Browserify Complete');

			resolve();
		});
	});
};

const es5 = () => {
	console.log('Running ES5 Translation...');

	return new Promise((resolve, reject) => {
		cp.exec('node ' + BABEL + ' --presets es2015 quickbase.js > quickbase.es5.js', (err, stdout, stderr) => {
			if (err)
				return reject(new Error(err));

			console.log('ES5 Translation Complete');

			resolve();
		});
	});
};

const eslint = () => {
	console.log('Running ESLint...');

	return new Promise((resolve, reject) => {
		cp.exec('node ' + ESLINT + ' quickbase.js build.js example.js tests', (err, stdout, stderr) => {
			if (stdout)
				console.log(stdout);

			if (err)
				return reject(new Error(err));

			console.log('ESLint Complete');

			resolve();
		});
	});
};

const sa = () => {
	console.log('Building SA...');

	return new Promise((resolve, reject) => {
		cp.exec([
			'node ' + BROWSERIFY + ' --node -r .' + path.sep + 'quickbase.es5.js:quickbase >> quickbase.sa.js',
			'cat ' + COMMENTED_LICENSE + ' > quickbase.sa.min.js',
			'minify quickbase.sa.js >> quickbase.sa.min.js',
			'rm quickbase.sa.js'
		].join(' && '), (err, stdout, stderr) => {
			if (err)
				return reject(new Error(err));

			console.log('SA Build Complete');

			resolve();
		});
	});
};

const test = () => {
	console.log('Running Tests...');

	return new Promise((resolve, reject) => {
		if (!!process.env.TRAVIS === true)
			return resolve();

		if (process.argv.length === 15) {
			process.env.realm    = process.argv[4];
			process.env.username = process.argv[6];
			process.env.password = process.argv[8];
			process.env.appToken = process.argv[10];
			process.env.appid    = process.argv[12];
			process.env.dbid     = process.argv[14];

			return resolve();
		}

		inquirer.prompt([
			{
				type: 'input',
				name: 'realm',
				message: 'Realm:'
			},
			{
				type: 'input',
				name: 'username',
				message: 'Username:'
			},
			{
				type: 'password',
				name: 'password',
				message: 'Password:'
			},
			{
				type: 'input',
				name: 'appToken',
				message: 'AppToken:'
			},
			{
				type: 'input',
				name: 'appid',
				message: 'Application ID:'
			},
			{
				type: 'input',
				name: 'dbid',
				message: 'Table ID:'
			}
		], (answers) => {
			process.env.realm    = answers.realm;
			process.env.username = answers.username;
			process.env.password = answers.password;
			process.env.appToken = answers.appToken;
			process.env.dbid     = answers.dbid;
			process.env.appid    = answers.appid;

			resolve();
		});
	}).then(() => {
		return new Promise((resolve, reject) => {
			fs.readdir(path.join(__dirname, 'tests'), (err, tests) => {
				if (err)
					return reject(err);

				resolve(tests.filter((test) => {
					return [
						test.indexOf('.'),
						test.indexOf('_')
					].indexOf(0) === -1;
				}));
			});
		});
	}).then((tests) => {
		// Force API_Authenticate to be first
		// Need 'ticket' for the rest of the tests.
		const i = tests.indexOf('API_Authenticate.js');

		if (i === -1)
			throw new Error('Missing API_Authenticate.js test.');

		const authTest = tests.splice(i, 1);

		return authTest.concat(tests);
	}).map((test) => {
		return new Promise((resolve, reject) => {
			require(path.join(__dirname, 'tests', test))(resolve, reject);
		}).then((results) => {
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
};

return es5().then(sa).then(browserify);
