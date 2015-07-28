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
var xml = require('xml2js'),
	http = require('http'),
	https = require('https'),
	Promise = require('bluebird');

/* Helpers */
var inherits = function(ctor, superCtor){
	ctor.super_ = superCtor;

	ctor.prototype = Object.create(superCtor.prototype, {
		constructor: {
			value: ctor,
			enumerable: false,
			writable: true,
			configurable: true
		}
	});
};

var cleanXML = function(xml){
	var keys = Object.keys(xml),
		o = 0, k = keys.length,
		node, value, singulars,
		l = -1, i = -1, s = -1, e = -1,
		isInt = /^-?\s*\d+$/,
		isDig = /^(-?\s*\d*\.?\d*)$/,
		radix = 10;

	for(; o < k; ++o){
		node = keys[o];

		if(xml[node] instanceof Array && xml[node].length === 1){
			xml[node] = xml[node][0];
		}

		if(xml[node] instanceof Object){
			value = Object.keys(xml[node]);

			if(value.length === 1){
				l = node.length;

				singulars = [
					node.substring(0, l - 1),
					node.substring(0, l - 3) + 'y'
				];

				i = singulars.indexOf(value[0]);

				if(i !== -1){
					xml[node] = xml[node][singulars[i]];
				}
			}
		}

		if(typeof(xml[node]) === 'object'){
			xml[node] = cleanXML(xml[node]);
		}

		if(typeof(xml[node]) === 'string'){
			value = xml[node].trim();

			if(value.match(isDig)){
				if(value.match(isInt)){
					if(Math.abs(parseInt(value, radix)) <= 9007199254740991){
						xml[node] = parseInt(value, radix);
					}
				}else{
					l = value.length;

					if(l <= 15){
						xml[node] = parseFloat(value);
					}else{
						for(i = 0, s = -1, e = -1; i < l && e - s <= 15; ++i){
							if(value.charAt(i) > 0){
								if(s === -1){
									s = i;
								}else{
									e = i;
								}
							}
						}

						if(e - s <= 15){
							xml[node] = parseFloat(value);
						}
					}
				}
			}
		}
	}

	return xml;
};

var mergeObjects = function(){
	var overwrite = true,
		nObjs = arguments.length,
		newObj = [],
		i = 0, d;

	if(typeof(arguments[nObjs - 1]) === 'boolean'){
		overwrite = arguments[nObjs - 1];
		--nObjs;
	}

	for(; i < nObjs; ++i){
		if(!(arguments[i] instanceof Array) && (arguments[i] instanceof Object)){
			newObj = {};

			break;
		}
	}

	for(i = 0; i < nObjs; ++i){
		if(!arguments[i + 1] || typeof(arguments[i + 1]) === 'boolean'){
			continue;
		}

		for(d in arguments[i + 1]){
			if(arguments[i].hasOwnProperty(d) && arguments[i + 1].hasOwnProperty(d)){
				if(typeof(arguments[i][d]) === 'object' && typeof(arguments[i + 1][d]) === 'object'){
					newObj[d] = mergeObjects(arguments[i][d], arguments[i + 1][d], overwrite);
				}else
				if(overwrite){
					newObj[d] = arguments[i + 1][d];
				}else{
					if(newObj[d] instanceof Array){
						newObj[d].push(arguments[i + 1][d]);
					}else{
						newObj[d] = [arguments[i][d], arguments[i + 1][d]];
					}
				}
			}else
			if(arguments[i + 1].hasOwnProperty(d) && typeof(arguments[i + 1][d]) === 'object'){
				newObj[d] = mergeObjects(arguments[i + 1][d] instanceof Array ? [] : {}, arguments[i + 1][d], overwrite);
			}else{
				newObj[d] = arguments[i + 1][d];
			}
		}

		for(d in arguments[i]){
			if(!(d in arguments[i + 1]) && arguments[i].hasOwnProperty(d)){
				if(typeof(arguments[i + 1][d]) === 'object'){
					newObj[d] = mergeObjects(arguments[i][d] instanceof Array ? [] : {}, arguments[i][d], overwrite);
				}else{
					newObj[d] = arguments[i][d];
				}
			}
		}
	}

	return newObj;
};

