var https = require('https'),
	xml = require('xml2js'),
	_ = require('underscore');

function quickbase(options, callback){
	this._defaults = {
		realm: 'www',
		domain: 'quickbase.com',
		username: '',
		password: '',
		appToken: '',
		ticket: '',

		hours: 12,
		useXML: true,
		msInUTC: true,
		includeRids: true,
		fmt: 'structured',

		status: {
			code: 0,
			text: 'No error',
			details: ''
		},

		queuePollInterval: 1000
	};

	this.connected = false;
	this.settings = _.extend({}, this._defaults, options);
	this.queries = [];

	var that = this;

	if(this.settings.username != '' && this.settings.password != ''){
		this.api('API_Authenticate', {
			username: this.settings.username,
			password: this.settings.password,
			hours: this.settings.hours
		}, function(err, results){
			if(typeof(callback) === 'function'){
				callback.call(that, err, results);
			}
		});
	}else
	if(typeof(callback) === 'function'){
		setTimeout(function(){
			callback.call(that, that.settings.status, that.connected);
		});
	}

	return this;
}

quickbase.prototype = {
	_assemblePayload: function(query){
		if(this.settings.appToken != ''){
			this.queries[query].options.apptoken = this.settings.appToken;
		}

		if(this.settings.ticket != ''){
			this.queries[query].options.ticket = this.settings.ticket;
		}

		if(this.settings.msInUTC){
			this.queries[query].options.msInUTC = 1;
		}

		if(this.settings.includeRids){
			this.queries[query].options.includeRids = 1;
		}

		if(this.settings.fmt != ''){
			this.queries[query].options.fmt = this.settings.fmt;
		}

		for(var option in this.queries[query].options){
			this.queries[query].options[option] = this._prepareOption.call(this, option, this.queries[query].options[option]);
		}

		return this._preparePayload.call(this, query);
	},

	_pollForQueue: function(){
		if(this.connected){
			clearInterval(this.queueInterval);

			for(var query in this.queries){
				if(this.queries[query]._inQueue){
					this.queries[query]._inQueue = false;

					this._transmit.call(this, query, this.queries[query]._internalCB);
				}
			}
		}
	},

	_prepareOption: function(option, value){
		if(option.match(/^_/)){
			return value;
		}

		try {
			return this._prepareOption.prototype[option](value);
		}catch(e){
			return value;
		}
	},

	_preparePayload: function(query){
		var payload = '',
			builder = new xml.Builder({
				rootName: 'qdbapi',
				renderOpts: {
					'pretty': false,
					'strict': false,
					'async': false
				}
			});

		if(this.settings.useXML){
			return builder.buildObject(this.queries[query].options);
		}

		for(var option in this.queries[query].options){
			payload += '&' + option + '=' + this.queries[query].options[option];
		}

		return payload;
	},

	_reconstructXMLResult: function(result){
		for(var node in result){
			if(typeof(result[node]) === 'object' && result[node].length == 1){
				result[node] = result[node][0];
			}

			if(typeof(result[node]) === 'object'){
				result[node] = this._reconstructXMLResult(result[node]);
			}

			if(typeof(result[node]) === 'string'){
				var pFloat = parseFloat(result[node]);

				if(pFloat !== NaN && pFloat == result[node]){
					result[node] = pFloat;
				}
			}
		}

		return result;
	},

	_transmit: function(query, cb){
		var that = this;

		if(!this.connected && this.queries[query].action != 'API_Authenticate'){
			this.queries[query]._inQueue = true;
			this.queries[query]._internalCB = cb;

			if(typeof(this.queueInterval) === 'undefined'){
				this.queueInterval = setInterval(function(){
					that._pollForQueue.call(that);
				}, this.settings.queuePollInterval);
			}

			return false;
		}

		var options = {
				hostname: this.settings.realm + '.' + this.settings.domain,
				port: 443,
				path: '/db/' + (this.queries[query].options.dbid || 'main') + '?act=' + this.queries[query].action + (this.settings.useXML ? '' : this._assemblePayload.call(this, query)),
				method: (this.settings.useXML ? 'POST' : 'GET'),
				headers: {
					'Content-Type': 'application/xml',
					'QUICKBASE-ACTION': this.queries[query].action
				}
			},
			request = https.request(options, function(res){
				var xmlResponse = '';
				that.queries[query]._inProgress = true;

				res.on('data', function(chunk){
					xmlResponse += chunk;
				});

				res.on('end', function(){
					if(!that.settings.useXML){
						that._return.call(that, query, null, null, null, xmlResponse);

						return false;
					}

					try {
						var parser = xml.parseString,
							status = {},
							response;

						parser(xmlResponse, function(err, result){
							if(err){
								that._return.call(that, query, 1004, 'Error Parsing XML', err);

								return false;
							}

							result = result.qdbapi;

							try {
								status.code = result.errcode[0];
								status.text = result.errtext[0];
								status.details = result.errdetail[0];
							}catch(e){
								// Do Nothing
							}

							delete result.action;
							delete result.errcode;
							delete result.errtext;
							delete result.errdetail;

							response = that._reconstructXMLResult.call(that, result);
						});
					}catch(e){
						that._return.call(that, query, 1005, 'Error Parsing XML', e);
					}

					if(status.code == 4 && typeof(that.badTicket) === 'undefined'){
						that.badTicket = true;
						that.connected = false;

						that.api('API_Authenticate', {
							username: that.settings.username,
							password: that.settings.password
						}, function(err, results){
							if(results){
								delete that.badTicket;

								that._transmit(query, cb);
							}
						});
					}else{
						that.queries[query]._inProgress = false;
						that.queries[query]._completed = true;
						that.queries[query].transmission.end = new Date();
						that.queries[query].transmission.elapsed = that.queries[query].transmission.end - that.queries[query].transmission.start;

						if(typeof(cb) === 'function'){
							cb(
								{
									code: status.code || that.settings.status.code,
									text: status.text || that.settings.status.text,
									details: status.details || that.settings.status.details
								},
								response
							);
						}else{
							that._return.call(that, query, status.code, status.text, status.details, response);
						}
					}
				});
			});

		request.on('error', function(err){
			that._return.call(this, query, 1003, 'Error in Request', err.message);
		});

		if(this.settings.useXML){
			request.write(this._assemblePayload.call(this, query));
		}

		request.end();
	},

	_return: function(query, code, text, details, results){
		var status = {
				code: code || this.settings.status.code,
				text: text || this.settings.status.text,
				details: details || this.settings.status.details
			};

		this.queries[query].response = {status: status, results: results};

		if(typeof(this.queries[query].callback) === 'function'){
			this.queries[query].callback.call(this, status, results);
		}
	},

	api: function(action, options, callback){
		var query = options._queryIndex || this.queries.length;

		this.queries[query] = {
			_queryIndex: query,
			_inQueue: false,
			_inProgress: false,
			_completed: false,
			action: action,
			options: options,
			callback: callback,
			transmission: {
				start: new Date()
			},
			response: {
				status: this.settings.status,
				results: null
			}
		};

		if(this.queries[query].action.match(/^_/) || this.queries[query].action == 'api'){
			this._return.call(this, query, 1001, 'Invalid Action', 'Actions starting with _ are reservered');
		
			return false;
		}

		try {
			return this.api.prototype[this.queries[query].action].call(this, query);
		}catch(e){
			try {
				return this._transmit.call(this, query, false);
			}catch(e){
				this._return.call(this, query, 1002, 'Invalid Action', e);
			}
		}
	}
};

