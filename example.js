// npm install tflanagan/node-quickbase#es6
var QuickBase = require('quickbase');

var quickbase = new QuickBase({
	realm: 'www',
	appToken: '*****'
});

quickbase.api('API_Authenticate', {
	username: '*****',
	password: '*****'
}).then((result) => {
	return quickbase.api('API_DoQuery', {
		dbid: '*****',
		clist: '3.12',
		options: 'num-5'
	}).then((result) => {
		return result.table.records;
	});
}).each((record) => {
	return quickbase.api('API_EditRecord', {
		dbid: '*****',
		rid: record[3],
		fields: [
			{ fid: 12, value: record[12] }
		]
	});
}).then(() => {
	return quickbase.api('API_DoQuery', {
		dbid: '*****',
		clist: '3.12',
		options: 'num-5'
	});
}).then((result) => {
	console.log(result);
}).catch((err) => {
	console.error(err);
});