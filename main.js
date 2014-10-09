var xml = require('xml2js'),
	https = require('https'),
	utilities = require('lib/utilities.js'),
	quickbase = (function(){
		var ticket = '';

		var quickbase = function(options, callback){
			var defaults = {
				realm: 'www',
				domain: 'quickbase.com',
				username: '',
				password: '',
				appToken: '',
				hours: 12,

				queries: {
					useXML: true,
					msInUTC: true,
					includeRids: true,
					fmt: 'structured'
				},

				status: {
					code: 0,
					text: 'No error',
					details: ''
				},

				autoStart: true,
				queuePollInterval: 500
			};

			this.settings = utilities.mergeObjects({
				ticket: ticket
			}, defaults, options || {});

			if(this.settings.autoStart){
				if(this.settings.ticket !== ''){
					callback();
				}else
				if(this.settings.username && this.settings.password){
					this.api('API_Authenticate', {
						username: this.settings.username,
						password: this.settings.password,
						hours: this.settings.hours
					}, callback);
				}
			}

			return this;
		};

		quickbase.prototype.api = function(action, payload, callback){
			return new transmit({
				action: action,
				payload: payload,
				callback: callback,
				response: {
					error: this.settings.status
					results: null
				}
			});
		};

		var transmit = function(options){

		};

		var 

		return quickbase;
	})();

module.exports = quickbase;