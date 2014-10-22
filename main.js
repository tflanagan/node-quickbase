var xml = require('xml2js'),
	http = require('http'),
	https = require('https'),
	events = require('./lib/events.js'),
	utilities = require('./lib/utilities.js'),
	quickbase = (function(){
		var queue = [],
			settings = {
				ticket: ''
			};

		var quickbase = function(options, callback){
			var that = this,
				defaults = {
					realm: 'www',
					domain: 'quickbase.com',
					username: '',
					password: '',
					appToken: '',
					hours: 12,
					useSSL: true,

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

					errorCodes: {
						badTicket: 4
					},

					autoStart: true,
					connected: false,
					handlingBadTicket: false,
					maxAuthRetries: 3,
					authRetriesI: 0,
					noErrorReturnNull: false
				};

			settings = utilities.mergeObjects(settings, defaults, options || {});

			this.on('authenticated', this.processQueue);
			this.on('bad-ticket', function(){
				if(!settings.handlingBadTicket){
					settings.handlingBadTicket = true;

					that.api('API_Authenticate', {
						username: settings.username,
						password: settings.password,
						hours: settings.hours
					}, function(){
						settings.handlingBadTicket = false;
					});
				}
			});

			if(settings.autoStart){
				if(settings.ticket !== ''){
					settings.connected = true;
					this.emit('authenticated', settings.ticket);

					if(typeof(callback) === 'function'){
						callback(settings.noErrorReturnNull ? null : settings.status, settings.ticket);
					}
				}else
				if(settings.username && settings.password){
					this.api('API_Authenticate', {
						username: settings.username,
						password: settings.password,
						hours: settings.hours
					}, callback);
				}
			}

			return this;
		};

		quickbase.prototype.__proto__ = events.EventEmitter2.prototype;

		quickbase.prototype.setSettings = function(newSettings){
			settings = utilities.mergeObjects(settings, newSettings || {});

			return settings;
		};

		quickbase.prototype.getSettings = function(){
			return settings;
		};

		quickbase.prototype.api = function(action, payload, callback){
			if(callback === undefined){
				callback = function(){};
			}

			var that = this,
				transaction,
				payload = {
					action: action,
					payload: payload,
					callback: callback
				};

			if(!settings.connected && action !== 'API_Authenticate'){
				queue.push(payload);
			}else{
				if(actions.prototype[action]){
					transaction = new actions(action, payload);
				}else{
					transaction = new transmit(payload);
				}

				transaction.onAny(function(type){
					var args = buildEventArgs(type, arguments);

					that.emit.apply(that, args);
				});
			}
		};

		quickbase.prototype.processQueue = function(){
			var request;

			while(queue.length > 0){
				request = queue.shift();

				this.api(request.action, request.payload, request.callback);
			}
		};

		var transmit = function(options){
			var that = this,
				payload = this.assemblePayload(options.payload),
				reqOpts = {
					hostname: [settings.realm, settings.domain].join('.'),
					port: settings.useSSL ? 443 : 80,
					path: '/db/' + (options.payload.dbid || 'main') + '?act=' + options.action + (!settings.flags.useXML ? payload : ''),
					method: settings.flags.useXML ? 'POST' : 'GET',
					headers: {
						'Content-Type': 'application/xml',
						'QUICKBASE-ACTION': options.action
					}
				},
				requestCallback = function(response){
					var xmlResponse = '';

					response.on('data', function(chunk){
						xmlResponse += chunk;
					});

					response.on('end', function(){
						xml.parseString(xmlResponse, function(err, result){
							if(err || result === null){
								var err = {
									errcode: 1001,
									errtext: 'Error Parsing XML',
									errdetail: err
								};

								that.emit('error', err);
								options.callback(err);

								return false;
							}

							result = utilities.cleanXML(result.qdbapi);

							if(result.errcode !== settings.status.errcode){
								var err = {
									errcode: result.errcode,
									errtext: result.errtext,
									errdetail: result.errdetail
								};

								if(err.errcode === settings.errorCodes.badTicket){
									settings.connected = false;

									queue.push(options);

									that.emit('bad-ticket');
								}else{
									that.emit('error', err);
									options.callback(err);
								}

								return false;
							}

							options.callback(settings.noErrorReturnNull ? null : settings.status, result);
						});
					});
				},
				request = settings.useSSL ? https.request(reqOpts, requestCallback) : http.request(reqOpts, requestCallback);

			request.on('error', function(err){
				err = {
					errcode: 1000,
					errtext: 'Error Processing Request',
					errdetail: err
				};

				that.emit('error', err);
				options.callback(err);
			});

			if(settings.flags.useXML){
				request.write(payload);
			}

			request.end();

			return this;
		};

		transmit.prototype.__proto__ = events.EventEmitter2.prototype;

		transmit.prototype.assemblePayload = function(payload){
			payload = new preparePayload(payload);
			payload = this.addFlags(payload);
			payload = this.constructPayload(payload);

			return payload;
		};

		transmit.prototype.constructPayload = function(payload){
			var newPayload = '',
				builder = new xml.Builder({
					rootName: 'qdbapi',
					headless: true,
					renderOpts: {
						pretty: false
					}
				});

			if(settings.flags.useXML){
				newPayload = builder.buildObject(payload);
			}else{
				var arg;

				for(arg in payload){
					newPayload += '&' + arg + '=' + payload[arg];
				}
			}

			return newPayload;
		};

		transmit.prototype.addFlags = function(payload){
			if(settings.flags.msInUTC){
				payload.msInUTC = 1;
			}

			if(settings.appToken){
				payload.apptoken = settings.appToken;
			}

			if(settings.ticket){
				payload.ticket = settings.ticket;
			}

			return payload;
		};

		var preparePayload = function(payload){
			var arg;

			if(payload.fields !== undefined){
				payload.field = payload.fields;

				delete payload.fields;
			}

			for(arg in payload){
				if(typeof(this[arg]) === 'function'){
					payload[arg] = this[arg](payload[arg]);
				}
			}

			return payload;
		};

		preparePayload.prototype.clist = function(val){
			return val instanceof Array ? val.join('.') : val;
		};

		preparePayload.prototype.clist_output = function(val){
			return val instanceof Array ? val.join('.') : val;
		};

		preparePayload.prototype.slist = function(val){
			return val instanceof Array ? val.join('.') : val;
		};

		preparePayload.prototype.options = function(val){
			return val instanceof Array ? val.join('.') : val;
		};

		preparePayload.prototype.records_csv = function(val){
			return val instanceof Array ? val.join('\n') : val;
		};

		preparePayload.prototype.field = function(val){
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
		};

		/* Customized API Calls */
		var actions = function(action, payload){
			var that = this,
				transaction = this[action](payload);

			transaction.onAny(function(type){
				var args = buildEventArgs(type, arguments);

				that.emit.apply(that, args);
			});

			return this;
		};

		actions.prototype.__proto__ = events.EventEmitter2.prototype;

		actions.prototype.API_Authenticate = function(payload){
			var that = this;

			if(settings.authRetriesI >= settings.maxAuthRetries){
				var err = {
					errcode: 1002,
					errtext: 'Max Authenticated Attempts Reached',
					errdetail: 'The process has exceeded the maximum allowed Authentication attempts'
				};

				settings.connected = false;
				settings.authRetriesI = 0;

				payload.callback(err);
				this.emit('error', err);

				return false;
			}

			++settings.authRetriesI;

			payload.origCallback = payload.callback;
			payload.callback = function(err, results){
				if(err.errcode !== settings.status.errcode){
					payload.origCallback(err);

					return false;
				}

				settings.ticket = results.ticket;
				settings.connected = true;
				settings.authRetriesI = 0;

				that.emit('authenticated', settings.ticket);
				payload.origCallback(settings.noErrorReturnNull ? null : settings.status, settings.ticket);
			};

			return new transmit(payload);
		};

		actions.prototype.API_DoQuery = function(payload){
			if(settings.flags.returnPercentage){
				payload.payload.returnPercentage = 1;
			}

			if(settings.flags.includeRids){
				payload.payload.includeRids = 1;
			}

			if(settings.flags.fmt){
				payload.payload.fmt = settings.flags.fmt;
			}

			return new transmit(payload);
		};

		function buildEventArgs(type, arguments){
			var l = arguments.length,
				args = new Array(l - 1);

			for(var i = 1; i < l; ++i){
				args[i - 1] = arguments[i];
			}

			args.unshift(type);

			return args;
		};

		return quickbase;
	})();

module.exports = quickbase;