/* Error Handling */
var QuickbaseError = (function(){
	var quickbaseError = function(code, name, message){
		this.code = code;
		this.name = name;
		this.message = message;

		if(this.message instanceof Object){
			this.message = this.message._;
		}

		if(!this.hasOwnProperty('stack')){
			this.stack = (new Error()).stack;
		}

		return this;
	};

	inherits(quickbaseError, Error);

	return quickbaseError;
})();

/* Main Class */
var QuickBase = (function(){
	var defaults = {
		realm: 'www',
		domain: 'quickbase.com',
		useSSL: true,

		username: '',
		password: '',
		appToken: '',
		ticket: '',

		flags: {
			useXML: true,
			msInUTC: true,
			includeRids: true,
			returnPercentage: false,
			fmt: 'structured'
		},

		status: {
			errcode: 0,
			errtext: 'No error',
			errdetail: ''
		},

		maxErrorRetryAttempts: 3,
		connectionLimit: 10,
		errorOnConnectionLimit: false
	};

	var quickbase = function(options){
		this.settings = mergeObjects(defaults, options || {});

		this.throttle = new Throttle(this.settings.connectionLimit, this.settings.errorOnConnectionLimit);

		return this;
	};

	quickbase.prototype.api = function(action, options){
		var that = this;

		return this.throttle.acquire(function(){
			return new QueryBuilder(that, action, options);
		});
	};

	return quickbase;
})();

/* Throttle */
var Throttle = (function(){
	var throttle = function(maxConnections, errorOnConnectionLimit){
		var that = this;

		this.maxConnections = maxConnections;
		this.errorOnConnectionLimit = errorOnConnectionLimit;

		this.numConnections = 0;
		this.pendingConnections = [];

		return this;
	};

	throttle.prototype.acquire = function(callback){
		var that = this;

		if(this.maxConnections === -1){
			return Promise.resolve(callback());
		}

		if(this.numConnections >= this.maxConnections){
			if(this.errorOnConnectionLimit){
				return Promise.reject(new QuickbaseError(1001, 'No Connections Available', 'Maximum Number of Connections Reached'));
			}

			return new Promise(function(resolve, reject){
				that.pendingConnections.push(function(){
					resolve(that.acquire(callback));
				});
			});
		}

		++that.numConnections;

		return new Promise(function(resolve, reject){
			resolve(callback());
		}).finally(function(){
			--that.numConnections;

			if(that.pendingConnections.length > 0){
				that.pendingConnections.shift()();
			}
		});
	};

	return throttle;
})();

