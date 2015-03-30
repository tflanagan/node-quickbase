var quickbase = require('../main.js');

var testSession = new quickbase({
	realm: 'data',
	appToken: 'd9mrhd5y94j4ndwu7m4gce3fgag'
});

testSession.api('API_Authenticate', {
	username: 'tflanagan@datacollaborative.com',
	password: 'Ga,mmd!1'
}).then(function(response){
	testSession.settings.ticket = response.ticket;

	// for(var i = 0, l = 50; i < l; ++i){
		return testSession.api('API_DoQuery', {
			dbid: 'biy2j7bme',
			clist: 'a'
		});
	// }
}).then(function(){
	console.log(arguments);
}).catch(function(err){
	console.error(err);
	console.error(err.stack);
});