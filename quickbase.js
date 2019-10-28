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

/* VERSIONING */
const VERSION_MAJOR = 3;
const VERSION_MINOR = 0;
const VERSION_PATCH = 0;
const VERSION = [ VERSION_MAJOR, VERSION_MINOR, VERSION_PATCH ].join('.');

/* Dependencies */
const merge = require('lodash.merge');
const Debug = require('debug');
const Throttle = require('generic-throttle');
const request = require('request-promise');
const Promise = require('bluebird');

const debugRequest = Debug('quickbase:request');
const debugResponse = Debug('quickbase:response');

/* Default Settings */
const defaults = {
	server: 'api.quickbase.com',

	realm: 'www',
	clientId: '',
	clientSecret: '',
	userToken: '',

	userAgent: 'node-quickbase/v' + VERSION,

	connectionLimit: 10,
	errorOnConnectionLimit: false
};

/* Main Class */
class QuickBase {

	constructor(options){
		this._id = 0;

		this.className = QuickBase.className;

		this.settings = merge({}, QuickBase.defaults, options || {});

		this.throttle = new Throttle(this.settings.connectionLimit, -1, this.settings.errorOnConnectionLimit);

		return this;
	}

	_getBasicRequest(){
		return {
			method: 'GET',
			url: 'https://' + this.settings.server + '/',
			headers: {
				'User-Agent': this.settings.userAgent,
				'Authorization': 'QB-USER-TOKEN ' + this.settings.userToken,
				'realmHostName': this.settings.realm,
				'client_id': this.settings.clientId,
				'client_secret': this.settings.clientSecret
			}
		};
	}

	_request(options){
		return this.throttle.acquire((resolve, reject) => {
			const id = 0 + this._id;

			debugRequest(id, options);

			return request(options).then((results) => {
				debugResponse(id, results);

				resolve(results);
			}).catch((err) => {
				debugResponse(err);

				reject(err);
			});
		});
	}

	getApp(appId){
		const options = this._getBasicRequest();

		options.url += 'apps/' + appId;

		return this._request(options);
	}

	getAppTables(appId){
		const options = this._getBasicRequest();

		options.url += 'tables?appId=' + appId;

		return this._request(options);
	}

	getFields(tableId){
		const options = this._getBasicRequest();

		options.url += 'fields?tableId=' + tableId;

		return this._request(options);
	}

	getField(tableId, fieldId){
		const options = this._getBasicRequest();

		options.url += 'fields/' + fieldId + '?tableId=' + tableId;

		return this._request(options);
	}

	getReport(tableId, reportId){
		const options = this._getBasicRequest();

		options.url += 'reports/' + reportId + '?tableId=' + tableId;

		return this._request(options);
	}

	getTable(tableId){
		const options = this._getBasicRequest();

		options.url += 'tables/' + tableId;

		return this._request(options);
	}

	getTableReports(tableId){
		const options = this._getBasicRequest();

		options.url += 'reports?tableId=' + tableId;

		return this._request(options);
	}

	runReport(tableId, reportId){
		const options = this._getBasicRequest();

		options.url += 'reports/' + tableId + '/' + reportId + '/run';

		return this._request(options);
	}

}

/* Expose Instances */
QuickBase.Promise = Promise;

/* Expose Properties */
QuickBase.className = 'QuickBase';
QuickBase.defaults = defaults;

/* Expose Version */
QuickBase.VERSION = VERSION;

/* Export Module */
if(typeof module !== 'undefined' && module.exports){
	module.exports = QuickBase;
}else
if(typeof define === 'function' && define.amd){
	define('QuickBase', [], function(){
		return QuickBase;
	});
}

if((typeof global !== 'undefined' && typeof window !== 'undefined' && global === window) || (typeof global === 'undefined' && typeof window !== 'undefined')){
	(global || window).QuickBase = QuickBase;

	if(window.location.search.match(/debug=1/i)){
		if(window.localStorage){
			window.localStorage.debug = 'quickbase:*';
		}
	}else{
		QuickBase.Promise.config({
			longStackTraces: false
		});
	}
}