/* Request Handling */
var QueryBuilder = (function(){
	var queryBuilder = function(parent, action, options){
		this.parent = parent;
		this.action = action;
		this.options = options;

		this.nErr = 0;

		return Promise.bind(this)
			.then(this.addFlags)
			.then(this.processOptions)
			.then(this.constructPayload)
			.then(this.actionRequest)
			.then(this.processQuery)
			.then(this.actionResponse)
			.catch(function(err){
				++this.nErr;

				var parent = this.parent,
					parentSettings = parent.settings;

				if(this.nErr < parentSettings.maxErrorRetryAttempts){
					if([1000, 1001].indexOf(err.code) !== -1){
						return parent.api(this.action, this.options);
					}else
					if(err.code === 4 && parentSettings.hasOwnProperty('username') && parentSettings.hasOwnProperty('password')){
						return parent.api('API_Authenticate', {
							username: parentSettings.username,
							password: parentSettings.password
						}).then(function(){
							return parent.api(this.action, this.options);
						});
					}
				}

				return Promise.reject(err);
			});
	};

	queryBuilder.prototype.actionRequest = function(){
		var action = this.action;

		if(!actions.hasOwnProperty(action)){
			action = 'default';
		}

		if(typeof(actions[action]) !== 'undefined'){
			if(typeof(actions[action]) === 'function'){
				return actions[action](this);
			}else
			if(typeof(actions[action].request) === 'function'){
				return actions[action].request(this);
			}
		}

		return Promise.resolve();
	};

	queryBuilder.prototype.actionResponse = function(result){
		var action = this.action;

		if(!actions.hasOwnProperty(action)){
			action = 'default';
		}

		if(typeof(actions[action]) === 'object' && typeof(actions[action].response) === 'function'){
			return actions[action].response(this, result);
		}

		return Promise.resolve(result);
	};

	queryBuilder.prototype.addFlags = function(){
		if(!this.options.hasOwnProperty('msInUTC') && this.parent.settings.flags.msInUTC){
			this.options.msInUTC = 1;
		}

		if(!this.options.hasOwnProperty('appToken') && this.parent.settings.appToken){
			this.options.apptoken = this.parent.settings.appToken;
		}

		if(!this.options.hasOwnProperty('ticket') && this.parent.settings.ticket){
			this.options.ticket = this.parent.settings.ticket;
		}

		if(!this.options.hasOwnProperty('returnPercentage') && this.parent.settings.flags.returnPercentage){
			this.options.returnPercentage = 1;
		}

		if(!this.options.hasOwnProperty('includeRids') && this.parent.settings.flags.includeRids){
			this.options.includeRids = 1;
		}

		if(!this.options.hasOwnProperty('fmt') && this.parent.settings.flags.fmt){
			this.options.fmt = this.parent.settings.flags.fmt;
		}

		return Promise.resolve();
	};

	queryBuilder.prototype.constructPayload = function(){
		var builder = new xml.Builder({
			rootName: 'qdbapi',
			headless: true,
			renderOpts: {
				pretty: false
			}
		});

		this.payload = '';

		if(this.parent.settings.flags.useXML === true){
			this.payload = builder.buildObject(this.options);
		}else{
			for(var arg in this.options){
				this.payload += '&' + arg + '=' + this.options[arg];
			}
		}

		return Promise.resolve();
	};

	queryBuilder.prototype.processQuery = function(){
		var that = this;

		return new Promise(function(resolve, reject){
			var reqOpts = {
					hostname: [ that.parent.settings.realm, that.parent.settings.domain ].join('.'),
					port: that.parent.settings.useSSL ? 443 : 80,
					path: '/db/' + (that.options.dbid || 'main') + '?act=' + that.action + (!that.parent.settings.flags.useXML ? that.payload : ''),
					method: that.parent.settings.flags.useXML ? 'POST' : 'GET',
					headers: {
						'Content-Type': 'application/xml',
						'QUICKBASE-ACTION': that.action
					},
					agent: false
				},
				protocol = that.parent.settings.useSSL ? https : http,
				request = protocol.request(reqOpts, function(response){
					var xmlResponse = '';

					response.on('data', function(chunk){
						xmlResponse += chunk;
					});

					response.on('end', function(){
						xml.parseString(xmlResponse, function(err, result){
							if(err){
								return reject(new QuickbaseError(1000, 'Error Processing Request', err));
							}

							result = cleanXML(result.qdbapi);

							resolve(result);
						});
					});
				});

			if(that.parent.settings.flags.useXML === true){
				request.write(that.payload);
			}

			request.on('error', function(err){
				reject(err);
			});

			request.end();
		});
	};

	queryBuilder.prototype.processOptions = function(){
		if(this.options.hasOwnProperty('fields')){
			this.options.field = this.options.fields;

			delete this.options.fields;
		}

		var k = Object.keys(this.options),
			i = 0, l = k.length,
			current;

		for(; i < l; ++i){
			current = k[i];

			if(prepareOptions.hasOwnProperty(current)){
				this.options[current] = prepareOptions[current](this.options[current]);
			}
		}

		return Promise.resolve();
	};

	return queryBuilder;
})();

