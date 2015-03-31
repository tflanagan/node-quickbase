var xml = require('xml2js'),
	http = require('http'),
	https = require('https'),
	Promise = require('bluebird'),
	utilities = require('../lib/utilities.js'),
	quickbaseError = require('../lib/quickbaseError.js');

module.exports = function(context){
	var that = context;

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
							return reject(new quickbaseError(1001, 'Error Parsing XML', err));
						}

						result = utilities.cleanXML(result.qdbapi);

						if(result.errcode !== that.parent.settings.status.errcode){
							return reject(new quickbaseError(result.errcode, result.errtext, result.errdetail));
						}

						resolve(result);
					});
				});
			});

		request.on('error', function(err){
			reject(new quickbaseError(1000, 'Error Processing Request', err));
		});

		if(that.parent.settings.flags.useXML){
			request.write(that.payload);
		}

		request.end();
	});
};