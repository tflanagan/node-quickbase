var xml = require('xml2js'),
	http = require('http'),
	https = require('https'),
	Promise = require('bluebird'),
	utilities = require('./lib/utilities.js'),
	prepareOptions = require('./lib/prepareOptions.js'),
	quickbaseError = require('./lib/quickbaseError.js'),
	quickbase = (function(){
		var defaults = {
			realm: 'www',
			domain: 'quickbase.com',
			useSSL: true,

			flags: {
				useXML: true,
				msInUTC: true
			},

			status: {
				errcode: 0,
				errtext: 'No error',
				errdetail: ''
			}
		};

		var quickbase = function(options){
			this.settings = utilities.mergeObjects(defaults, options || {});

			return this;
		};

		quickbase.prototype.api = function(action, options){
			var that = this,
				request = new quickbaseRequest(action, options);

			return request
				.startPromiseChain()
				.bind(utilities.mergeObjects(request, this))
				.then(request.addFlags)
				.then(request.prepareOptions)
				.then(request.constructPayload)
				.then(request.send);
		};

		var quickbaseRequest = function(action, options){
			this.action = action;
			this.options = options;

			return this;
		};

		quickbaseRequest.prototype.startPromiseChain = function(){
			return Promise.resolve();
		};

		quickbaseRequest.prototype.addFlags = function(){
			if(this.settings.flags.msInUTC){
				this.options.msInUTC = 1;
			}

			if(this.settings.appToken){
				this.options.apptoken = this.settings.appToken;
			}

			if(this.settings.ticket){
				this.options.ticket = this.settings.ticket;
			}

			return Promise.resolve();
		};

		quickbaseRequest.prototype.prepareOptions = function(){
			var newOptions = new prepareOptions(this.options);

			this.options = newOptions.options;

			return Promise.resolve();
		};

		quickbaseRequest.prototype.constructPayload = function(){
			var builder = new xml.Builder({
				rootName: 'qdbapi',
				headless: true,
				renderOpts: {
					pretty: false
				}
			});

			if(this.settings.flags.useXML){
				this.payload = builder.buildObject(this.options);
			}else{
				var arg;

				for(arg in this.options){
					this.payload += '&' + arg + '=' + this.options[arg];
				}
			}

			return Promise.resolve();
		};

		quickbaseRequest.prototype.send = function(){
			var that = this;

			return new Promise(function(resolve, reject){
				var reqOpts = {
						hostname: [ that.settings.realm, that.settings.domain ].join('.'),
						port: that.settings.useSSL ? 443 : 80,
						path: '/db/' + (that.options.dbid || 'main') + '?act=' + that.action + (!that.settings.flags.useXML ? that.payload : ''),
						method: that.settings.flags.useXML ? 'POST' : 'GET',
						headers: {
							'Content-Type': 'application/xml',
							'QUICKBASE-ACTION': that.action
						}
					},
					protocol = that.settings.useSSL ? https : http,
					request = protocol.request(reqOpts, function(response){
						var xmlResponse = '';

						response.on('data', function(chunk){
							xmlResponse += chunk;
						});

						response.on('end', function(){
							xml.parseString(xmlResponse, function(err, result){
								if(err){
									return reject(new quickbaseError(1001, 'Error Parsing XML', err));
								}

								result = utilities.cleanXML(result.qdbapi);

								if(result.errcode !== that.settings.status.errcode){
									return reject(new quickbaseError(result.errcode, result.errtext, result.errdetail));
								}

								resolve(result);
							});
						});
					});

				request.on('error', function(err){
					reject(new quickbaseError(1000, 'Error Processing Request', err));
				});

				if(that.settings.flags.useXML){
					request.write(that.payload);
				}

				request.end();
			});
		};

		return quickbase;
	})();

module.exports = quickbase;