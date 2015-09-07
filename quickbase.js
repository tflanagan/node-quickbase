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
let xml = require('xml2js'),
	http = require('http'),
	https = require('https'),
	Promise = require('bluebird');

/* Native Extensions */
if(!Object.hasOwnProperty('extend') && Object.extend === undefined){
	Object.defineProperty(Object.prototype, '_extend', {
		enumerable: false,
		value (source) {
			Object.getOwnPropertyNames(source).forEach((property) => {
				if(this.hasOwnProperty(property) && typeof(this[property]) === 'object'){
					this[property] = this[property].extend(source[property]);
				}else{
					Object.defineProperty(this, property, Object.getOwnPropertyDescriptor(source, property));
				}
			});

			return this;
		}
	});

	Object.defineProperty(Object.prototype, 'extend', {
		enumerable: false,
		value () {
			let args = new Array(arguments.length),
				i = 0, l = args.length;

			for(; i < l; ++i){
				args[i] = arguments[i];

				this._extend(args[i]);
			}

			return this;
		}
	});
}

/* Helpers */
let cleanXML = (xml) => {
	let isInt = /^-?\s*\d+$/,
		isDig = /^(-?\s*\d+\.?\d*)$/,
		radix = 10;

	Object.keys(xml).forEach((node) => {
		let value, singulars,
			l = -1, i = -1, s = -1, e = -1;

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
					l = parseInt(value, radix);

					if(Math.abs(l) <= 9007199254740991){
						xml[node] = l;
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
	});

	return xml;
};

let flattenXMLAttributes = (obj) => {
	if(obj.hasOwnProperty('$')){
		Object.keys(obj.$).forEach((property) => {
			obj[property] = obj.$[property];
		});

		delete obj.$;
	}

	return obj;
};

/* Error Handling */
class QuickbaseError extends Error {

	constructor (code, name, message) {
		super(name);

		this.code = code;
		this.name = name;
		this.message = message || '';

		return this;
	}

}

/* Main Class */
class QuickBase {

	constructor (options) {
		const defaults = {
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

		this.settings = ({}).extend(defaults, options || {});

		this.throttle = new Throttle(this.settings.connectionLimit, this.settings.errorOnConnectionLimit);

		return this;
	}

	api (action, options) {
		return Promise.using(this.throttle.acquire(), () => {
			return (new QueryBuilder(this, action, options || {})).run();
		});
	}

}

/* Throttle */
class Throttle {

	constructor (maxConnections, errorOnConnectionLimit) {
		this.maxConnections = maxConnections;
		this.errorOnConnectionLimit = errorOnConnectionLimit;

		this._numConnections = 0;
		this._pendingConnections = [];

		return this;
	}

	acquire () {
		return new Promise((resolve, reject) => {
			if(this._numConnections >= this.maxConnections){
				if(this.errorOnConnectionLimit){
					reject(new QuickbaseError(1001, 'No Connections Available', 'Maximum Number of Connections Reached'));
				}else{
					this._pendingConnections.push({
						resolve: resolve,
						reject: reject
					});
				}
			}else{
				++this._numConnections;

				resolve();
			}
		}).disposer(() => {
			--this._numConnections;

			if(this._pendingConnections.length > 0){
				++this._numConnections;

				this._pendingConnections.shift().resolve();
			}
		});
	}

}

/* Request Handling */
class QueryBuilder {

	constructor (parent, action, options) {
		this.parent = parent;
		this.action = action;
		this.options = options;
		this.settings = ({}).extend(parent.settings);

		this.nErr = 0;

		return this;
	}

	actionRequest () {
		let action = this.action;

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
	}

	actionResponse (result) {
		let action = this.action;

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
	}

	addFlags () {
		if(!this.options.hasOwnProperty('msInUTC') && this.settings.flags.msInUTC){
			this.options.msInUTC = 1;
		}

		if(!this.options.hasOwnProperty('appToken') && this.settings.appToken){
			this.options.apptoken = this.settings.appToken;
		}

		if(!this.options.hasOwnProperty('ticket') && this.settings.ticket){
			this.options.ticket = this.settings.ticket;
		}

		if(!this.options.hasOwnProperty('encoding') && this.settings.flags.encoding){
			this.options.encoding = this.settings.flags.encoding;
		}

		return Promise.resolve();
	}

	catchError (err) {
		++this.nErr;

		let parent = this.parent,
			parentSettings = parent.settings;

		if(this.nErr < this.settings.maxErrorRetryAttempts){
			if([1000, 1001].indexOf(err.code) !== -1){
				return Promise.bind(this)
					.then(this.processQuery)
					.then(this.actionResponse)
					.catch(this.catchError);
			}else
			if(
				err.code === 4 &&
				parentSettings.hasOwnProperty('username') && parentSettings.username !== '' &&
				parentSettings.hasOwnProperty('password') && parentSettings.password !== ''
			){
				return parent.api('API_Authenticate', {
					username: parentSettings.username,
					password: parentSettings.password
				}).then((results) => {
					parentSettings.ticket = results.ticket;
					this.settings.ticket = results.ticket;
					this.options.ticket = results.ticket;

					return results;
				})
					.bind(this)
					.then(this.addFlags)
					.then(this.constructPayload)
					.then(this.processQuery)
					.then(this.actionResponse)
					.catch(this.catchError);
			}
		}

		return Promise.reject(err);
	}

	constructPayload () {
		let builder = new xml.Builder({
			rootName: 'qdbapi',
			xmldec: {
				encoding: this.options.encoding
			},
			renderOpts: {
				pretty: false
			}
		});

		this.payload = '';

		if(this.settings.flags.useXML === true){
			this.payload = builder.buildObject(this.options);
		}else{
			Object.keys().forEach((arg) => {
				this.payload += '&' + arg + '=' + encodeURIComponent(this.options[arg]);
			});
		}

		return Promise.resolve();
	}

	processQuery () {
		let settings = this.settings;

		return new Promise((resolve, reject) => {
			let reqOpts = {
					hostname: [ settings.realm, settings.domain ].join('.'),
					port: settings.useSSL ? 443 : 80,
					path: '/db/' + (this.options.dbid || 'main') + '?act=' + this.action + (!settings.flags.useXML ? this.payload : ''),
					method: settings.flags.useXML ? 'POST' : 'GET',
					headers: {
						'Content-Type': 'application/xml',
						'QUICKBASE-ACTION': this.action
					},
					agent: false
				},
				protocol = settings.useSSL ? https : http,
				request = protocol.request(reqOpts, (response) => {
					let xmlResponse = '';

					response.on('data', (chunk) => {
						xmlResponse += chunk;
					});

					response.on('end', () => {
						if(response.headers['content-type'] === 'application/xml'){
							xml.parseString(xmlResponse, {
								async: true
							}, (err, result) => {
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
				request.write(this.payload);
			}

			request.on('error', (err) => {
				reject(err);
			});

			request.end();
		});
	}

	processOptions () {
		if(this.options.hasOwnProperty('fields')){
			this.options.field = this.options.fields;

			delete this.options.fields;
		}

		let newOpts = {};

		Object.keys(this.options).forEach((option) => {
			newOpts[option] = prepareOptions.hasOwnProperty(option) ? prepareOptions[option](this.options[option]) : newOpts[option] = this.options[option];
		});

		this.options = newOpts;

		return Promise.resolve();
	}

	run () {
		return Promise.bind(this)
			.then(this.addFlags)
			.then(this.processOptions)
			.then(this.actionRequest)
			.then(this.constructPayload)
			.then(this.processQuery)
			.then(this.actionResponse)
			.catch(this.catchError);
	}

}

/* XML Node Parsers */
let xmlNodeParsers = {
	fields (val) {
		if(!(val instanceof Array)){
			// Support Case #480141
			// XML returned from QuickBase appends "\r\n      "
			if(val === ''){
				val = [];
			}else{
				val = [ val ];
			}
		}

		return val.map((value) => {
			value = flattenXMLAttributes(value);

			// Support Case #480141
			// XML returned from QuickBase inserts '<br />' after every line in formula fields.
			if(typeof(value.formula) === 'object'){
				value.formula = value.formula._;
			}

			return value;
		});
	},
	group (val) {
		val = flattenXMLAttributes(val);

		if(val.hasOwnProperty('users')){
			val.users = val.users.map((user) => {
				return flattenXMLAttributes(user);
			});
		}

		if(val.hasOwnProperty('managers')){
			val.managers = val.managers.map((manager) => {
				return flattenXMLAttributes(manager);
			});
		}

		if(val.hasOwnProperty('subgroups')){
			val.subgroups = val.subgroups.map((subgroup) => {
				return flattenXMLAttributes(subgroup);
			});
		}

		return val;
	},
	lusers (val) {
		if(!(val instanceof Array)){
			// Support Case #480141
			// XML returned from QuickBase appends "\r\n      "
			if(val === ''){
				val = [];
			}else{
				val = [ val ];
			}
		}

		return val.map((value) => {
			return {
				id: value.$.id,
				name: value._
			}
		});
	},
	queries (val) {
		if(!(val instanceof Array)){
			// Support Case #480141
			// XML returned from QuickBase appends "\r\n      "
			if(val === ''){
				val = [];
			}else{
				val = [ val ];
			}
		}

		return val.map((value) => {
			return flattenXMLAttributes(value);
		});
	},
	roles (val) {
		if(!(val instanceof Array)){
			// Support Case #480141
			// XML returned from QuickBase appends "\r\n      "
			if(val === ''){
				val = [];
			}else{
				val = [ val ];
			}
		}

		return val.map((value) => {
			let ret = {
				id: value.$.id
			}

			if(value._){
				ret.name = value._;
			}else{
				if(value.hasOwnProperty('access')){
					ret.access = {
						id: value.access.$.id,
						name: value.access._
					};
				}

				if(value.hasOwnProperty('member')){
					ret.member = {
						type: value.member.$.type,
						name: value.member._
					};
				}
			}

			return ret;
		});
	},
	variables (val) {
		val = val.var;

		if(!(val instanceof Array)){
			// Support Case #480141
			// XML returned from QuickBase appends "\r\n      "
			if(val === ''){
				val = [];
			}else{
				val = [ val ];
			}
		}

		let newVars = {};

		val.forEach((value) => {
			newVars[value.$.name] = value._;
		});

		return newVars;
	}
};

/* Actions */
let actions = {

	/* NOTICE:
	 * When an actions request or response does nothing, comment the function out.
	 * Will increase performance by cutting out an unnecessary function execution.
	*/

	// API_AddField: {
		// request (context) {
		// 	return Promise.resolve();
		// },
		// response (context, result) {
		// 	return Promise.resolve(result);
		// }
	// },
	// API_AddGroupToRole: {
		// request (context) {
		// 	return Promise.resolve();
		// },
		// response (context, result) {
		// 	return Promise.resolve(result);
		// }
	// },
	// API_AddRecord: {
		// request (context) {
		// 	return Promise.resolve();
		// },
		// response (context, result) {
		// 	return Promise.resolve(result);
		// }
	// },
	// API_AddReplaceDBPage: {
		// request (context) {
		// 	return Promise.resolve();
		// },
		// response (context, result) {
		// 	return Promise.resolve(result);
		// }
	// },
	// API_AddSubGroup: {
		// request (context) {
		// 	return Promise.resolve();
		// },
		// response (context, result) {
		// 	return Promise.resolve(result);
		// }
	// },
	// API_AddUserToGroup: {
		// request (context) {
		// 	return Promise.resolve();
		// },
		// response (context, result) {
		// 	return Promise.resolve(result);
		// }
	// },
	// API_AddUserToRole: {
		// request (context) {
		// 	return Promise.resolve();
		// },
		// response (context, result) {
		// 	return Promise.resolve(result);
		// }
	// },
	API_Authenticate: {
		request (context) {
			// API_Authenticate can only happen over SSL
			context.settings.useSSL = true;

			return Promise.resolve();
		},
		response (context, result) {
			context.parent.settings.ticket = result.ticket;
			context.parent.settings.username = context.options.username;
			context.parent.settings.password = context.options.password;

			return Promise.resolve(result);
		}
	},
	// API_ChangeGroupInfo: {
		// request (context) {
		// 	return Promise.resolve();
		// },
		// response (context, result) {
		// 	return Promise.resolve(result);
		// }
	// },
	// API_ChangeManager: {
		// request (context) {
		// 	return Promise.resolve();
		// },
		// response (context, result) {
		// 	return Promise.resolve(result);
		// }
	// },
	// API_ChangeRecordOwner: {
		// request (context) {
		// 	return Promise.resolve();
		// },
		// response (context, result) {
		// 	return Promise.resolve(result);
		// }
	// },
	// API_ChangeUserRole: {
		// request (context) {
		// 	return Promise.resolve();
		// },
		// response (context, result) {
		// 	return Promise.resolve(result);
		// }
	// },
	// API_CloneDatabase: {
		// request (context) {
		// 	return Promise.resolve();
		// },
		// response (context, result) {
		// 	return Promise.resolve(result);
		// }
	// },
	API_CopyGroup: {
		// request (context) {
		// 	return Promise.resolve();
		// },
		response (context, result) {
			if(result.hasOwnProperty('group')){
				result.group = xmlNodeParsers.group(result.group);
			}

			return Promise.resolve(result);
		}
	},
	// API_CopyMasterDetail: {
		// request (context) {
		// 	return Promise.resolve();
		// },
		// response (context, result) {
		// 	return Promise.resolve(result);
		// }
	// },
	// API_CreateDatabase: {
		// request (context) {
		// 	return Promise.resolve();
		// },
		// response (context, result) {
		// 	return Promise.resolve(result);
		// }
	// },
	API_CreateGroup: {
		// request (context) {
		// 	return Promise.resolve();
		// },
		response (context, result) {
			if(result.hasOwnProperty('group')){
				result.group = xmlNodeParsers.group(result.group);
			}

			return Promise.resolve(result);
		}
	},
	// API_CreateTable: {
		// request (context) {
		// 	return Promise.resolve();
		// },
		// response (context, result) {
		// 	return Promise.resolve(result);
		// }
	// },
	// API_DeleteDatabase: {
		// request (context) {
		// 	return Promise.resolve();
		// },
		// response (context, result) {
		// 	return Promise.resolve(result);
		// }
	// },
	// API_DeleteField: {
		// request (context) {
		// 	return Promise.resolve();
		// },
		// response (context, result) {
		// 	return Promise.resolve(result);
		// }
	// },
	// API_DeleteGroup: {
		// request (context) {
		// 	return Promise.resolve();
		// },
		// response (context, result) {
		// 	return Promise.resolve(result);
		// }
	// },
	// API_DeleteRecord: {
		// request (context) {
		// 	return Promise.resolve();
		// },
		// response (context, result) {
		// 	return Promise.resolve(result);
		// }
	// },
	API_DoQuery: {
		request (context) {
			if(!context.options.hasOwnProperty('returnPercentage') && context.settings.flags.returnPercentage){
				context.options.returnPercentage = 1;
			}

			if(!context.options.hasOwnProperty('fmt') && context.settings.flags.fmt){
				context.options.fmt = context.settings.flags.fmt;
			}

			if(!context.options.hasOwnProperty('includeRids') && context.settings.flags.includeRids){
				context.options.includeRids = 1;
			}

			return Promise.resolve();
		},
		response (context, result) {
			let i = 0, l = 0;

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

				if(result.table.hasOwnProperty('records')){
					if(!(result.table.records instanceof Array)){
						// Support Case #480141
						// XML returned from QuickBase appends "\r\n      "
						if(result.table.records === ''){
							result.table.records = [];
						}else{
							result.table.records = [ result.table.records ];
						}
					}

					result.table.records = result.table.records.map((record) => {
						let ret = {};

						if(!(record.f instanceof Array)){
							record.f = [ record.f ];
						}

						if(context.options.includeRids){
							ret.rid = record.$.rid;
						}

						record.f.forEach((field) => {
							let fid = field.$.id;

							if(field.hasOwnProperty('url')){
								ret[fid] = {
									filename: field._,
									url: field.url
								};
							}else{
								ret[fid] = field._;
							}
						});

						return ret;
					});
				}

				if(result.table.hasOwnProperty('queries')){
					result.table.queries = xmlNodeParsers.queries(result.table.queries);
				}

				if(result.table.hasOwnProperty('fields')){
					result.table.fields = xmlNodeParsers.fields(result.table.fields);
				}

				if(result.table.hasOwnProperty('variables')){
					result.table.variables = xmlNodeParsers.variables(result.table.variables);
				}

				if(result.table.hasOwnProperty('lusers')){
					result.table.lusers = xmlNodeParsers.lusers(result.table.lusers);
				}
			}else{
				if(!(result.record instanceof Array)){
					// Support Case #480141
					// XML returned from QuickBase appends "\r\n      "
					if(result.record === ''){
						result.record = [];
					}else{
						result.record = [ result.record ];
					}
				}

				result.records = result.record;

				delete result.record;

				if(context.options.includeRids){
					result.records.forEach((record) => {
						record.rid = record.$.rid;

						delete record.$;
					});
				}

				if(result.hasOwnProperty('chdbids')){
					if(!(result.chdbids instanceof Array)){
						// Support Case #480141
						// XML returned from QuickBase appends "\r\n      "
						if(result.chdbids === ''){
							result.chdbids = [];
						}
					}
				}

				if(result.hasOwnProperty('variables')){
					if(!(result.variables instanceof Array)){
						// Support Case #480141
						// XML returned from QuickBase appends "\r\n      "
						if(result.variables === ''){
							result.variables = {};
						}
					}
				}
			}

			return Promise.resolve(result);
		}
	},
	// API_DoQueryCount: {
		// request (context) {
		// 	return Promise.resolve();
		// },
		// response (context, result) {
		// 	return Promise.resolve(result);
		// }
	// },
	// API_EditRecord: {
		// request (context) {
		// 	return Promise.resolve();
		// },
		// response (context, result) {
		// 	return Promise.resolve(result);
		// }
	// },
	// API_FieldAddChoices: {
		// request (context) {
		// 	return Promise.resolve();
		// },
		// response (context, result) {
		// 	return Promise.resolve(result);
		// }
	// },
	// API_FieldRemoveChoices: {
		// request (context) {
		// 	return Promise.resolve();
		// },
		// response (context, result) {
		// 	return Promise.resolve(result);
		// }
	// },
	// API_FindDBByName: {
		// request (context) {
		// 	return Promise.resolve();
		// },
		// response (context, result) {
		// 	return Promise.resolve(result);
		// }
	// },
	// API_GenAddRecordForm: {
		// request (context) {
		// 	return Promise.resolve();
		// },
		// response (context, result) {
		// 	return Promise.resolve(result);
		// }
	// },
	// API_GenResultsTable: {
		// request (context) {
		// 	return Promise.resolve();
		// },
		// response (context, result) {
		// 	return Promise.resolve(result);
		// }
	// },
	// API_GetAncestorInfo: {
		// request (context) {
		// 	return Promise.resolve();
		// },
		// response (context, result) {
		// 	return Promise.resolve(result);
		// }
	// },
	API_GetAppDTMInfo: {
		// request (context) {
		// 	return Promise.resolve();
		// },
		response (context, result) {
			if(result.hasOwnProperty('app')){
				result.app = flattenXMLAttributes(result.app);
			}

			if(result.hasOwnProperty('tables')){
				if(!(result.tables instanceof Array)){
					result.tables = [ result.tables ];
				}

				result.tables = result.tables.map((table) => {
					return flattenXMLAttributes(table);
				});
			}

			return Promise.resolve(result);
		}
	},
	// API_GetDBPage: {
		// request (context) {
		// 	return Promise.resolve();
		// },
		// response (context, result) {
		// 	return Promise.resolve(result);
		// }
	// },
	// API_GetDBInfo: {
		// request (context) {
		// 	return Promise.resolve();
		// },
		// response (context, result) {
		// 	return Promise.resolve(result);
		// }
	// },
	// API_GetDBVar: {
		// request (context) {
		// 	return Promise.resolve();
		// },
		// response (context, result) {
		// 	return Promise.resolve(result);
		// }
	// },
	API_GetGroupRole: {
		// request (context) {
		// 	return Promise.resolve();
		// },
		response (context, result) {
			if(result.hasOwnProperty('roles')){
				result.roles = xmlNodeParsers.roles(result.roles);
			}

			return Promise.resolve(result);
		}
	},
	// API_GetNumRecords: {
		// request (context) {
		// 	return Promise.resolve();
		// },
		// response (context, result) {
		// 	return Promise.resolve(result);
		// }
	// },
	API_GetSchema: {
		// request (context) {
		// 	return Promise.resolve();
		// },
		response (context, result) {
			let i = 0, l = 0;

			if(result.table.hasOwnProperty('chdbids')){
				if(!(result.table.chdbids instanceof Array)){
					// Support Case #480141
					// XML returned from QuickBase appends "\r\n      "
					if(result.table.chdbids === ''){
						result.table.chdbids = [];
					}else{
						result.table.chdbids = [ result.table.chdbids ];
					}
				}

				result.table.chdbids = result.table.chdbids.map((chdbid) => {
					return {
						name: chdbid.$.name,
						dbid: chdbid._
					}
				});
			}

			if(result.table.hasOwnProperty('variables')){
				result.table.variables = xmlNodeParsers.variables(result.table.variables);
			}

			if(result.table.hasOwnProperty('queries')){
				result.table.queries = xmlNodeParsers.queries(result.table.queries);
			}

			if(result.table.hasOwnProperty('fields')){
				result.table.fields = xmlNodeParsers.fields(result.table.fields);
			}

			return Promise.resolve(result);
		}
	},
	// API_GetRecordAsHTML: {
		// request (context) {
		// 	return Promise.resolve();
		// },
		// response (context, result) {
		// 	return Promise.resolve(result);
		// }
	// },
	// API_GetRecordInfo: {
		// request (context) {
		// 	return Promise.resolve();
		// },
		// response (context, result) {
		// 	return Promise.resolve(result);
		// }
	// },
	API_GetRoleInfo: {
		// request (context) {
		// 	return Promise.resolve();
		// },
		response (context, result) {
			if(result.hasOwnProperty('roles')){
				result.roles = xmlNodeParsers.roles(result.roles);				
			}

			return Promise.resolve(result);
		}
	},
	API_GetUserInfo: {
		// request (context) {
		// 	return Promise.resolve();
		// },
		response (context, result) {
			if(result.hasOwnProperty('user')){
				result.user = flattenXMLAttributes(result.user);
			}

			return Promise.resolve(result);
		}
	},
	API_GetUserRole: {
		// request (context) {
		// 	return Promise.resolve();
		// },
		response (context, result) {
			if(result.hasOwnProperty('roles')){
				result.roles = xmlNodeParsers.roles(result.roles);
			}

			return Promise.resolve(result);
		}
	},
	API_GetUsersInGroup: {
		// request (context) {
		// 	return Promise.resolve();
		// },
		response (context, result) {
			if(result.hasOwnProperty('group')){
				result.group = xmlNodeParsers.group(result.group);
			}

			return Promise.resolve(result);
		}
	},
	API_GrantedDBs: {
		// request (context) {
		// 	return Promise.resolve();
		// },
		response (context, result) {
			if(result.hasOwnProperty('databases')){
				result.databases = result.databases.dbinfo;
			}

			return Promise.resolve(result);
		}
	},
	API_GrantedDBsForGroup: {
		// request (context) {
		// 	return Promise.resolve();
		// },
		response (context, result) {
			if(result.hasOwnProperty('databases')){
				result.databases = result.databases.dbinfo;
			}

			return Promise.resolve(result);
		}
	},
	API_GrantedGroups: {
		// request (context) {
		// 	return Promise.resolve();
		// },
		response (context, result) {
			if(result.hasOwnProperty('groups')){
				if(!(result.groups instanceof Array)){
					result.groups = [ result.groups ];
				}

				result.groups = result.groups.map((group) => {
					return flattenXMLAttributes(group);
				});
			}

			return Promise.resolve(result);
		}
	},
	API_ImportFromCSV: {
		// request (context) {
		// 	return Promise.resolve();
		// },
		response (context, result) {
			if(result.hasOwnProperty('rids')){
				result.rids = result.rids.map((record) => {
					let ret = {
						rid: record._
					};

					if(record.$ && record.$.update_id){
						ret.update_id = record.$.update_id;
					}

					return ret;
				});
			}

			return Promise.resolve(result);
		}
	},
	// API_ProvisionUser: {
		// request (context) {
		// 	return Promise.resolve();
		// },
		// response (context, result) {
		// 	return Promise.resolve(result);
		// }
	// },
	// API_PurgeRecords: {
		// request (context) {
		// 	return Promise.resolve();
		// },
		// response (context, result) {
		// 	return Promise.resolve(result);
		// }
	// },
	// API_RemoveGroupFromRole: {
		// request (context) {
		// 	return Promise.resolve();
		// },
		// response (context, result) {
		// 	return Promise.resolve(result);
		// }
	// },
	// API_RemoveSubgroup: {
		// request (context) {
		// 	return Promise.resolve();
		// },
		// response (context, result) {
		// 	return Promise.resolve(result);
		// }
	// },
	// API_RemoveUserFromGroup: {
		// request (context) {
		// 	return Promise.resolve();
		// },
		// response (context, result) {
		// 	return Promise.resolve(result);
		// }
	// },
	// API_RemoveUserFromRole: {
		// request (context) {
		// 	return Promise.resolve();
		// },
		// response (context, result) {
		// 	return Promise.resolve(result);
		// }
	// },
	// API_RenameApp: {
		// request (context) {
		// 	return Promise.resolve();
		// },
		// response (context, result) {
		// 	return Promise.resolve(result);
		// }
	// },
	// API_RunImport: {
		// request (context) {
		// 	return Promise.resolve();
		// },
		// response (context, result) {
		// 	return Promise.resolve(result);
		// }
	// },
	// API_SendInvitation: {
		// request (context) {
		// 	return Promise.resolve();
		// },
		// response (context, result) {
		// 	return Promise.resolve(result);
		// }
	// },
	// API_SetDBVar: {
		// request (context) {
		// 	return Promise.resolve();
		// },
		// response (context, result) {
		// 	return Promise.resolve(result);
		// }
	// },
	// API_SetFieldProperties: {
		// request (context) {
		// 	return Promise.resolve();
		// },
		// response (context, result) {
		// 	return Promise.resolve(result);
		// }
	// },
	// API_SetKeyField: {
		// request (context) {
		// 	return Promise.resolve();
		// },
		// response (context, result) {
		// 	return Promise.resolve(result);
		// }
	// },
	// API_SignOut: {
		// request (context) {
		// 	return Promise.resolve();
		// },
		// response (context, result) {
		// 	return Promise.resolve(result);
		// }
	// },
	API_UploadFile: {
		// request (context) {
		// 	return Promise.resolve();
		// },
		response (context, result) {
			if(result.hasOwnProperty('file_fields')){
				result.file_fields = result.file_fields.field;

				if(!(result.file_fields instanceof Array)){
					// Support Case #480141
					// XML returned from QuickBase appends "\r\n      "
					if(result.file_fields === ''){
						result.file_fields = [];
					}else{
						result.file_fields = [ result.file_fields ];
					}
				}

				result.file_fields = result.file_fields.map((file) => {
					return flattenXMLAttributes(file);
				});
			}

			return Promise.resolve(result);
		}
	},
	API_UserRoles: {
		// request (context) {
		// 	return Promise.resolve();
		// },
		response (context, result) {
			if(result.hasOwnProperty('users')){
				result.users = flattenXMLAttributes(result.users);
			}

			return Promise.resolve(result);
		}
	},
	default: {
		/*
		request (context) {
			// Do stuff prior to the request

			return Promise.resolve();
		},
		response (context, result) {
			// Do Stuff with the result before resolving the api call

			return Promise.resolve(result);
		}
		*/
	}
};

/* Option Handling */
let prepareOptions = {

	/* NOTICE:
	 * When an option is a simple return of the value given, comment the function out.
	 * This will increase performance, cutting out an unnecessary function execution.
	*/

	/* Common to All */
	// apptoken (val) {
	// 	return val;
	// },

	// dbid (val) {
	// 	return val;
	// },

	// ticket (val) {
	// 	return val;
	// },

	// udata (val) {
	// 	return val;
	// },

	/* API Specific Options */

	/* API_ChangeGroupInfo, API_CreateGroup */
	// accountId (val) {
	// 	return val;
	// },

	/* API_AddField */
	// add_to_forms (val) {
	// 	return val;
	// },

	/* API_GrantedDBs */
	// adminOnly (val) {
	// 	return val;
	// },

	/* API_GrantedGroups */
	// adminonly (val) {
	// 	return val;
	// },

	/* API_SetFieldProperties */
	// allow_new_choices (val) {
	// 	return val;
	// },

	/* API_AddUserToGroup */
	// allowAdminAccess (val) {
	// 	return val;
	// },

	/* API_SetFieldProperties */
	// allowHTML (val) {
	// 	return val;
	// },

	/* API_RemoveGroupFromRole */
	// allRoles (val) {
	// 	return val;
	// },

	/* API_SetFieldProperties */
	// appears_by_default (val) {
	// 	return val;
	// },

	/* API_SetFieldProperties */
	// 'append-only' (val) {
	// 	return val;
	// },

	/* API_SetFieldProperties */
	// blank_is_zero (val) {
	// 	return val;
	// },

	/* API_SetFieldProperties */
	// bold (val) {
	// 	return val;
	// },

	/* API_FieldAddChoices, API_FieldRemoveChoices */
	// choice (val) {
	// 	return val;
	// },

	/* API_SetFieldProperties */
	// choices (val) {
	// 	return val;
	// },

	/* API_DoQuery, API_GenResultsTable, API_ImportFromCSV */
	clist (val) {
		return val instanceof Array ? val.join('.') : val;
	},

	/* API_ImportFromCSV */
	clist_output (val) {
		return val instanceof Array ? val.join('.') : val;
	},

	/* API_SetFieldProperties */
	// comma_start (val) {
	// 	return val;
	// },

	/* API_CopyMasterDetail */
	// copyfid (val) {
	// 	return val;
	// },

	/* API_CreateDatabase */
	// createapptoken (val) {
	// 	return val;
	// },

	/* API_SetFieldProperties */
	// currency_format (val) {
	// 	return val;
	// },

	/* API_SetFieldProperties */
	// currency_symbol (val) {
	// 	return val;
	// },

	/* API_CreateDatabase */
	// dbdesc (val) {
	// 	return val;
	// },

	/* API_CreateDatabase, API_FindDBByName */
	// dbname (val) {
	// 	return val;
	// },

	/* API_SetFieldProperties */
	// decimal_places (val) {
	// 	return val;
	// },

	/* API_SetFieldProperties */
	// default_today (val) {
	// 	return val;
	// },

	/* API_SetFieldProperties */
	// default_value (val) {
	// 	return val;
	// },

	/* API_ChangeGroupInfo, API_CopyGroup, API_CreateGroup */
	// description (val) {
	// 	return val;
	// },

	/* API_CopyMasterDetail */
	// destrid (val) {
	// 	return val;
	// },

	/* API_GetRecordAsHTML */
	// dfid (val) {
	// 	return val;
	// },

	/* API_SetFieldProperties */
	// display_as_button (val) {
	// 	return val;
	// },

	/* API_SetFieldProperties */
	// display_dow (val) {
	// 	return val;
	// },

	/* API_SetFieldProperties */
	// display_month (val) {
	// 	return val;
	// },

	/* API_SetFieldProperties */
	// display_relative (val) {
	// 	return val;
	// },

	/* API_SetFieldProperties */
	// display_time (val) {
	// 	return val;
	// },

	/* API_SetFieldProperties */
	// display_zone (val) {
	// 	return val;
	// },

	/* API_AddRecord, API_EditRecord */
	// disprec (val) {
	// 	return val;
	// },

	/* API_SetFieldProperties */
	// does_average (val) {
	// 	return val;
	// },

	/* API_SetFieldProperties */
	// does_total (val) {
	// 	return val;
	// },

	/* API_SetFieldProperties */
	// doesdatacopy (val) {
	// 	return val;
	// },

	/* API_GetUserInfo, API_ProvisionUser */
	// email (val) {
	// 	return val;
	// },

	/* API_CloneDatabase */
	// excludefiles (val) {
	// 	return val;
	// },

	/* API_GrantedDBs */
	// excludeparents (val) {
	// 	return val;
	// },

	/* API_AddRecord, API_EditRecord */
	// fform (val) {
	// 	return val;
	// },

	/* API_DeleteField, API_FieldAddChoices, API_FieldRemoveChoices, API_SetFieldProperties, API_SetKeyField */
	// fid (val) {
	// 	return val;
	// },

	/* API_AddRecord, API_EditRecord, API_GenAddRecordForm, API_UploadFile */
	field (val) {
		if(!(val instanceof Array)){
			val = [ val ];
		}

		return val.map((value) => {
			let ret = {
				$: {},
				_: value.value
			};

			if(value.hasOwnProperty('fid')){
				ret.$.fid = value.fid;
			}

			if(value.hasOwnProperty('name')){
				ret.$.name = value.name;
			}

			if(value.hasOwnProperty('filename')){
				ret.$.filename = value.filename;
			}

			return ret;
		});

		return val;
	},

	/* API_SetFieldProperties */
	// fieldhelp (val) {
	// 	return val;
	// },

	/* API_SetFieldProperties */
	// find_enabled (val) {
	// 	return val;
	// },

	/* API_DoQuery */
	// fmt (val) {
	// 	return val;
	// },

	/* API_ProvisionUser */
	// fname (val) {
	// 	return val;
	// },

	/* API_SetFieldProperties */
	// formula (val) {
	// 	return val;
	// },

	/* API_CopyGroup */
	// gacct (val) {
	// 	return val;
	// },

	/* API_AddGroupToRole, API_AddSubGroup, API_AddUserToGroup, API_ChangeGroupInfo, API_CopyGroup, API_DeleteGroup, API_GetGroupRole, API_GetUsersInGroup, API_GrantedDBsForGroup, API_RemoveGroupFromRole, API_RemoveSubgroup, API_RemoveUserFromGroup */
	// gid (val) {
	// 	return val;
	// },

	/* API_SetFieldProperties */
	// has_extension (val) {
	// 	return val;
	// },

	/* API_Authenticate */
	// hours (val) {
	// 	return val;
	// },

	/* API_RunImport */
	// id (val) {
	// 	return val;
	// },

	/* API_AddRecord, API_EditRecord */
	// ignoreError (val) {
	// 	return val;
	// },

	/* API_GetUserRole */
	// inclgrps (val) {
	// 	return val;
	// },

	/* API_GetUsersInGroup */
	// includeAllMgrs (val) {
	// 	return val;
	// },

	/* API_GrantedDBs */
	// includeancestors (val) {
	// 	return val;
	// },

	/* API_DoQuery */
	// includeRids (val) {
	// 	return val;
	// },

	/* API_GenResultsTable */
	// jht (val) {
	// 	return val;
	// },

	/* API_GenResultsTable */
	// jsa (val) {
	// 	return val;
	// },

	/* API_CloneDatabase */
	// keepData (val) {
	// 	return val;
	// },

	/* API_ChangeRecordOwner, API_DeleteRecord, API_EditRecord, API_GetRecordInfo */
	// key (val) {
	// 	return val;
	// },

	/* API_AddField, API_SetFieldProperties */
	// label (val) {
	// 	return val;
	// },

	/* API_ProvisionUser */
	// lname (val) {
	// 	return val;
	// },

	/* API_SetFieldProperties */
	// maxlength (val) {
	// 	return val;
	// },

	/* API_AddField */
	// mode (val) {
	// 	return val;
	// },

	/* API_AddRecord, API_EditRecord, API_ImportFromCSV */
	// msInUTC (val) {
	// 	return val;
	// },

	/* API_ChangeGroupInfo, API_CopyGroup, API_CreateGroup */
	// name (val) {
	// 	return val;
	// },

	/* API_RenameApp */
	// newappname (val) {
	// 	return val;
	// },

	/* API_CloneDatabase */
	// newdbdesc (val) {
	// 	return val;
	// },

	/* API_CloneDatabase */
	// newdbname (val) {
	// 	return val;
	// },

	/* API_ChangeManager */
	// newmgr (val) {
	// 	return val;
	// },

	/* API_ChangeRecordOwner */
	// newowner (val) {
	// 	return val;
	// },

	/* API_ChangeUserRole */
	// newroleid (val) {
	// 	return val;
	// },

	/* API_SetFieldProperties */
	// no_wrap (val) {
	// 	return val;
	// },

	/* API_SetFieldProperties */
	// numberfmt (val) {
	// 	return val;
	// },

	/* API_DoQuery, API_GenResultsTable */
	options (val) {
		return val instanceof Array ? val.join('.') : val;
	},

	/* API_AddReplaceDBPage */
	// pagebody (val) {
	// 	return val;
	// },

	/* API_AddReplaceDBPage */
	// pageid (val) {
	// 	return val;
	// },

	/* API_GetDBPage */
	// pageID (val) {
	// 	return val;
	// },

	/* API_AddReplaceDBPage */
	// pagename (val) {
	// 	return val;
	// },

	/* API_AddReplaceDBPage */
	// pagetype (val) {
	// 	return val;
	// },

	/* API_FindDBByName */
	// ParentsOnly (val) {
	// 	return val;
	// },

	/* API_Authenticate */
	// password (val) {
	// 	return val;
	// },

	/* API_CreateTable */
	// pnoun (val) {
	// 	return val;
	// },

	/* API_DoQuery, API_GenResultsTable, API_PurgeRecords */
	// qid (val) {
	// 	return val;
	// },

	/* API_DoQuery, API_GenResultsTable, API_PurgeRecords */
	// qname (val) {
	// 	return val;
	// },

	/* API_DoQuery, API_DoQueryCount, API_GenResultsTable, API_PurgeRecords */
	// query (val) {
	// 	return val;
	// },

	/* API_ImportFromCSV */
	records_csv (val) {
		return val instanceof Array ? val.join('\n') : val;
	},

	/* API_CopyMasterDetail */
	// recurse (val) {
	// 	return val;
	// },

	/* API_CopyMasterDetail */
	// relfids (val) {
	// 	return val;
	// },

	/* API_SetFieldProperties */
	// required (val) {
	// 	return val;
	// },

	/* API_DoQuery */
	// returnpercentage (val) {
	// 	return val;
	// },

	/* API_ChangeRecordOwner, API_DeleteRecord, API_EditRecord, API_GetRecordAsHTML, API_GetRecordInfo, API_UploadFile */
	// rid (val) {
	// 	return val;
	// },

	/* API_AddGroupToRole, API_AddUserToRole, API_ChangeUserRole, API_ProvisionUser, API_RemoveGroupFromRole, API_RemoveUserFromRole */
	// roleid (val) {
	// 	return val;
	// },

	/* API_ImportFromCSV */
	// skipfirst (val) {
	// 	return val;
	// },

	/* API_DoQuery, API_GenResultsTable */
	slist (val) {
		return val instanceof Array ? val.join('.') : val;
	},

	/* API_SetFieldProperties */
	// sort_as_given (val) {
	// 	return val;
	// },

	/* API_CopyMasterDetail */
	// sourcerid (val) {
	// 	return val;
	// },

	/* API_AddSubGroup, API_RemoveSubgroup */
	// subgroupid (val) {
	// 	return val;
	// },

	/* API_CreateTable */
	// tname (val) {
	// 	return val;
	// },

	/* API_AddField */
	// type (val) {
	// 	return val;
	// },

	/* API_SetFieldProperties */
	// unique (val) {
	// 	return val;
	// },

	/* API_EditRecord */
	// update_id (val) {
	// 	return val;
	// },

	/* API_AddUserToGroup, API_AddUserToRole, API_ChangeUserRole, API_GetUserRole, API_GrantedGroups, API_RemoveUserFromGroup, API_RemoveUserFromRole, API_SendInvitation */
	// userid (val) {
	// 	return val;
	// },

	/* API_Authenticate */
	// username (val) {
	// 	return val;
	// },

	/* API_CloneDatabase */
	// usersandroles (val) {
	// 	return val;
	// },

	/* API_SendInvitation */
	// usertext (val) {
	// 	return val;
	// },

	/* API_SetDBVar */
	// value (val) {
	// 	return val;
	// },

	/* API_GetDBVar, API_SetDBVar */
	// varname (val) {
	// 	return val;
	// },

	/* API_SetFieldProperties */
	// width (val) {
	// 	return val;
	// },

	/* API_GrantedDBs */
	// withembeddedtables (val) {
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
QuickBase.xmlNodeParsers = xmlNodeParsers;

/* Export Module */
if(typeof(module) !== 'undefined' && module.exports){
	module.exports = QuickBase;
}else
if(typeof(define) === 'function' && define.amd){
	define('QuickBase', [], () => {
		return QuickBase;
	});
}
