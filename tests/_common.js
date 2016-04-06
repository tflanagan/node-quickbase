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

const assert = require('assert');

const objStrctEquiv = (a, b) => {
	if (typeof a !== 'object' || typeof b !== 'object')
		return false;

	return Object.keys(a).some((key, i, arr) => {
		const val = arr[key];

		if (b.hasOwnProperty(key) && objStrctMatch(val, b[key]))
			return false;

		return true;
	});
};

const objStrctMatch = (a, b) => {
	if (a === null || b === null || a === undefined || b === undefined)
		return a === b;

	if (typeof a !== 'object' || typeof b !== 'object')
		return typeof a === typeof b;

	if (a instanceof Date || b instanceof Date)
		return a instanceof Date && b instanceof Date;

	if (a instanceof Boolean || b instanceof Boolean)
		return a instanceof Boolean && b instanceof Boolean;

	if (a instanceof Number || b instanceof Number)
		return a instanceof Number && b instanceof Number;

	if (a instanceof String || b instanceof String)
		return a instanceof String && b instanceof String;

	if ((a instanceof Array || b instanceof Array) && a.length !== b.length)
		return false;

	if (a instanceof Object && !objStrctEquiv(a, b))
		return false;

	if (b instanceof Object && !objStrctEquiv(b, a))
		return false;

	return true;
};

module.exports.objStrctEqual = function objStrctEqual(actual, expected, message) {
	if (!objStrctMatch(actual, expected))
		assert.fail(actual, expected, message, 'objStrctEqual', objStrctEqual);
};