quickbase.prototype.api.prototype = {
	API_Authenticate: function(query){
		var that = this;

		if(typeof(this.queries[query].options.hours) === 'undefined'){
			this.queries[query].options.hours = this.settings.hours;
		}

		return this._transmit.call(this, query, function(err, results){
			if(err.code == 0){
				that.connected = true;
				that.settings.ticket = results.ticket;
			}

			if(typeof(that.queries[query].callback) === 'function'){
				that.queries[query].callback.call(that, err, that.connected);
			}
		});
	},

	API_DoQuery: function(query){
		var that = this;

		return this._transmit.call(this, query, function(err, results){
			if(err.code == 0){
				var records = [];

				for(var i = 0; i < results.table.records.record.length; i++){
					var record = results.table.records.record[i];
					var newRecord = {};

					for(var attribute in record.$){
						newRecord[attribute] = record.$[attribute];
					}

					for(var field in record.f){
						newRecord[record.f[field].$.id] = record.f[field]._;
					}

					records.push(newRecord);
				}

				results.table.records = records;
				results.table.queries = results.table.queries.query;
				results.table.fields = results.table.fields.field;
			}

			if(typeof(that.queries[query].callback) === 'function'){
				that.queries[query].callback.call(that, err, results);
			}
		});
	}
};

quickbase.prototype._prepareOption.prototype = {
	_joinIfArray: function(value, del){
		if(typeof(value) === 'object'){
			value = value.join(del);
		}

		return value;
	},

	clist: function(value){
		return this._prepareOption.prototype._joinIfArray(value);
	},

	slist: function(value){
		return this._prepareOption.prototype._joinIfArray(value);
	},

	options: function(value){
		return this._prepareOption.prototype._joinIfArray(value);
	}
};

module.exports = quickbase;