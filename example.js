// npm install tflanagan/node-quickbase || npm install quickbase
var QuickBase = require('quickbase');

var quickbase = new QuickBase({
	realm: 'www',
	appToken: '*****'
});

quickbase.api('API_Authenticate', {
	username: '*****',
	password: '*****'
}).then(function(result){
	return quickbase.api('API_DoQuery', {
		dbid: '*****',
		clist: '3.12',
		options: 'num-5'
	}).then(function(result){
		return result.table.records;
	});
}).map(function(record){
	return quickbase.api('API_EditRecord', {
		dbid: '*****',
		rid: record[3],
		fields: [
			{ fid: 12, value: record[12] }
		]
	});
}).then(function(){
	return quickbase.api('API_DoQuery', {
		dbid: '*****',
		clist: '3.12',
		options: 'num-5'
	});
}).then(function(result){
	console.log(result);
}).catch(function(err){
	console.error(err);
});