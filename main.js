var xml = require('xml2js'),
	Promise = require('bluebird'),
	actions = require('./actions/index.js'),
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

			maxErrorRetryAttempts: 3
		};

		var quickbase = function(options){
			this.settings = utilities.mergeObjects(defaults, options || {});

			return this;
		};

		quickbase.prototype.api = function(action, options, nErr){
			var that = this,
				request = new quickbaseRequest(this, action, options);

			return Promise.bind(request)
				.then(request.addFlags)
				.then(request.prepareOptions)
				.then(request.constructPayload)
				.then(function(){
					if(actions[this.action] !== undefined){
						return actions[this.action](this);
					}else{
						return actions.default(this);
					}
				})
				.catch(function(err){
					if(nErr === undefined || nErr < that.settings.maxErrorRetryAttempts){
						if(err.code === 1000){
							return that.api(action, options, nErr ? ++nErr : 1);
						}else
						if(err.code === 4 && that.settings.username && that.settings.password){
							return that.api('API_Authenticate', {
								username: that.settings.username,
								password: that.settings.password
							}).then(function(){
								return that.api(action, options, nErr ? ++nErr : 1);
							});
						}
					}

					return err;
				});
		};

		var quickbaseRequest = function(parent, action, options){
			this.parent = parent;
			this.action = action;
			this.options = options;

			return this;
		};

		quickbaseRequest.prototype.addFlags = function(){
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

		quickbaseRequest.prototype.prepareOptions = function(){
			var newOptions = new prepareOptions(this.options);

			newOptions.prepare();

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

		return quickbase;
	})();

module.exports = quickbase;