/* Actions */
var actions = (function(){
	return {
		API_Authenticate: {
			response: function(context, result){
				if(result.errcode !== context.parent.settings.status.errcode){
					return Promise.reject(new QuickbaseError(result.errcode, result.errtext, result.errdetail));
				}

				/* Only reason we need a custom action... */
				context.parent.settings.ticket = result.ticket;
				context.parent.settings.username = context.options.username;
				context.parent.settings.password = context.options.password;

				return Promise.resolve(result);
			}
		},
		API_DoQuery: {
			response: function(context, result){
				if(result.errcode !== context.parent.settings.status.errcode){
					return Promise.reject(new QuickbaseError(result.errcode, result.errtext, result.errdetail));
				}

				/* XML is _so_ butt ugly... Let's try to make some sense of it
				 * Turn this:
				 * 	{
				 * 		$: { rid: 1 },
				 * 		f: [ 
				 * 			{ $: { id: 3 }, _: 1 } ],
				 * 			{ $: { id: 6 }, _: 'Test Value' }
				 * 		]
				 * 	}
				 *
				 * Into this:
				 * 	{
				 * 		3: 1,
				 * 		6: 'Test Value'
				 * 	}
				*/
				var unparsedRecords = result.table.records,
					i = 0, l = unparsedRecords.length,
					o = 0, k = 0,
					parsedRecords = [],
					unparsedRecord = {},
					parsedRecord = {},
					field = {};

				if(l !== 0){
					for(; i < l; ++i){
						unparsedRecord = unparsedRecords[i];
						parsedRecord = {
							rid: unparsedRecord.$.rid
						};

						for(o = 0, k = unparsedRecord.f.length; o < k; ++o){
							field = unparsedRecord.f[o];

							parsedRecord[field.$.id] = field._;
						}

						parsedRecords.push(parsedRecord);
					}

					result.table.records = parsedRecords;
				}

				return Promise.resolve(result);
			}
		},
		default: {
			/*
			request: function(context){
				// Do Nothing
			},
			*/
			response: function(context, result){
				if(result.errcode !== context.parent.settings.status.errcode){
					return Promise.reject(new QuickbaseError(result.errcode, result.errtext, result.errdetail));
				}

				return Promise.resolve(result);
			}
		}
	};
})();

/* Option Handling */
var prepareOptions = {
	clist: function(val){
		return val instanceof Array ? val.join('.') : val;
	},
	clist_output: function(val){
		return val instanceof Array ? val.join('.') : val;
	},
	slist: function(val){
		return val instanceof Array ? val.join('.') : val;
	},
	options: function(val){
		return val instanceof Array ? val.join('.') : val;
	},
	records_csv: function(val){
		return val instanceof Array ? val.join('\n') : val;
	},
	field: function(val){
		var newValue = {},
			curValue = {},
			l = val.length,
			i = 0;

		for(; i < l; ++i){
			curValue = val[i];

			newValue = {
				$: {},
				_: curValue.value
			};

			if(curValue.hasOwnProperty('fid')){
				newValue.$.fid = curValue.fid;
			}

			if(curValue.hasOwnProperty('name')){
				newValue.$.name = curValue.name;
			}

			if(curValue.hasOwnProperty('filename')){
				newValue.$.filename = curValue.filename;
			}

			val[i] = newValue;
		}

		return val;
	}
};

/* Expose Instances */
QuickBase.QueryBuilder = QueryBuilder;
QuickBase.Throttle = Throttle;
QuickBase.QuickbaseError = QuickbaseError;

/* Expose Methods */
QuickBase.actions = actions;
QuickBase.prepareOptions = prepareOptions;
QuickBase.cleanXML = cleanXML;

/* Export Module */
module.exports = QuickBase;