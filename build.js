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
const exec = require('child_process').exec;
const path = require('path');
const Promise = require('bluebird');

/* Constants */
const BABEL = path.join('.', 'node_modules', 'babel-cli', 'bin', 'babel.js');
const BROWSERIFY = path.join('.', 'node_modules', 'browserify', 'bin', 'cmd.js');
const COMMENTED_LICENSE = path.join('.', 'tools', 'LICENSE.js');

/* Helpers */
const browserify = () => {
	console.log('Running Browserify...');

	return new Promise((resolve, reject) => {
		exec([
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
		exec('node ' + BABEL + ' --presets es2015 quickbase.js > quickbase.es5.js', (err, stdout, stderr) => {
			if (err)
				return reject(new Error(err));

			console.log('ES5 Translation Complete');

			resolve();
		});
	});
};

return es5().then(browserify);
