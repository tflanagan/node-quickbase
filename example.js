// npm install tflanagan/node-quickbase || npm install quickbase
var quickbase = require('quickbase');

var testSession = new quickbase({
	realm: 'www',
	appToken: '*****'
});

testSession.api('API_Authenticate', {
	username: '*****',
	password: '*****'
}).then(function(result){
	testSession.settings.ticket = result.ticket;

	return testSession.api('API_DoQuery', {
		dbid: '*****',
		clist: '3.12',
		options: 'num-5'
	}).then(function(result){
		return result.table.records;
	});
}).map(function(record){
	return testSession.api('API_EditRecord', {
		dbid: '*****',
		rid: record.$.rid,
		fields: [
			{ fid: 12, value: record.f[1]._ }
		]
	});
}).then(function(){
	return testSession.api('API_DoQuery', {
		dbid: '*****',
		clist: '3.12',
		options: 'num-5'
	});
}).then(function(result){
	console.log(result);
}).catch(function(err){
	console.error(err, err.stack);
});