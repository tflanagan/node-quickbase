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

/* Dependencies */
var xml = require('xml2js'),
	http = require('http'),
	https = require('https'),
	Promise = require('bluebird'),
	EventEmitter = require('events').EventEmitter;

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
	var node, value, singulars,
		l = -1, i = -1, s = -1, e = -1,
		isInt = /^\-?\s*\d+$/,
		isDig = /^(\-?\s*\d*\.?\d*)$/,
		radix = 10;

	for(node in xml){
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

				if((i = singulars.indexOf(value[0])) !== -1){
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
					if(Math.abs(parseInt(value, radix)) <= Number.MAX_SAFE_INTEGER){
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
var quickbaseError = (function(){
	var quickbaseError = function(code, name, message){
		this.code = code;
		this.name = name;
		this.message = message;

		if(this.message instanceof Object){
			this.message = this.message._;
		}

		if(this.stack === undefined){
			this.stack = (new Error()).stack;
		}

		return this;
	};

	inherits(quickbaseError, Error);

	return quickbaseError;
})();

/* Main Class */
var quickbase = (function(){
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
		var that = this;

		this.settings = mergeObjects(defaults, options || {});

		this.pool = new throttle(this.settings.connectionLimit, this.settings.errorOnConnectionLimit);

		return this;
	};

	quickbase.prototype.api = function(action, options){
		var that = this;

		return this.pool.acquire(function(){
			return new queryBuilder(that, action, options)
				.finally(function(){
					that.pool.emit('release');
				});
		});
	};

	return quickbase;
})();

/* Throttle */
var throttle = (function(){
	var throttle = function(maxConnections, errorOnConnectionLimit){
		var that = this;

		this.maxConnections = maxConnections;
		this.errorOnConnectionLimit = errorOnConnectionLimit;

		this.numConnections = 0;
		this.pendingConnections = [];

		this.on('release', function(){
			--that.numConnections;

			if(that.pendingConnections.length > 0){
				that.pendingConnections.shift()();
			}
		});

		return this;
	};

	inherits(throttle, EventEmitter);

	throttle.prototype.acquire = function(callback){
		var that = this;

		if(this.numConnections >= this.maxConnections){
			if(this.errorOnConnectionLimit){
				return Promise.reject(new quickbaseError(1001, 'No Connections Available', 'Maximum Number of Connections Reached'));
			}

			return new Promise(function(resolve, reject){
				that.pendingConnections.push(function(){
					resolve(that.acquire(callback));
				});
			});
		}

		++that.numConnections;

		return callback();
	};

	return throttle;
})();

/* Request Handling */
var queryBuilder = (function(){
	var queryBuilder = function(parent, action, options){
		this.parent = parent;
		this.action = action;
		this.options = options;

		this.nErr = 0;

		return Promise.bind(this)
			.then(this.addFlags)
			.then(this.prepareOptions)
			.then(this.constructPayload)
			.then(function(){
				if(actions[this.action] !== undefined){
					return actions[this.action](this);
				}else{
					return actions.default(this);
				}
			})
			.catch(function(err){
				++this.nErr;

				var parent = this.parent;

				if(this.nErr < parent.settings.maxErrorRetryAttempts){
					if([1000, 1001].indexOf(err.code) !== -1){
						return parent.api(this.action, this.options);
					}else
					if(err.code === 4 && parent.settings.username && parent.settings.password){
						return parent.api('API_Authenticate', {
							username: parent.settings.username,
							password: parent.settings.password
						}).then(function(){
							return parent.api(this.action, this.options);
						});
					}
				}

				return Promise.reject(err);
			});
	};

	queryBuilder.prototype.addFlags = function(){
		if(this.parent.settings.flags.msInUTC){
			this.options.msInUTC = 1;
		}

		if(this.parent.settings.appToken){
			this.options.apptoken = this.parent.settings.appToken;
		}

		if(this.parent.settings.ticket){
			this.options.ticket = this.parent.settings.ticket;
		}

		if(this.parent.settings.flags.returnPercentage){
			this.options.returnPercentage = 1;
		}

		if(this.parent.settings.flags.includeRids){
			this.options.includeRids = 1;
		}

		if(this.parent.settings.flags.fmt){
			this.options.fmt = this.parent.settings.flags.fmt;
		}

		return Promise.resolve();
	};

	queryBuilder.prototype.prepareOptions = function(){
		this.options = prepareOptions(this.options);

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

		if(this.parent.settings.flags.useXML){
			this.payload = builder.buildObject(this.options);
		}else{
			var arg;

			for(arg in this.options){
				this.payload += '&' + arg + '=' + this.options[arg];
			}
		}

		return Promise.resolve();
	};

	return queryBuilder;
})();

/* Actions */
var actions = (function(){
	var buildRequest = function(callback){
		var that = this,
			reqOpts = {
				hostname: [ this.parent.settings.realm, this.parent.settings.domain ].join('.'),
				port: this.parent.settings.useSSL ? 443 : 80,
				path: '/db/' + (this.options.dbid || 'main') + '?act=' + this.action + (!this.parent.settings.flags.useXML ? this.payload : ''),
				method: this.parent.settings.flags.useXML ? 'POST' : 'GET',
				headers: {
					'Content-Type': 'application/xml',
					'QUICKBASE-ACTION': this.action
				},
				agent: false
			},
			protocol = this.parent.settings.useSSL ? https : http,
			request = protocol.request(reqOpts, function(response){
				var xmlResponse = '';

				response.on('data', function(chunk){
					xmlResponse += chunk;
				});

				response.on('end', function(){
					xml.parseString(xmlResponse, callback);
				});
			});

		if(this.parent.settings.flags.useXML){
			request.write(that.payload);
		}

		request.on('error', function(err){
			callback(err, null);
		});

		request.end();
	};

	return {
		API_Authenticate: function(context){
			var that = context;

			return new Promise(function(resolve, reject){
				buildRequest.call(that, function(err, result){
					if(err){
						return reject(new quickbaseError(1000, 'Error Processing Request', err));
					}

					result = cleanXML(result.qdbapi);

					if(result.errcode !== that.parent.settings.status.errcode){
						return reject(new quickbaseError(result.errcode, result.errtext, result.errdetail));
					}

					// Only reason we need a custom action...
					that.parent.settings.ticket = result.ticket;
					that.parent.settings.username = that.options.username;
					that.parent.settings.password = that.options.password;

					resolve(result);
				});
			});
		},
		default: function(context){
			var that = context;

			return new Promise(function(resolve, reject){
				buildRequest.call(that, function(err, result){
					if(err){
						return reject(new quickbaseError(1000, 'Error Processing Request', err));
					}

					result = cleanXML(result.qdbapi);

					if(result.errcode !== that.parent.settings.status.errcode){
						return reject(new quickbaseError(result.errcode, result.errtext, result.errdetail));
					}

					resolve(result);
				});
			});
		}
	}
})();

/* Option Handling */
var prepareOptions = (function(){
	var options = {
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
				l = val.length,
				i = 0;

			for(; i < l; ++i){
				newValue = {
					$: {},
					_: val[i].value
				};

				if(parseFloat(val[i].fid) !== NaN && parseFloat(val[i].fid) == val[i].fid){
					newValue.$.fid = val[i].fid;
				}else{
					newValue.$.name = val[i].fid;
				}

				val[i] = newValue;
			}

			return val;
		}
	};

	return function(opts){
		var arg;

		if(opts.fields !== undefined){
			opts.field = opts.fields;

			delete opts.fields;
		}

		for(arg in opts){
			if(options[arg] instanceof Function){
				opts[arg] = options[arg](opts[arg]);
			}
		}

		return opts;
	};
})();

module.exports = quickbase;