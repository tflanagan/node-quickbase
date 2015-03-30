// npm install tflanagan/node-quickbase || npm install quickbase
var quickbase = require('../main.js');

var testSession = new quickbase({
	realm: 'data',
	appToken: 'd9mrhd5y94j4ndwu7m4gce3fgag'
});

testSession.api('API_Authenticate', {
	username: 'tflanagan@datacollaborative.com',
	password: 'Ga,mmd!1'
}).then(function(result){
	testSession.settings.ticket = result.ticket;

	return testSession.api('API_DoQuery', {
		dbid: 'biy2j7bme',
		clist: '3.12',
		options: 'num-5'
	}).then(function(result){
		return result.table.records;
	});
}).map(function(record){
	return testSession.api('API_EditRecord', {
		dbid: 'biy2j7bme',
		rid: record.$.rid,
		fields: [
			{ fid: 12, value: record.f[1]._ }
		]
	});
}).then(function(){
	return testSession.api('API_DoQuery', {
		dbid: 'biy2j7bme',
		clist: '3.12',
		options: 'num-5'
	});
}).then(function(result){
	console.log(result);
}).catch(function(err){
	console.error(err, err.stack);
});