var quickbase = require('./QuickBase.js');

var qb = new quickbase({
	realm: 'www',
	appToken: 'appToken'
}, function(err, results){
	qb.api('API_DoQuery', {
		dbid: 'bby2j1bme',
		clist: ['1', '2', '3'],
		query: "{'3'.EX.'50'}"
	}, function(err, results){
		// Queued and fired after Authenticate is successful

		console.log(err, results);
	});

	qb.api('API_DoQuery', {
		dbid: 'bby2j1bme',
		clist: '2.3',
		slist: ['3'],
		query: "{'3'.XEX.'50'}"
	}, function(err, results){
		// Queued and fired after Authenticate is successful

		console.log(err, results);
	});
});

qb.api('API_Authenticate', {
	username: 'username',
	password: 'password'
}, function(err, results){
	var message = 'Connected';

	if(!results){
		message = 'Not ' + message;
	}

	console.log(message);

	qb.api('API_DoQuery', {
		dbid: 'bby2j1bme',
		clist: '2.3',
		slist: ['3'],
		query: "{'3'.XEX.'50'}"
	}, function(err, results){
		// Fired instantly, if connected

		console.log(err, results);
	});
});

qb.api('API_DoQuery', {
	dbid: 'bby2j1bme',
	clist: '2.3',
	slist: ['3'],
	query: "{'3'.XEX.'50'}"
}, function(err, results){
	// Fired after Authenticate is successful

	console.log(err, results);
});