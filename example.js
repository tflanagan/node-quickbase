// npm install tflanagan/node-quickbase || npm install quickbase
var quickbase = require('../main.js');

var testSession = new quickbase({
	realm: 'www',
	appToken: '*****'
});

testSession.api('API_Authenticate', {
	username: '*****',
	password: '*****'
}).then(function(response){
	testSession.settings.ticket = response.ticket;
}).then(function(){
	return testSession.api('API_DoQuery', {
		dbid: 'byi72jemb',
		clist: 'a'
	});
}).then(function(response){
	console.log(response);
}).catch(function(err){
	console.error(err);
});
