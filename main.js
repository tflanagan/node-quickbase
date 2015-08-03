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
		isDig = /^(-?\s*\d+\.?\d*)$/,
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
			}else{
				xml[node] = value;
			}
		}
	}

	return xml;
};

var flattenXMLAttributes = function(obj){
	if(obj.$){
		var props = Object.keys(obj.$),
			i = 0, l = props.length;

		for(; i < l; ++i){
			obj[props[i]] = obj.$[props[i]];
		}

		delete obj.$;
	}

	return obj;
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
	var QuickbaseError = function(code, name, message){
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

	inherits(QuickbaseError, Error);

	return QuickbaseError;
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
			fmt: 'structured',
			encoding: 'UTF-8'
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

	var QuickBase = function(options){
		this.settings = mergeObjects(defaults, options || {});

		this.throttle = new Throttle(this.settings.connectionLimit, this.settings.errorOnConnectionLimit);

		return this;
	};

	QuickBase.prototype.api = function(action, options){
		var that = this;

		return this.throttle.acquire(function(){
			return (new QueryBuilder(that, action, options)).run();
		});
	};

	return QuickBase;
})();

/* Throttle */
var Throttle = (function(){
	var Throttle = function(maxConnections, errorOnConnectionLimit){
		var that = this;

		this.maxConnections = maxConnections;
		this.errorOnConnectionLimit = errorOnConnectionLimit;

		this.numConnections = 0;
		this.pendingConnections = [];

		return this;
	};

	Throttle.prototype.acquire = function(callback){
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

	return Throttle;
})();

/* Request Handling */
var QueryBuilder = (function(){
	var QueryBuilder = function(parent, action, options){
		this.parent = parent;
		this.action = action;
		this.options = options;
		this.settings = mergeObjects({}, parent.settings);

		this.nErr = 0;

		return this;
	};

	QueryBuilder.prototype.actionRequest = function(){
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
		}else
		if(typeof(actions.default.request) === 'function'){
			return actions.default.request(this);
		}

		return Promise.resolve();
	};

	QueryBuilder.prototype.actionResponse = function(result){
		var action = this.action;

		if(!actions.hasOwnProperty(action)){
			action = 'default';
		}

		if(typeof(actions[action]) === 'object' && typeof(actions[action].response) === 'function'){
			return actions[action].response(this, result);
		}else
		if(typeof(actions.default.response) === 'function'){
			return actions.default.response(this, result);
		}

		return Promise.resolve(result);
	};

	QueryBuilder.prototype.addFlags = function(){
		if(!this.options.hasOwnProperty('msInUTC') && this.parent.settings.flags.msInUTC){
			this.options.msInUTC = 1;
		}

		if(!this.options.hasOwnProperty('appToken') && this.parent.settings.appToken){
			this.options.apptoken = this.parent.settings.appToken;
		}

		if(!this.options.hasOwnProperty('ticket') && this.parent.settings.ticket){
			this.options.ticket = this.parent.settings.ticket;
		}

		if(!this.options.hasOwnProperty('encoding') && this.parent.settings.flags.encoding){
			this.options.encoding = this.parent.settings.flags.encoding;
		}

		return Promise.resolve();
	};

	QueryBuilder.prototype.constructPayload = function(){
		var builder = new xml.Builder({
			rootName: 'qdbapi',
			xmldec: {
				encoding: this.options.encoding
			},
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

	QueryBuilder.prototype.processQuery = function(){
		var that = this,
			settings = that.settings;

		return new Promise(function(resolve, reject){
			var reqOpts = {
					hostname: [ settings.realm, settings.domain ].join('.'),
					port: settings.useSSL ? 443 : 80,
					path: '/db/' + (that.options.dbid || 'main') + '?act=' + that.action + (!settings.flags.useXML ? that.payload : ''),
					method: settings.flags.useXML ? 'POST' : 'GET',
					headers: {
						'Content-Type': 'application/xml',
						'QUICKBASE-ACTION': that.action
					},
					agent: false
				},
				protocol = settings.useSSL ? https : http,
				request = protocol.request(reqOpts, function(response){
					var xmlResponse = '';

					response.on('data', function(chunk){
						xmlResponse += chunk;
					});

					response.on('end', function(){
						if(response.headers['content-type'] === 'application/xml'){
							xml.parseString(xmlResponse, function(err, result){
								if(err){
									return reject(new QuickbaseError(1000, 'Error Processing Request', err));
								}

								result = cleanXML(result.qdbapi);

								if(result.errcode !== settings.status.errcode){
									return reject(new QuickbaseError(result.errcode, result.errtext, result.errdetail));
								}

								resolve(result);
							});
						}else{
							resolve(xmlResponse);
						}
					});
				});

			if(settings.flags.useXML === true){
				request.write(that.payload);
			}

			request.on('error', function(err){
				reject(err);
			});

			request.end();
		});
	};

	QueryBuilder.prototype.processOptions = function(){
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

	QueryBuilder.prototype.run = function(){
		return Promise.bind(this)
			.then(this.addFlags)
			.then(this.processOptions)
			.then(this.actionRequest)
			.then(this.constructPayload)
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

	return QueryBuilder;
})();

/* Actions */
var actions = {

	/* NOTICE:
	 * When an actions request or response does nothing, comment the function out.
	 * Will increase performance by cutting out an unnecessary function execution.
	*/

	API_AddField: {
		// request: function(context){
		// 	return Promise.resolve();
		// },
		// response: function(context, result){
		// 	return Promise.resolve(result);
		// }
	},
	API_AddGroupToRole: {
		// request: function(context){
		// 	return Promise.resolve();
		// },
		// response: function(context, result){
		// 	return Promise.resolve(result);
		// }
	},
	API_AddRecord: {
		// request: function(context){
		// 	return Promise.resolve();
		// },
		// response: function(context, result){
		// 	return Promise.resolve(result);
		// }
	},
	API_AddReplaceDBPage: {
		// request: function(context){
		// 	return Promise.resolve();
		// },
		// response: function(context, result){
		// 	return Promise.resolve(result);
		// }
	},
	API_AddSubGroup: {
		// request: function(context){
		// 	return Promise.resolve();
		// },
		// response: function(context, result){
		// 	return Promise.resolve(result);
		// }
	},
	API_AddUserToGroup: {
		// request: function(context){
		// 	return Promise.resolve();
		// },
		// response: function(context, result){
		// 	return Promise.resolve(result);
		// }
	},
	API_AddUserToRole: {
		// request: function(context){
		// 	return Promise.resolve();
		// },
		// response: function(context, result){
		// 	return Promise.resolve(result);
		// }
	},
	API_Authenticate: {
		request: function(context){
			// API_Authenticate can only happen over SSL
			context.settings.useSSL = true;

			return Promise.resolve();
		},
		response: function(context, result){
			context.parent.settings.ticket = result.ticket;
			context.parent.settings.username = context.options.username;
			context.parent.settings.password = context.options.password;

			return Promise.resolve(result);
		}
	},
	API_ChangeGroupInfo: {
		// request: function(context){
		// 	return Promise.resolve();
		// },
		// response: function(context, result){
		// 	return Promise.resolve(result);
		// }
	},
	API_ChangeManager: {
		// request: function(context){
		// 	return Promise.resolve();
		// },
		// response: function(context, result){
		// 	return Promise.resolve(result);
		// }
	},
	API_ChangeRecordOwner: {
		// request: function(context){
		// 	return Promise.resolve();
		// },
		// response: function(context, result){
		// 	return Promise.resolve(result);
		// }
	},
	API_ChangeUserRole: {
		// request: function(context){
		// 	return Promise.resolve();
		// },
		// response: function(context, result){
		// 	return Promise.resolve(result);
		// }
	},
	API_CloneDatabase: {
		// request: function(context){
		// 	return Promise.resolve();
		// },
		// response: function(context, result){
		// 	return Promise.resolve(result);
		// }
	},
	API_CopyGroup: {
		// request: function(context){
		// 	return Promise.resolve();
		// },
		response: function(context, result){
			if(result.group){
				result.group.id = result.group.$.id;

				delete result.group.$;
			}

			return Promise.resolve(result);
		}
	},
	API_CopyMasterDetail: {
		// request: function(context){
		// 	return Promise.resolve();
		// },
		// response: function(context, result){
		// 	return Promise.resolve(result);
		// }
	},
	API_CreateDatabase: {
		// request: function(context){
		// 	return Promise.resolve();
		// },
		// response: function(context, result){
		// 	return Promise.resolve(result);
		// }
	},
	API_CreateGroup: {
		// request: function(context){
		// 	return Promise.resolve();
		// },
		response: function(context, result){
			if(result.group){
				result.group.id = result.group.$.id;

				delete result.group.$;
			}

			return Promise.resolve(result);
		}
	},
	API_CreateTable: {
		// request: function(context){
		// 	return Promise.resolve();
		// },
		// response: function(context, result){
		// 	return Promise.resolve(result);
		// }
	},
	API_DeleteDatabase: {
		// request: function(context){
		// 	return Promise.resolve();
		// },
		// response: function(context, result){
		// 	return Promise.resolve(result);
		// }
	},
	API_DeleteField: {
		// request: function(context){
		// 	return Promise.resolve();
		// },
		// response: function(context, result){
		// 	return Promise.resolve(result);
		// }
	},
	API_DeleteGroup: {
		// request: function(context){
		// 	return Promise.resolve();
		// },
		// response: function(context, result){
		// 	return Promise.resolve(result);
		// }
	},
	API_DeleteRecord: {
		// request: function(context){
		// 	return Promise.resolve();
		// },
		// response: function(context, result){
		// 	return Promise.resolve(result);
		// }
	},
	API_DoQuery: {
		request: function(context){
			if(!context.options.hasOwnProperty('returnPercentage') && context.parent.settings.flags.returnPercentage){
				context.options.returnPercentage = 1;
			}

			if(!context.options.hasOwnProperty('fmt') && context.parent.settings.flags.fmt){
				context.options.fmt = context.parent.settings.flags.fmt;
			}

			if(!context.options.hasOwnProperty('includeRids') && context.parent.settings.flags.includeRids){
				context.options.includeRids = 1;
			}

			return Promise.resolve();
		},
		response: function(context, result){
			var unparsedItems = [],
				i = 0, l = 0,
				o = 0, k = 0,
				parsedItems = [],
				unparsedItem = {},
				parsedItem = {},
				items = [],
				item = {},
				id = 0;

			if(context.options.hasOwnProperty('fmt') && context.options.fmt === 'structured'){
				/* XML is _so_ butt ugly... Let's try to make some sense of it
				 * Turn this:
				 * 	{
				 * 		$: { rid: 1 },
				 * 		f: [
				 * 			{ $: { id: 3 }, _: 1 } ],
				 * 			{ $: { id: 6 }, _: 'Test Value' }
				 * 			{ $: { id: 7 }, _: 'filename.png', url: 'https://www.quickbase.com/' }
				 * 		]
				 * 	}
				 *
				 * Into this:
				 * 	{
				 * 		3: 1,
				 * 		6: 'Test Value',
				 * 		7: {
				 * 			filename: 'filename.png',
				 * 			url: 'https://www.quickbase.com/'
				 * 		}
				 * 	}
				*/

				unparsedItems = result.table.records;
				l = unparsedItems.length;

				if(l !== 0){
					for(; i < l; ++i){
						unparsedItem = unparsedItems[i];
						parsedItem = {};

						if(context.options.includeRids){
							parsedItem.rid = unparsedItem.$.rid;
						}

						for(o = 0, k = unparsedItem.f.length; o < k; ++o){
							item = unparsedItem.f[o];
							id = item.$.id;

							if(item.hasOwnProperty('url')){
								parsedItem[id] = {
									filename: item._,
									url: item.url
								};
							}else{
								parsedItem[id] = item._;
							}
						}

						parsedItems.push(parsedItem);
					}

					result.table.records = parsedItems;
				}

				unparsedItems = result.table.queries;
				l = unparsedItems.length;

				if(l !== 0){
					parsedItems = [];

					for(i = 0; i < l; ++i){
						unparsedItem = unparsedItems[i];

						unparsedItem.id = unparsedItem.$.id;

						delete unparsedItem.$;

						parsedItems.push(unparsedItem);
					}

					result.table.queries = parsedItems;
				}

				unparsedItems = result.table.fields;
				l = unparsedItems.length;

				if(l !== 0){
					parsedItems = [];

					for(i = 0; i < l; ++i){
						unparsedItem = unparsedItems[i];

						items = Object.keys(unparsedItem.$);

						for(o = 0, k = items.length; o < k; ++o){
							unparsedItem[items[o]] = unparsedItem.$[items[o]];
						}

						delete unparsedItem.$;

						parsedItems.push(unparsedItem);
					}

					result.table.fields = parsedItems;
				}
			}else
			if(context.options.includeRids){
				for(i = 0, l = result.record.length; i < l; ++i){
					result.record[i].rid = result.record[i].$.rid;

					delete result.record[i].$;
				}
			}

			return Promise.resolve(result);
		}
	},
	API_DoQueryCount: {
		// request: function(context){
		// 	return Promise.resolve();
		// },
		// response: function(context, result){
		// 	return Promise.resolve(result);
		// }
	},
	API_EditRecord: {
		// request: function(context){
		// 	return Promise.resolve();
		// },
		// response: function(context, result){
		// 	return Promise.resolve(result);
		// }
	},
	API_FieldAddChoices: {
		// request: function(context){
		// 	return Promise.resolve();
		// },
		// response: function(context, result){
		// 	return Promise.resolve(result);
		// }
	},
	API_FieldRemoveChoices: {
		// request: function(context){
		// 	return Promise.resolve();
		// },
		// response: function(context, result){
		// 	return Promise.resolve(result);
		// }
	},
	API_FindDBByName: {
		// request: function(context){
		// 	return Promise.resolve();
		// },
		// response: function(context, result){
		// 	return Promise.resolve(result);
		// }
	},
	API_GenAddRecordForm: {
		// request: function(context){
		// 	return Promise.resolve();
		// },
		// response: function(context, result){
		// 	return Promise.resolve(result);
		// }
	},
	API_GenResultsTable: {
		// request: function(context){
		// 	return Promise.resolve();
		// },
		// response: function(context, result){
		// 	return Promise.resolve(result);
		// }
	},
	API_GetAncestorInfo: {
		// request: function(context){
		// 	return Promise.resolve();
		// },
		// response: function(context, result){
		// 	return Promise.resolve(result);
		// }
	},
	API_GetAppDTMInfo: {
		// request: function(context){
		// 	return Promise.resolve();
		// },
		response: function(context, result){
			if(result.app){
				result.app = flattenXMLAttributes(result.app);
			}

			if(result.tables){
				for(var i = 0, l = result.tables.length; i < l; ++i){
					result.tables[i] = flattenXMLAttributes(result.tables[i]);
				}
			}

			return Promise.resolve(result);
		}
	},
	API_GetDBPage: {
		// request: function(context){
		// 	return Promise.resolve();
		// },
		// response: function(context, result){
		// 	return Promise.resolve(result);
		// }
	},
	API_GetDBInfo: {
		// request: function(context){
		// 	return Promise.resolve();
		// },
		// response: function(context, result){
		// 	return Promise.resolve(result);
		// }
	},
	API_GetDBVar: {
		// request: function(context){
		// 	return Promise.resolve();
		// },
		// response: function(context, result){
		// 	return Promise.resolve(result);
		// }
	},
	API_GetGroupRole: {
		// request: function(context){
		// 	return Promise.resolve();
		// },
		response: function(context, result){
			if(result.roles){
				for(var i = 0, l = result.roles.length; i < l; ++i){
					result.roles[i] = {
						id: result.roles[i].$.id,
						name: result.roles[i]._
					};
				}
			}

			return Promise.resolve(result);
		}
	},
	API_GetNumRecords: {
		// request: function(context){
		// 	return Promise.resolve();
		// },
		// response: function(context, result){
		// 	return Promise.resolve(result);
		// }
	},
	API_GetSchema: {
		// request: function(context){
		// 	return Promise.resolve();
		// },
		// response: function(context, result){
		// 	return Promise.resolve(result);
		// }
	},
	API_GetRecordAsHTML: {
		// request: function(context){
		// 	return Promise.resolve();
		// },
		// response: function(context, result){
		// 	return Promise.resolve(result);
		// }
	},
	API_GetRecordInfo: {
		// request: function(context){
		// 	return Promise.resolve();
		// },
		// response: function(context, result){
		// 	return Promise.resolve(result);
		// }
	},
	API_GetRoleInfo: {
		// request: function(context){
		// 	return Promise.resolve();
		// },
		// response: function(context, result){
		// 	return Promise.resolve(result);
		// }
	},
	API_GetUserInfo: {
		// request: function(context){
		// 	return Promise.resolve();
		// },
		// response: function(context, result){
		// 	return Promise.resolve(result);
		// }
	},
	API_GetUserRole: {
		// request: function(context){
		// 	return Promise.resolve();
		// },
		response: function(context, result){
			if(result.roles){
				for(var i = 0, l = result.roles.length; ++i){
					result.roles[i] = flattenXMLAttributes(result.roles[i]);

					result.roles[i].access = {
						id: result.roles[i].access.$.id,
						name: result.roles[i].access._
					};

					delete result.roles[i].access.$;

					result.roles[i].member = {
						type: result.roles[i].member.$.type,
						name: result.roles[i].member._
					};

					delete result.roles[i].member.$;
				}
			}

			return Promise.resolve(result);
		}
	},
	API_GetUsersInGroup: {
		// request: function(context){
		// 	return Promise.resolve();
		// },
		response: function(context, result){
			if(result.group){
				result.group = flattenXMLAttributes(result.group);

				if(result.group.users){
					for(var i = 0, l = result.group.users.length; ++i){
						result.group.users[i] = flattenXMLAttributes(result.group.users[i]);
					}
				}

				if(result.group.managers){
					for(var i = 0, l = result.group.managers.length; ++i){
						result.group.managers[i] = flattenXMLAttributes(result.group.managers[i]);
					}
				}

				if(result.group.subgroups){
					for(var i = 0, l = result.group.subgroups.length; ++i){
						result.group.subgroups[i] = flattenXMLAttributes(result.group.subgroups[i]);
					}
				}
			}

			return Promise.resolve(result);
		}
	},
	API_GrantedDBs: {
		// request: function(context){
		// 	return Promise.resolve();
		// },
		// response: function(context, result){
		// 	return Promise.resolve(result);
		// }
	},
	API_GrantedDBsForGroup: {
		// request: function(context){
		// 	return Promise.resolve();
		// },
		// response: function(context, result){
		// 	return Promise.resolve(result);
		// }
	},
	API_GrantedGroups: {
		// request: function(context){
		// 	return Promise.resolve();
		// },
		response: function(context, result){
			if(result.groups){
				for(var i = 0, l = result.groups.length; ++i){
					result.groups[i] = flattenXMLAttributes(result.groups[i]);
				}
			}

			return Promise.resolve(result);
		}
	},
	API_ImportFromCSV: {
		// request: function(context){
		// 	return Promise.resolve();
		// },
		// response: function(context, result){
		// 	return Promise.resolve(result);
		// }
	},
	API_ProvisionUser: {
		// request: function(context){
		// 	return Promise.resolve();
		// },
		// response: function(context, result){
		// 	return Promise.resolve(result);
		// }
	},
	API_PurgeRecords: {
		// request: function(context){
		// 	return Promise.resolve();
		// },
		// response: function(context, result){
		// 	return Promise.resolve(result);
		// }
	},
	API_RemoveGroupFromRole: {
		// request: function(context){
		// 	return Promise.resolve();
		// },
		// response: function(context, result){
		// 	return Promise.resolve(result);
		// }
	},
	API_RemoveSubgroup: {
		// request: function(context){
		// 	return Promise.resolve();
		// },
		// response: function(context, result){
		// 	return Promise.resolve(result);
		// }
	},
	API_RemoveUserFromGroup: {
		// request: function(context){
		// 	return Promise.resolve();
		// },
		// response: function(context, result){
		// 	return Promise.resolve(result);
		// }
	},
	API_RemoveUserFromRole: {
		// request: function(context){
		// 	return Promise.resolve();
		// },
		// response: function(context, result){
		// 	return Promise.resolve(result);
		// }
	},
	API_RenameApp: {
		// request: function(context){
		// 	return Promise.resolve();
		// },
		// response: function(context, result){
		// 	return Promise.resolve(result);
		// }
	},
	API_RunImport: {
		// request: function(context){
		// 	return Promise.resolve();
		// },
		// response: function(context, result){
		// 	return Promise.resolve(result);
		// }
	},
	API_SendInvitation: {
		// request: function(context){
		// 	return Promise.resolve();
		// },
		// response: function(context, result){
		// 	return Promise.resolve(result);
		// }
	},
	API_SetDBVar: {
		// request: function(context){
		// 	return Promise.resolve();
		// },
		// response: function(context, result){
		// 	return Promise.resolve(result);
		// }
	},
	API_SetFieldProperties: {
		// request: function(context){
		// 	return Promise.resolve();
		// },
		// response: function(context, result){
		// 	return Promise.resolve(result);
		// }
	},
	API_SetKeyField: {
		// request: function(context){
		// 	return Promise.resolve();
		// },
		// response: function(context, result){
		// 	return Promise.resolve(result);
		// }
	},
	API_SignOut: {
		// request: function(context){
		// 	return Promise.resolve();
		// },
		// response: function(context, result){
		// 	return Promise.resolve(result);
		// }
	},
	API_UploadFile: {
		// request: function(context){
		// 	return Promise.resolve();
		// },
		// response: function(context, result){
		// 	return Promise.resolve(result);
		// }
	},
	API_UserRoles: {
		// request: function(context){
		// 	return Promise.resolve();
		// },
		response: function(context, result){
			if(result.users){
				result.users = flattenXMLAttributes(result.users);
			}

			return Promise.resolve(result);
		}
	},
	default: {
		/*
		request: function(context){
			// Do stuff prior to the request

			return Promise.resolve();
		},
		response: function(context, result){
			// Do Stuff with the result before resolving the api call

			return Promise.resolve(result);
		}
		*/
	}
};

/* Option Handling */
var prepareOptions = {

	/* NOTICE:
	 * When an option is a simple return of the value given, comment the function out.
	 * This will increase performance, cutting out an unnecessary function execution.
	*/

	/* Common to All */
	// apptoken: function(val){
	// 	return val;
	// },

	// dbid: function(val){
	// 	return val;
	// },

	// ticket: function(val){
	// 	return val;
	// },

	// udata: function(val){
	// 	return val;
	// },

	/* API Specific Options */

	/* API_ChangeGroupInfo, API_CreateGroup */
	// accountId: function(val){
	// 	return val;
	// },

	/* API_AddField */
	// add_to_forms: function(val){
	// 	return val;
	// },

	/* API_GrantedDBs */
	// adminOnly: function(val){
	// 	return val;
	// },

	/* API_GrantedGroups */
	// adminonly: function(val){
	// 	return val;
	// },

	/* API_SetFieldProperties */
	// allow_new_choices: function(val){
	// 	return val;
	// },

	/* API_AddUserToGroup */
	// allowAdminAccess: function(val){
	// 	return val;
	// },

	/* API_SetFieldProperties */
	// allowHTML: function(val){
	// 	return val;
	// },

	/* API_RemoveGroupFromRole */
	// allRoles: function(val){
	// 	return val;
	// },

	/* API_SetFieldProperties */
	// appears_by_default: function(val){
	// 	return val;
	// },

	/* API_SetFieldProperties */
	// 'append-only': function(val){
	// 	return val;
	// },

	/* API_SetFieldProperties */
	// blank_is_zero: function(val){
	// 	return val;
	// },

	/* API_SetFieldProperties */
	// bold: function(val){
	// 	return val;
	// },

	/* API_FieldAddChoices, API_FieldRemoveChoices */
	// choice: function(val){
	// 	return val;
	// },

	/* API_SetFieldProperties */
	// choices: function(val){
	// 	return val;
	// },

	/* API_DoQuery, API_GenResultsTable, API_ImportFromCSV */
	clist: function(val){
		return val instanceof Array ? val.join('.') : val;
	},

	/* API_ImportFromCSV */
	clist_output: function(val){
		return val instanceof Array ? val.join('.') : val;
	},

	/* API_SetFieldProperties */
	// comma_start: function(val){
	// 	return val;
	// },

	/* API_CopyMasterDetail */
	// copyfid: function(val){
	// 	return val;
	// },

	/* API_CreateDatabase */
	// createapptoken: function(val){
	// 	return val;
	// },

	/* API_SetFieldProperties */
	// currency_format: function(val){
	// 	return val;
	// },

	/* API_SetFieldProperties */
	// currency_symbol: function(val){
	// 	return val;
	// },

	/* API_CreateDatabase */
	// dbdesc: function(val){
	// 	return val;
	// },

	/* API_CreateDatabase, API_FindDBByName */
	// dbname: function(val){
	// 	return val;
	// },

	/* API_SetFieldProperties */
	// decimal_places: function(val){
	// 	return val;
	// },

	/* API_SetFieldProperties */
	// default_today: function(val){
	// 	return val;
	// },

	/* API_SetFieldProperties */
	// default_value: function(val){
	// 	return val;
	// },

	/* API_ChangeGroupInfo, API_CopyGroup, API_CreateGroup */
	// description: function(val){
	// 	return val;
	// },

	/* API_CopyMasterDetail */
	// destrid: function(val){
	// 	return val;
	// },

	/* API_GetRecordAsHTML */
	// dfid: function(val){
	// 	return val;
	// },

	/* API_SetFieldProperties */
	// display_as_button: function(val){
	// 	return val;
	// },

	/* API_SetFieldProperties */
	// display_dow: function(val){
	// 	return val;
	// },

	/* API_SetFieldProperties */
	// display_month: function(val){
	// 	return val;
	// },

	/* API_SetFieldProperties */
	// display_relative: function(val){
	// 	return val;
	// },

	/* API_SetFieldProperties */
	// display_time: function(val){
	// 	return val;
	// },

	/* API_SetFieldProperties */
	// display_zone: function(val){
	// 	return val;
	// },

	/* API_AddRecord, API_EditRecord */
	// disprec: function(val){
	// 	return val;
	// },

	/* API_SetFieldProperties */
	// does_average: function(val){
	// 	return val;
	// },

	/* API_SetFieldProperties */
	// does_total: function(val){
	// 	return val;
	// },

	/* API_SetFieldProperties */
	// doesdatacopy: function(val){
	// 	return val;
	// },

	/* API_GetUserInfo, API_ProvisionUser */
	// email: function(val){
	// 	return val;
	// },

	/* API_CloneDatabase */
	// excludefiles: function(val){
	// 	return val;
	// },

	/* API_GrantedDBs */
	// excludeparents: function(val){
	// 	return val;
	// },

	/* API_AddRecord, API_EditRecord */
	// fform: function(val){
	// 	return val;
	// },

	/* API_DeleteField, API_FieldAddChoices, API_FieldRemoveChoices, API_SetFieldProperties, API_SetKeyField */
	// fid: function(val){
	// 	return val;
	// },

	/* API_AddRecord, API_EditRecord, API_GenAddRecordForm, API_UploadFile */
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
	},

	/* API_SetFieldProperties */
	// fieldhelp: function(val){
	// 	return val;
	// },

	/* API_SetFieldProperties */
	// find_enabled: function(val){
	// 	return val;
	// },

	/* API_DoQuery */
	// fmt: function(val){
	// 	return val;
	// },

	/* API_ProvisionUser */
	// fname: function(val){
	// 	return val;
	// },

	/* API_SetFieldProperties */
	// formula: function(val){
	// 	return val;
	// },

	/* API_CopyGroup */
	// gacct: function(val){
	// 	return val;
	// },

	/* API_AddGroupToRole, API_AddSubGroup, API_AddUserToGroup, API_ChangeGroupInfo, API_CopyGroup, API_DeleteGroup, API_GetGroupRole, API_GetUsersInGroup, API_GrantedDBsForGroup, API_RemoveGroupFromRole, API_RemoveSubgroup, API_RemoveUserFromGroup */
	// gid: function(val){
	// 	return val;
	// },

	/* API_SetFieldProperties */
	// has_extension: function(val){
	// 	return val;
	// },

	/* API_Authenticate */
	// hours: function(val){
	// 	return val;
	// },

	/* API_RunImport */
	// id: function(val){
	// 	return val;
	// },

	/* API_AddRecord, API_EditRecord */
	// ignoreError: function(val){
	// 	return val;
	// },

	/* API_GetUserRole */
	// inclgrps: function(val){
	// 	return val;
	// },

	/* API_GetUsersInGroup */
	// includeAllMgrs: function(val){
	// 	return val;
	// },

	/* API_GrantedDBs */
	// includeancestors: function(val){
	// 	return val;
	// },

	/* API_DoQuery */
	// includeRids: function(val){
	// 	return val;
	// },

	/* API_GenResultsTable */
	// jht: function(val){
	// 	return val;
	// },

	/* API_GenResultsTable */
	// jsa: function(val){
	// 	return val;
	// },

	/* API_CloneDatabase */
	// keepData: function(val){
	// 	return val;
	// },

	/* API_ChangeRecordOwner, API_DeleteRecord, API_EditRecord, API_GetRecordInfo */
	// key: function(val){
	// 	return val;
	// },

	/* API_AddField, API_SetFieldProperties */
	// label: function(val){
	// 	return val;
	// },

	/* API_ProvisionUser */
	// lname: function(val){
	// 	return val;
	// },

	/* API_SetFieldProperties */
	// maxlength: function(val){
	// 	return val;
	// },

	/* API_AddField */
	// mode: function(val){
	// 	return val;
	// },

	/* API_AddRecord, API_EditRecord, API_ImportFromCSV */
	// msInUTC: function(val){
	// 	return val;
	// },

	/* API_ChangeGroupInfo, API_CopyGroup, API_CreateGroup */
	// name: function(val){
	// 	return val;
	// },

	/* API_RenameApp */
	// newappname: function(val){
	// 	return val;
	// },

	/* API_CloneDatabase */
	// newdbdesc: function(val){
	// 	return val;
	// },

	/* API_CloneDatabase */
	// newdbname: function(val){
	// 	return val;
	// },

	/* API_ChangeManager */
	// newmgr: function(val){
	// 	return val;
	// },

	/* API_ChangeRecordOwner */
	// newowner: function(val){
	// 	return val;
	// },

	/* API_ChangeUserRole */
	// newroleid: function(val){
	// 	return val;
	// },

	/* API_SetFieldProperties */
	// no_wrap: function(val){
	// 	return val;
	// },

	/* API_SetFieldProperties */
	// numberfmt: function(val){
	// 	return val;
	// },

	/* API_DoQuery, API_GenResultsTable */
	options: function(val){
		return val instanceof Array ? val.join('.') : val;
	},

	/* API_AddReplaceDBPage */
	// pagebody: function(val){
	// 	return val;
	// },

	/* API_AddReplaceDBPage */
	// pageid: function(val){
	// 	return val;
	// },

	/* API_GetDBPage */
	// pageID: function(val){
	// 	return val;
	// },

	/* API_AddReplaceDBPage */
	// pagename: function(val){
	// 	return val;
	// },

	/* API_AddReplaceDBPage */
	// pagetype: function(val){
	// 	return val;
	// },

	/* API_FindDBByName */
	// ParentsOnly: function(val){
	// 	return val;
	// },

	/* API_Authenticate */
	// password: function(val){
	// 	return val;
	// },

	/* API_CreateTable */
	// pnoun: function(val){
	// 	return val;
	// },

	/* API_DoQuery, API_GenResultsTable, API_PurgeRecords */
	// qid: function(val){
	// 	return val;
	// },

	/* API_DoQuery, API_GenResultsTable, API_PurgeRecords */
	// qname: function(val){
	// 	return val;
	// },

	/* API_DoQuery, API_DoQueryCount, API_GenResultsTable, API_PurgeRecords */
	// query: function(val){
	// 	return val;
	// },

	/* API_ImportFromCSV */
	records_csv: function(val){
		return val instanceof Array ? val.join('\n') : val;
	},

	/* API_CopyMasterDetail */
	// recurse: function(val){
	// 	return val;
	// },

	/* API_CopyMasterDetail */
	// relfids: function(val){
	// 	return val;
	// },

	/* API_SetFieldProperties */
	// required: function(val){
	// 	return val;
	// },

	/* API_DoQuery */
	// returnpercentage: function(val){
	// 	return val;
	// },

	/* API_ChangeRecordOwner, API_DeleteRecord, API_EditRecord, API_GetRecordAsHTML, API_GetRecordInfo, API_UploadFile */
	// rid: function(val){
	// 	return val;
	// },

	/* API_AddGroupToRole, API_AddUserToRole, API_ChangeUserRole, API_ProvisionUser, API_RemoveGroupFromRole, API_RemoveUserFromRole */
	// roleid: function(val){
	// 	return val;
	// },

	/* API_ImportFromCSV */
	// skipfirst: function(val){
	// 	return val;
	// },

	/* API_DoQuery, API_GenResultsTable */
	slist: function(val){
		return val instanceof Array ? val.join('.') : val;
	},

	/* API_SetFieldProperties */
	// sort_as_given: function(val){
	// 	return val;
	// },

	/* API_CopyMasterDetail */
	// sourcerid: function(val){
	// 	return val;
	// },

	/* API_AddSubGroup, API_RemoveSubgroup */
	// subgroupid: function(val){
	// 	return val;
	// },

	/* API_CreateTable */
	// tname: function(val){
	// 	return val;
	// },

	/* API_AddField */
	// type: function(val){
	// 	return val;
	// },

	/* API_SetFieldProperties */
	// unique: function(val){
	// 	return val;
	// },

	/* API_EditRecord */
	// update_id: function(val){
	// 	return val;
	// },

	/* API_AddUserToGroup, API_AddUserToRole, API_ChangeUserRole, API_GetUserRole, API_GrantedGroups, API_RemoveUserFromGroup, API_RemoveUserFromRole, API_SendInvitation */
	// userid: function(val){
	// 	return val;
	// },

	/* API_Authenticate */
	// username: function(val){
	// 	return val;
	// },

	/* API_CloneDatabase */
	// usersandroles: function(val){
	// 	return val;
	// },

	/* API_SendInvitation */
	// usertext: function(val){
	// 	return val;
	// },

	/* API_SetDBVar */
	// value: function(val){
	// 	return val;
	// },

	/* API_GetDBVar, API_SetDBVar */
	// varname: function(val){
	// 	return val;
	// },

	/* API_SetFieldProperties */
	// width: function(val){
	// 	return val;
	// },

	/* API_GrantedDBs */
	// withembeddedtables: function(val){
	// 	return val;
	// }
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
if(typeof(module) !== 'undefined' && module.exports){
	module.exports = QuickBase;
}else
if(typeof(define) === 'function' && define.amd){
	define('QuickBase', [], function(){
		return QuickBase;
	});
}

if(typeof(global) !== 'undefined' && typeof(window) !== 'undefined' && global === window){
	global.QuickBase = QuickBase;
}
