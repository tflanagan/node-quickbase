// npm install tflanagan/node-quickbase || npm install quickbase
var quickbase = require('quickbase');

var qb = new quickbase({
	realm: 'www',
	appToken: 'appToken',
	username: 'username',
	password: 'password'
	// You can use an already established session by providing a ticket
	// ticket: ''
}, function(err, results){
	console.log('Authenticated callback');

	qb.api('API_DoQuery', {
		dbid: 'bby2j1bme',
		clist: ['1', '2', '3'],
		query: "{'3'.EX.'50'}"
	}, function(err, results){
		console.log(err, results);
	});

	qb.api('API_AddRecord', {
		dbid: 'bby2j1bme',
		fields: [
			{fid: 6, value: 'test value'},
			{fid: 7, value: 'test value 2'}
		]
	}, function(err, results){
		console.log(err, results);
	});
});

qb.on('error', function(err){
	console.error('Error Occured Event', err);
});

qb.on('authenticated', function(ticket){
	console.log('Authenticated Event');
});

// These requests are queued until the 'authenticated' event fires
qb.api('API_DoQuery', {
	dbid: 'bby2j1bme',
	clist: ['1', '2', '3'],
	query: "{'3'.EX.'50'}"
}, function(err, results){
	console.log(err, results);
});

qb.api('API_AddRecord', {
	dbid: 'bby2j1bme',
	fields: [
		{fid: 6, value: 'test value'},
		{fid: 7, value: 'test value 2'}
	]
}, function(err, results){
	console.log(err, results);
});