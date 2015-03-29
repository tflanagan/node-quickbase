// npm install tflanagan/node-quickbase || npm install quickbase
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
}).then(function(){
	return testSession.api('API_DoQuery', {
		dbid: 'biy2j7bme',
		clist: 'a'
	});
}).then(function(response){
	console.log(response);
}).catch(function(err){
	console.error(err.stack);
});