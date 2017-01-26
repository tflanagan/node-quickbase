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
const xml = require('xml2js');
const http = require('http');
const https = require('https');
const merge = require('lodash.merge');
const debugRequest = require('debug')('quickbase:request');
const debugResponse = require('debug')('quickbase:response');
const Promise = require('bluebird');

/* Backwards Compatibility */
if (!Object.hasOwnProperty('extend') && Object.extend === undefined) {
	var warned = false;

	Object.defineProperty(Object.prototype, 'extend', {
		enumerable: false,
		writable: true,
		value() {
			if (!warned) {
				warned = true;

				console.warn('{}.extend has been deprecated, please install and use lodash.merge instead');
			}

			const args = new Array(arguments.length);

			for (let i = 0; i < args.length; ++i) {
				args[i] = arguments[i];
			}

			args.unshift(this);

			return merge.apply(null, args);
		}
	});
}

/* Error Handling */
class QuickBaseError extends Error {

	constructor(code, name, message) {
		super(name);

		this.code = code;
		this.name = name;
		this.message = message || '';

		return this;
	}

}

/* Default Settings */
const defaults = {
	realm: 'www',
	domain: 'quickbase.com',
	path: '/',
	useSSL: true,

	username: '',
	password: '',
	appToken: '',
	userToken: '',
	ticket: '',

	flags: {
		useXML: true,
		msInUTC: true,
		includeRids: true,
		returnPercentage: false,
		fmt: 'structured',
		encoding: 'ISO-8859-1',
		dbidAsParam: false
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

/* Main Class */
class QuickBase {

	constructor(options) {
		this._id = 0;

		this.className = QuickBase.className;

		this.settings = merge({}, QuickBase.defaults, options || {});

		this.throttle = new Throttle(this.settings.connectionLimit, this.settings.errorOnConnectionLimit);

		return this;
	}

	api(action, options, callback) {
		const call = new Promise((resolve, reject) => {
			Promise.using(this.throttle.acquire(), () => {
				const query = new QueryBuilder(this, action, options || {}, callback);

				query._id = this._id;

				++this._id;

				return query
					.addFlags()
					.processOptions()
					.actionRequest()
					.constructPayload()
					.processQuery()
					.then((results) => {
						query.results = results;

						query.actionResponse();

						debugResponse(query._id, query.results);

						if (callback instanceof Function) {
							callback(null, query.results);
						} else {
							resolve(query.results);
						}
					}).catch((error) => {
						resolve(query.catchError(error));
					});
			}).catch((error) => {
				if (callback instanceof Function) {
					callback(error);
				} else {
					reject(error);
				}
			});
		});

		return callback instanceof Function ? this : call;
	}

	static checkIsArrAndConvert(obj) {
		if (!(obj instanceof Array)) {
			// Support Case #480141
			// XML returned from QuickBase appends "\r\n      "
			if (obj === '') {
				obj = [];
			} else {
				obj = [ obj ];
			}
		}

		return obj;
	}

	static cleanXML(xml) {
		const isInt = /^-?\s*\d+$/;
		const isDig = /^((?!0\d+$)(?:0|-?\s*\d+\.?\d*))$/;
		const radix = 10;

		const processNode = (node) => {
			let value, singulars,
				l = -1, i = -1, s = -1, e = -1;

			if (xml[node] instanceof Array && xml[node].length === 1) {
				xml[node] = xml[node][0];
			}

			if (xml[node] instanceof Object) {
				value = Object.keys(xml[node]);

				if (value.length === 1) {
					l = node.length;

					singulars = [
						node.substring(0, l - 1),
						node.substring(0, l - 3) + 'y'
					];

					i = singulars.indexOf(value[0]);

					if (i !== -1) {
						xml[node] = xml[node][singulars[i]];
					}
				}
			}

			if (typeof xml[node] === 'object') {
				xml[node] = QuickBase.cleanXML(xml[node]);
			}

			if (typeof xml[node] === 'string') {
				value = xml[node].trim();

				if (value.match(isDig)) {
					if (value.match(isInt)) {
						l = parseInt(value, radix);

						if (Math.abs(l) <= 9007199254740991) {
							xml[node] = l;
						}
					} else {
						l = value.length;

						if (l <= 15) {
							xml[node] = parseFloat(value);
						} else {
							for (i = 0, s = -1, e = -1; i < l && e - s <= 15; ++i) {
								if (value.charAt(i) > 0) {
									if (s === -1) {
										s = i;
									} else {
										e = i;
									}
								}
							}

							if (e - s <= 15) {
								xml[node] = parseFloat(value);
							}
						}
					}
				} else {
					xml[node] = value;
				}
			}

			if (node === '$') {
				const processAttr = (property) => {
					xml[property] = xml[node][property];
				};

				Object.keys(xml[node]).forEach(processAttr);

				delete xml[node];
			}
		};

		Object.keys(xml).forEach(processNode);

		return xml;
	}

}

/* Throttle */
class Throttle {

	constructor(maxConnections, errorOnConnectionLimit) {
		this.maxConnections = maxConnections || 10;
		this.errorOnConnectionLimit = errorOnConnectionLimit || false;

		this._numConnections = 0;
		this._pendingConnections = [];

		return this;
	}

	acquire() {
		return new Promise((resolve, reject) => {
			if (this.maxConnections === -1 || this._numConnections < this.maxConnections) {
				++this._numConnections;

				return resolve();
			}

			if (this.errorOnConnectionLimit) {
				return reject(new QuickBaseError(1001, 'No Connections Available', 'Maximum Number of Connections Reached'));
			}

			this._pendingConnections.push({
				resolve: resolve,
				reject: reject
			});
		}).disposer(() => {
			--this._numConnections;

			if (this._pendingConnections.length > 0) {
				++this._numConnections;

				this._pendingConnections.shift().resolve();
			}
		});
	}

}

/* Request Handling */
class QueryBuilder {

	constructor(parent, action, options, callback) {
		this.parent = parent;
		this.action = action;
		this.options = options;
		this.callback = callback;

		this.settings = merge({}, parent.settings);

		this.results;

		this._id = 0;
		this._nErr = 0;

		return this;
	}

	actionRequest() {
		let action = this.action;

		if (!actions.hasOwnProperty(action)) {
			action = 'default';
		}

		if (typeof actions[action] !== 'undefined') {
			if (typeof actions[action] === 'function') {
				actions[action](this);
			}else
			if (typeof actions[action].request === 'function') {
				actions[action].request(this);
			}
		}else
		if (typeof actions.default !== 'undefined') {
			if (typeof actions.default === 'function') {
				actions.default(this);
			}else
			if (typeof actions.default.request === 'function') {
				actions.default.request(this);
			}
		}

		return this;
	}

	actionResponse() {
		let action = this.action;

		if (!actions.hasOwnProperty(action)) {
			action = 'default';
		}

		if (typeof actions[action] === 'object' && typeof actions[action].response === 'function') {
			actions[action].response(this, this.results);
		}else
		if (typeof actions.default === 'object' && typeof actions.default.response === 'function') {
			actions.default.response(this, this.results);
		}

		return this;
	}

	addFlags() {
		if (!this.options.hasOwnProperty('msInUTC') && this.settings.flags.msInUTC) {
			this.options.msInUTC = 1;
		}

		if (!this.options.hasOwnProperty('appToken') && this.settings.appToken) {
			this.options.apptoken = this.settings.appToken;
		}

		if (!this.options.hasOwnProperty('userToken') && this.settings.userToken) {
			this.options.usertoken = this.settings.userToken;
		}

		if (!this.options.hasOwnProperty('ticket') && this.settings.ticket) {
			this.options.ticket = this.settings.ticket;
		}

		if (!this.options.hasOwnProperty('encoding') && this.settings.flags.encoding) {
			this.options.encoding = this.settings.flags.encoding;
		}

		Object.keys(this.settings.flags).forEach((flag) => {
			if (this.options.hasOwnProperty(flag)) {
				this.settings.flags[flag] = this.options[flag];
			}
		});

		return this;
	}

	catchError(err) {
		++this._nErr;

		if (this._nErr < this.settings.maxErrorRetryAttempts) {
			if ([1000, 1001].indexOf(err.code) !== -1) {
				return this.processQuery().then((results) => {
					this.results = results;

					this.actionResponse();

					if (this.callback instanceof Function) {
						this.callback(null, this.results);
					} else {
						return this.results;
					}
				}).catch((error) => {
					return this.catchError(error);
				});
			}else
			if (
				err.code === 4 &&
				this.parent.settings.hasOwnProperty('username') && this.parent.settings.username !== '' &&
				this.parent.settings.hasOwnProperty('password') && this.parent.settings.password !== ''
			) {
				return this.parent.api('API_Authenticate', {
					username: this.parent.settings.username,
					password: this.parent.settings.password
				}).then((results) => {
					this.parent.settings.ticket = results.ticket;
					this.settings.ticket = results.ticket;
					this.options.ticket = results.ticket;

					return this
						.addFlags()
						.constructPayload()
						.processQuery()
						.then((results) => {
							this.results = results;

							this.actionResponse();

							if (this.callback instanceof Function) {
								this.callback(null, this.results);
							} else {
								return this.results;
							}
						});
				}).catch((error) => {
					return this.catchError(error);
				});
			}
		}

		if (this.callback instanceof Function) {
			this.callback(err);
		} else {
			throw err;
		}
	}

	constructPayload() {
		const builder = new xml.Builder({
			rootName: 'qdbapi',
			xmldec: {
				encoding: this.options.encoding
			},
			renderOpts: {
				pretty: false
			}
		});

		this.payload = '';

		if (this.settings.flags.useXML === true) {
			try {
				this.payload = builder.buildObject(this.options);
			} catch (err) {
				throw new QuickBaseError(1002, 'Error Building XML' + (err.name ? ': ' + err.name : ''), err.message ? err.message : err);
			}
		} else {
			this.payload = Object.keys(this.options).reduce((payload, arg) => {
				return payload + '&' + arg + '=' + encodeURIComponent(this.options[arg]);
			}, this.payload);
		}

		return this;
	}

	processQuery() {
		return new Promise((resolve, reject) => {
			const settings = this.settings;
			const protocol = settings.useSSL ? https : http;
			const options = {
				hostname: [ settings.realm, settings.domain ].join('.'),
				port: settings.useSSL ? 443 : 80,
				path: settings.path + 'db/' + (this.options.dbid && !settings.flags.dbidAsParam ? this.options.dbid : 'main') + '?act=' + this.action + (!settings.flags.useXML ? this.payload : ''),
				method: settings.flags.useXML ? 'POST' : 'GET',
				headers: {
					'Content-Type': 'application/xml; charset=' + this.options.encoding,
					'QUICKBASE-ACTION': this.action
				},
				agent: false
			};
			const request = protocol.request(options, (response) => {
				let xmlResponse = '';

				response.on('data', (chunk) => {
					xmlResponse += chunk;
				});

				response.on('end', () => {
					if (response.headers['content-type'] === 'application/xml') {
						xml.parseString(xmlResponse, {
							async: true
						}, (err, result) => {
							if (err) {
								return reject(new QuickBaseError(1000, 'Error Processing Request', err));
							}

							result = QuickBase.cleanXML(result.qdbapi);

							if (result.errcode !== settings.status.errcode) {
								return reject(new QuickBaseError(result.errcode, result.errtext, result.errdetail));
							}

							resolve(result);
						});
					} else {
						resolve(xmlResponse);
					}
				});
			});

			if (settings.flags.useXML === true) {
				request.write(this.payload);
			}

			request.on('error', (err) => {
				reject(err);
			});

			debugRequest(this._id, options, this.payload);

			request.end();
		});
	}

	processOptions() {
		if (this.options.hasOwnProperty('fields')) {
			this.options.field = this.options.fields;

			delete this.options.fields;
		}

		this.options = Object.keys(this.options).reduce((newOpts, option) => {
			newOpts[option] = prepareOptions.hasOwnProperty(option) ? prepareOptions[option](this.options[option]) : newOpts[option] = this.options[option];

			return newOpts;
		}, {});

		return this;
	}

}

/* XML Node Parsers */
const xmlNodeParsers = {
	choices_luid(val) {
		return val.choice_luid;
	},
	fields(val) {
		return QuickBase.checkIsArrAndConvert(val).map((value) => {
			// Support Case #480141
			// XML returned from QuickBase inserts '<br />' after every line in formula fields.
			if (typeof value.formula === 'object') {
				value.formula = value.formula._;
			}

			if (value.hasOwnProperty('choices_luid')) {
				value.choices_luid = xmlNodeParsers.choices_luid(value.choices_luid);
			}

			return value;
		});
	},
	lusers(val) {
		return QuickBase.checkIsArrAndConvert(val).map((value) => {
			return {
				id: value.id,
				name: value._
			};
		});
	},
	queries(val) {
		return QuickBase.checkIsArrAndConvert(val);
	},
	roles(val) {
		return QuickBase.checkIsArrAndConvert(val).map((value) => {
			const ret = {
				id: value.id,
				name: value.name
			};

			if (value._) {
				ret.name = value._;
			} else {
				if (value.hasOwnProperty('access')) {
					ret.access = {
						id: value.access.id,
						name: value.access._
					};
				}

				if (value.hasOwnProperty('member')) {
					ret.member = {
						type: value.member.type,
						name: value.member._
					};
				}
			}

			return ret;
		});
	},
	variables(val) {
		return QuickBase.checkIsArrAndConvert(val.var).reduce((newVars, value) => {
			newVars[value.name] = value._;

			return newVars;
		}, {});
	}
};

/* Actions */
const actions = {

	/* NOTICE:
	 * When an actions request or response does nothing, comment the function out.
	 * Will increase performance by cutting out an unnecessary function execution.
	*/

	// API_AddField: {
		// request(query) { },
		// response(query, results) { }
	// },
	// API_AddGroupToRole: {
		// request(query) { },
		// response(query, results) { }
	// },
	// API_AddRecord: {
		// request(query) { },
		// response(query, results) { }
	// },
	// API_AddReplaceDBPage: {
		// request(query) { },
		// response(query, results) { }
	// },
	// API_AddSubGroup: {
		// request(query) { },
		// response(query, results) { }
	// },
	// API_AddUserToGroup: {
		// request(query) { },
		// response(query, results) { }
	// },
	// API_AddUserToRole: {
		// request(query) { },
		// response(query, results) { }
	// },
	API_Authenticate: {
		request(query) {
			// API_Authenticate can only happen over SSL
			query.settings.useSSL = true;
		},
		response(query, results) {
			query.parent.settings.ticket = results.ticket;
			query.parent.settings.username = query.options.username;
			query.parent.settings.password = query.options.password;
		}
	},
	// API_ChangeGroupInfo: {
		// request(query) { },
		// response(query, results) { }
	// },
	// API_ChangeManager: {
		// request(query) { },
		// response(query, results) { }
	// },
	// API_ChangeRecordOwner: {
		// request(query) { },
		// response(query, results) { }
	// },
	// API_ChangeUserRole: {
		// request(query) { },
		// response(query, results) { }
	// },
	// API_CloneDatabase: {
		// request(query) { },
		// response(query, results) { }
	// },
	// API_CopyGroup: {
		// request(query) { },
		// response(query, results) {  }
	// },
	// API_CopyMasterDetail: {
		// request(query) { },
		// response(query, results) { }
	// },
	// API_CreateDatabase: {
		// request(query) { },
		// response(query, results) { }
	// },
	// API_CreateGroup: {
		// request(query) { },
		// response(query, results) {  }
	// },
	// API_CreateTable: {
		// request(query) { },
		// response(query, results) { }
	// },
	// API_DeleteDatabase: {
		// request(query) { },
		// response(query, results) { }
	// },
	// API_DeleteField: {
		// request(query) { },
		// response(query, results) { }
	// },
	// API_DeleteGroup: {
		// request(query) { },
		// response(query, results) { }
	// },
	// API_DeleteRecord: {
		// request(query) { },
		// response(query, results) { }
	// },
	API_DoQuery: {
		request(query) {
			if (!query.options.hasOwnProperty('returnPercentage') && query.settings.flags.returnPercentage) {
				query.options.returnPercentage = 1;
			}

			if (!query.options.hasOwnProperty('fmt') && query.settings.flags.fmt) {
				query.options.fmt = query.settings.flags.fmt;
			}

			if (!query.options.hasOwnProperty('includeRids') && query.settings.flags.includeRids) {
				query.options.includeRids = 1;
			}
		},
		response(query, results) {
			if (query.options.hasOwnProperty('fmt') && query.options.fmt === 'structured') {
				/* XML is _so_ butt ugly... Let's try to make some sense of it
				 * Turn this:
				 *  {
				 *    $: { rid: 1 },
				 *    f: [
				 *      { $: { id: 3 }, _: 1 } ],
				 *      { $: { id: 6 }, _: 'Test Value' }
				 *      { $: { id: 7 }, _: 'filename.png', url: 'https://www.quickbase.com/' }
				 *    ]
				 *  }
				 *
				 * Into this:
				 *  {
				 *    3: 1,
				 *    6: 'Test Value',
				 *    7: {
				 *      filename: 'filename.png',
				 *      url: 'https://www.quickbase.com/'
				 *    }
				 *  }
				*/

				if (results.table.hasOwnProperty('records')) {
					results.table.records = QuickBase.checkIsArrAndConvert(results.table.records).map((record) => {
						const ret = {};

						if (query.options.includeRids) {
							ret.rid = record.rid;
						}

						return QuickBase.checkIsArrAndConvert(record.f).reduce((ret, field) => {
							const fid = field.id;

							if (field.hasOwnProperty('url')) {
								ret[fid] = {
									filename: field._,
									url: field.url
								};
							} else {
								ret[fid] = field._;
							}

							return ret;
						}, ret);
					});
				}

				if (results.table.hasOwnProperty('queries')) {
					results.table.queries = xmlNodeParsers.queries(results.table.queries);
				}

				if (results.table.hasOwnProperty('fields')) {
					results.table.fields = xmlNodeParsers.fields(results.table.fields);
				}

				if (results.table.hasOwnProperty('variables')) {
					results.table.variables = xmlNodeParsers.variables(results.table.variables);
				}

				if (results.table.hasOwnProperty('lusers')) {
					results.table.lusers = xmlNodeParsers.lusers(results.table.lusers);
				}
			} else {
				results.records = QuickBase.checkIsArrAndConvert(results.record);

				delete results.record;

				if (results.hasOwnProperty('chdbids')) {
					if (!(results.chdbids instanceof Array)) {
						// Support Case #480141
						// XML returned from QuickBase appends "\r\n      "
						if (results.chdbids === '') {
							results.chdbids = [];
						}
					}
				}

				if (results.hasOwnProperty('variables')) {
					if (!(results.variables instanceof Array)) {
						// Support Case #480141
						// XML returned from QuickBase appends "\r\n      "
						if (results.variables === '') {
							results.variables = {};
						}
					}
				}
			}
		}
	},
	// API_DoQueryCount: {
		// request(query) { },
		// response(query, results) { }
	// },
	// API_EditRecord: {
		// request(query) { },
		// response(query, results) { }
	// },
	// API_FieldAddChoices: {
		// request(query) { },
		// response(query, results) { }
	// },
	// API_FieldRemoveChoices: {
		// request(query) { },
		// response(query, results) { }
	// },
	// API_FindDBByName: {
		// request(query) { },
		// response(query, results) { }
	// },
	// API_GenAddRecordForm: {
		// request(query) { },
		// response(query, results) { }
	// },
	// API_GenResultsTable: {
		// request(query) { },
		// response(query, results) { }
	// },
	// API_GetAncestorInfo: {
		// request(query) { },
		// response(query, results) { }
	// },
	API_GetAppDTMInfo: {
		request(query) {
			query.settings.flags.dbidAsParam = true;
		},
		response(query, results) {
			if (results.hasOwnProperty('tables')) {
				results.tables = QuickBase.checkIsArrAndConvert(results.tables);
			}
		}
	},
	// API_GetDBPage: {
		// request(query) { },
		// response(query, results) { }
	// },
	// API_GetDBInfo: {
		// request(query) { },
		// response(query, results) { }
	// },
	// API_GetDBVar: {
		// request(query) { },
		// response(query, results) { }
	// },
	API_GetGroupRole: {
		// request(query) { },
		response(query, results) {
			if (results.hasOwnProperty('roles')) {
				results.roles = xmlNodeParsers.roles(results.roles);
			}
		}
	},
	// API_GetNumRecords: {
		// request(query) { },
		// response(query, results) { }
	// },
	API_GetSchema: {
		// request(query) { },
		response(query, results) {
			if (results.table.hasOwnProperty('chdbids')) {
				results.table.chdbids = QuickBase.checkIsArrAndConvert(results.table.chdbids).map((chdbid) => {
					return {
						name: chdbid.name,
						dbid: chdbid._
					};
				});
			}

			if (results.table.hasOwnProperty('variables')) {
				results.table.variables = xmlNodeParsers.variables(results.table.variables);
			}

			if (results.table.hasOwnProperty('queries')) {
				results.table.queries = xmlNodeParsers.queries(results.table.queries);
			}

			if (results.table.hasOwnProperty('fields')) {
				results.table.fields = xmlNodeParsers.fields(results.table.fields);
			}
		}
	},
	// API_GetRecordAsHTML: {
		// request(query) { },
		// response(query, results) { }
	// },
	// API_GetRecordInfo: {
		// request(query) { },
		// response(query, results) { }
	// },
	API_GetRoleInfo: {
		// request(query) { },
		response(query, results) {
			if (results.hasOwnProperty('roles')) {
				results.roles = xmlNodeParsers.roles(results.roles);
			}
		}
	},
	// API_GetUserInfo: {
		// request(query) { },
		// response(query, results) { }
	// },
	API_GetUserRole: {
		// request(query) { },
		response(query, results) {
			if (results.user.hasOwnProperty('roles')) {
				results.user.roles = xmlNodeParsers.roles(results.user.roles);
			}
		}
	},
	// API_GetUsersInGroup: {
		// request(query) { },
		// response(query, results) { }
	// },
	API_GrantedDBs: {
		// request(query) { },
		response(query, results) {
			if (results.hasOwnProperty('databases')) {
				results.databases = results.databases.dbinfo;
			}
		}
	},
	API_GrantedDBsForGroup: {
		// request(query) { },
		response(query, results) {
			if (results.hasOwnProperty('databases')) {
				results.databases = results.databases.dbinfo;
			}
		}
	},
	API_GrantedGroups: {
		// request(query) { },
		response(query, results) {
			if (results.hasOwnProperty('groups')) {
				results.groups = QuickBase.checkIsArrAndConvert();
			}
		}
	},
	API_ImportFromCSV: {
		// request(query) { },
		response(query, results) {
			if (results.hasOwnProperty('rids')) {
				if (results.rids.hasOwnProperty('fields')) {
					results.rids = results.rids.fields.map((record) => {
						record.field.forEach((field) => {
							record[field.id] = field._;
						});

						delete record.field;

						return record;
					});
				} else {
					results.rids = results.rids.map((record) => {
						const ret = {
							rid: record._
						};

						if (record.update_id) {
							ret.update_id = record.update_id;
						}

						return ret;
					});
				}
			}
		}
	},
	// API_ProvisionUser: {
		// request(query) { },
		// response(query, results) { }
	// },
	// API_PurgeRecords: {
		// request(query) { },
		// response(query, results) { }
	// },
	// API_RemoveGroupFromRole: {
		// request(query) { },
		// response(query, results) { }
	// },
	// API_RemoveSubgroup: {
		// request(query) { },
		// response(query, results) { }
	// },
	// API_RemoveUserFromGroup: {
		// request(query) { },
		// response(query, results) { }
	// },
	// API_RemoveUserFromRole: {
		// request(query) { },
		// response(query, results) { }
	// },
	// API_RenameApp: {
		// request(query) { },
		// response(query, results) { }
	// },
	// API_RunImport: {
		// request(query) { },
		// response(query, results) { }
	// },
	// API_SendInvitation: {
		// request(query) { },
		// response(query, results) { }
	// },
	// API_SetDBVar: {
		// request(query) { },
		// response(query, results) { }
	// },
	// API_SetFieldProperties: {
		// request(query) { },
		// response(query, results) { }
	// },
	// API_SetKeyField: {
		// request(query) { },
		// response(query, results) { }
	// },
	// API_SignOut: {
		// request(query) { },
		// response(query, results) { }
	// },
	API_UploadFile: {
		// request(query) { },
		response(query, results) {
			if (results.hasOwnProperty('file_fields')) {
				results.file_fields = QuickBase.checkIsArrAndConvert(results.file_fields.field);
			}
		}
	},
	API_UserRoles: {
		// request(query) { },
		response(query, results) {
			if (results.hasOwnProperty('users')) {
				results.users = QuickBase.checkIsArrAndConvert(results.users).map((user) => {
					user.roles = xmlNodeParsers.roles(user.roles);

					return user;
				});
			}
		}
	},
	default: {
		/* request(query) {
		 *  Do stuff prior to the request
		 * },
		 * response(query, results) {
		 *  Do Stuff with the results before resolving the api call
		 * }
		*/
	}
};

/* Option Handling */
const prepareOptions = {

	/* NOTICE:
	 * When an option is a simple return of the value given, comment the function out.
	 * This will increase performance, cutting out an unnecessary function execution.
	*/

	/* Common to All */
	// apptoken (val) { return val; },

	// dbid (val) { return val; },

	// ticket (val) { return val; },

	// udata (val) { return val; },

	/* API Specific Options */

	/* API_ChangeGroupInfo, API_CreateGroup */
	// accountId (val) { return val; },

	/* API_AddField */
	// add_to_forms (val) { return val; },

	/* API_GrantedDBs */
	// adminOnly (val) { return val; },

	/* API_GrantedGroups */
	// adminonly (val) { return val; },

	/* API_SetFieldProperties */
	// allow_new_choices (val) { return val; },

	/* API_AddUserToGroup */
	// allowAdminAccess (val) { return val; },

	/* API_SetFieldProperties */
	// allowHTML (val) { return val; },

	/* API_RemoveGroupFromRole */
	// allRoles (val) { return val; },

	/* API_SetFieldProperties */
	// appears_by_default (val) { return val; },

	/* API_SetFieldProperties */
	// 'append-only' (val) { return val; },

	/* API_SetFieldProperties */
	// blank_is_zero (val) { return val; },

	/* API_SetFieldProperties */
	// bold (val) { return val; },

	/* API_FieldAddChoices, API_FieldRemoveChoices */
	// choice (val) { return val; },

	/* API_SetFieldProperties */
	// choices (val) { return val; },

	/* API_DoQuery, API_GenResultsTable, API_ImportFromCSV */
	clist(val) {
		if (!(val instanceof Array)) {
			val = ('' + val).split('.');
		}

		return val.filter((v, i, a) => {
			return a.indexOf(v) === i;
		}).join('.');
	},

	/* API_ImportFromCSV */
	clist_output(val) {
		if (!(val instanceof Array)) {
			val = ('' + val).split('.');
		}

		return val.filter((v, i, a) => {
			return a.indexOf(v) === i;
		}).join('.');
	},

	/* API_SetFieldProperties */
	// comma_start (val) { return val; },

	/* API_CopyMasterDetail */
	// copyfid (val) { return val; },

	/* API_CreateDatabase */
	// createapptoken (val) { return val; },

	/* API_SetFieldProperties */
	// currency_format (val) { return val; },

	/* API_SetFieldProperties */
	// currency_symbol (val) { return val; },

	/* API_CreateDatabase */
	// dbdesc (val) { return val; },

	/* API_CreateDatabase, API_FindDBByName */
	// dbname (val) { return val; },

	/* API_SetFieldProperties */
	// decimal_places (val) { return val; },

	/* API_SetFieldProperties */
	// default_today (val) { return val; },

	/* API_SetFieldProperties */
	// default_value (val) { return val; },

	/* API_ChangeGroupInfo, API_CopyGroup, API_CreateGroup */
	// description (val) { return val; },

	/* API_CopyMasterDetail */
	// destrid (val) { return val; },

	/* API_GetRecordAsHTML */
	// dfid (val) { return val; },

	/* API_SetFieldProperties */
	// display_as_button (val) { return val; },

	/* API_SetFieldProperties */
	// display_dow (val) { return val; },

	/* API_SetFieldProperties */
	// display_month (val) { return val; },

	/* API_SetFieldProperties */
	// display_relative (val) { return val; },

	/* API_SetFieldProperties */
	// display_time (val) { return val; },

	/* API_SetFieldProperties */
	// display_zone (val) { return val; },

	/* API_AddRecord, API_EditRecord */
	// disprec (val) { return val; },

	/* API_SetFieldProperties */
	// does_average (val) { return val; },

	/* API_SetFieldProperties */
	// does_total (val) { return val; },

	/* API_SetFieldProperties */
	// doesdatacopy (val) { return val; },

	/* API_GetUserInfo, API_ProvisionUser */
	// email (val) { return val; },

	/* API_CloneDatabase */
	// excludefiles (val) { return val; },

	/* API_GrantedDBs */
	// excludeparents (val) { return val; },

	/* API_AddRecord, API_EditRecord */
	// fform (val) { return val; },

	/* API_DeleteField, API_FieldAddChoices, API_FieldRemoveChoices, API_SetFieldProperties, API_SetKeyField */
	// fid (val) { return val; },

	/* API_AddRecord, API_EditRecord, API_GenAddRecordForm, API_UploadFile */
	field(val) {
		if (val instanceof Object && val.map === undefined) {
			val = [ val ];
		}

		return val.map((value) => {
			const ret = {
				$: {},
				_: value.value
			};

			if (value.hasOwnProperty('fid')) {
				ret.$.fid = value.fid;
			}

			if (value.hasOwnProperty('name')) {
				ret.$.name = value.name;
			}

			if (value.hasOwnProperty('filename')) {
				ret.$.filename = value.filename;
			}

			return ret;
		});
	},

	/* API_SetFieldProperties */
	// fieldhelp (val) { return val; },

	/* API_SetFieldProperties */
	// find_enabled (val) { return val; },

	/* API_DoQuery */
	// fmt (val) { return val; },

	/* API_ProvisionUser */
	// fname (val) { return val; },

	/* API_SetFieldProperties */
	// formula (val) { return val; },

	/* API_CopyGroup */
	// gacct (val) { return val; },

	/* API_AddGroupToRole, API_AddSubGroup, API_AddUserToGroup, API_ChangeGroupInfo, API_CopyGroup, API_DeleteGroup, API_GetGroupRole, API_GetUsersInGroup, API_GrantedDBsForGroup, API_RemoveGroupFromRole, API_RemoveSubgroup, API_RemoveUserFromGroup */
	// gid (val) { return val; },

	/* API_SetFieldProperties */
	// has_extension (val) { return val; },

	/* API_Authenticate */
	// hours (val) { return val; },

	/* API_RunImport */
	// id (val) { return val; },

	/* API_AddRecord, API_EditRecord */
	// ignoreError (val) { return val; },

	/* API_GetUserRole */
	// inclgrps (val) { return val; },

	/* API_GetUsersInGroup */
	// includeAllMgrs (val) { return val; },

	/* API_GrantedDBs */
	// includeancestors (val) { return val; },

	/* API_DoQuery */
	// includeRids (val) { return val; },

	/* API_GenResultsTable */
	// jht (val) { return val; },

	/* API_GenResultsTable */
	// jsa (val) { return val; },

	/* API_CloneDatabase */
	// keepData (val) { return val; },

	/* API_ChangeRecordOwner, API_DeleteRecord, API_EditRecord, API_GetRecordInfo */
	// key (val) { return val; },

	/* API_AddField, API_SetFieldProperties */
	// label (val) { return val; },

	/* API_ProvisionUser */
	// lname (val) { return val; },

	/* API_SetFieldProperties */
	// maxlength (val) { return val; },

	/* API_AddField */
	// mode (val) { return val; },

	/* API_AddRecord, API_EditRecord, API_ImportFromCSV */
	// msInUTC (val) { return val; },

	/* API_ChangeGroupInfo, API_CopyGroup, API_CreateGroup */
	// name (val) { return val; },

	/* API_RenameApp */
	// newappname (val) { return val; },

	/* API_CloneDatabase */
	// newdbdesc (val) { return val; },

	/* API_CloneDatabase */
	// newdbname (val) { return val; },

	/* API_ChangeManager */
	// newmgr (val) { return val; },

	/* API_ChangeRecordOwner */
	// newowner (val) { return val; },

	/* API_ChangeUserRole */
	// newroleid (val) { return val; },

	/* API_SetFieldProperties */
	// no_wrap (val) { return val; },

	/* API_SetFieldProperties */
	// numberfmt (val) { return val; },

	/* API_DoQuery, API_GenResultsTable */
	options(val) {
		return val instanceof Array ? val.join('.') : val;
	},

	/* API_AddReplaceDBPage */
	// pagebody (val) { return val; },

	/* API_AddReplaceDBPage */
	// pageid (val) { return val; },

	/* API_GetDBPage */
	// pageID (val) { return val; },

	/* API_AddReplaceDBPage */
	// pagename (val) { return val; },

	/* API_AddReplaceDBPage */
	// pagetype (val) { return val; },

	/* API_FindDBByName */
	// ParentsOnly (val) { return val; },

	/* API_Authenticate */
	// password (val) { return val; },

	/* API_CreateTable */
	// pnoun (val) { return val; },

	/* API_DoQuery, API_GenResultsTable, API_PurgeRecords */
	// qid (val) { return val; },

	/* API_DoQuery, API_GenResultsTable, API_PurgeRecords */
	// qname (val) { return val; },

	/* API_DoQuery, API_DoQueryCount, API_GenResultsTable, API_PurgeRecords */
	// query (val) { return val; },

	/* API_ImportFromCSV */
	records_csv(val) {
		return val instanceof Array ? val.join('\n') : val;
	},

	/* API_CopyMasterDetail */
	// recurse (val) { return val; },

	/* API_CopyMasterDetail */
	// relfids (val) { return val; },

	/* API_SetFieldProperties */
	// required (val) { return val; },

	/* API_DoQuery */
	// returnpercentage (val) { return val; },

	/* API_ChangeRecordOwner, API_DeleteRecord, API_EditRecord, API_GetRecordAsHTML, API_GetRecordInfo, API_UploadFile */
	// rid (val) { return val; },

	/* API_AddGroupToRole, API_AddUserToRole, API_ChangeUserRole, API_ProvisionUser, API_RemoveGroupFromRole, API_RemoveUserFromRole */
	// roleid (val) { return val; },

	/* API_ImportFromCSV */
	// skipfirst (val) { return val; },

	/* API_DoQuery, API_GenResultsTable */
	slist(val) {
		return val instanceof Array ? val.join('.') : val;
	},

	/* API_SetFieldProperties */
	// sort_as_given (val) { return val; },

	/* API_CopyMasterDetail */
	// sourcerid (val) { return val; },

	/* API_AddSubGroup, API_RemoveSubgroup */
	// subgroupid (val) { return val; },

	/* API_CreateTable */
	// tname (val) { return val; },

	/* API_AddField */
	// type (val) { return val; },

	/* API_SetFieldProperties */
	// unique (val) { return val; },

	/* API_EditRecord */
	// update_id (val) { return val; },

	/* API_AddUserToGroup, API_AddUserToRole, API_ChangeUserRole, API_GetUserRole, API_GrantedGroups, API_RemoveUserFromGroup, API_RemoveUserFromRole, API_SendInvitation */
	// userid (val) { return val; },

	/* API_Authenticate */
	// username (val) { return val; },

	/* API_CloneDatabase */
	// usersandroles (val) { return val; },

	/* API_SendInvitation */
	// usertext (val) { return val; },

	/* API_SetDBVar */
	// value (val) { return val; },

	/* API_GetDBVar, API_SetDBVar */
	// varname (val) { return val; },

	/* API_SetFieldProperties */
	// width (val) { return val; },

	/* API_GrantedDBs */
	// withembeddedtables (val) { return val; }
};

/* Expose Instances */
QuickBase.QueryBuilder = QueryBuilder;
QuickBase.Throttle = Throttle;
QuickBase.QuickBaseError = QuickBaseError;
QuickBase.Promise = Promise;

/* Expose Methods */
QuickBase.actions = actions;
QuickBase.prepareOptions = prepareOptions;
QuickBase.xmlNodeParsers = xmlNodeParsers;

/* Expose Properties */
QuickBase.className = 'QuickBase';
QuickBase.defaults = defaults;

/* Export Module */
if (typeof module !== 'undefined' && module.exports) {
	module.exports = QuickBase;
}else
if (typeof define === 'function' && define.amd) {
	define('QuickBase', [], function() {
		return QuickBase;
	});
}

if (typeof global !== 'undefined' && typeof window !== 'undefined' && global === window) {
	global.QuickBase = QuickBase;

	if (window.location.search.match(/debug=1/i)) {
		if (window.localStorage) {
			window.localStorage.debug = 'quickbase:*';
		}
	} else {
		QuickBase.Promise.config({
			longStackTraces: false
		});
	}
}
