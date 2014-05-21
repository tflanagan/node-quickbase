var quickbase = require('./QuickBase.js');

var qb = new quickbase({
	realm: 'www',
	username: 'username',
	password: 'password',
	appToken: 'appToken'
}, function(err, results){
	if(results){
		qb.api('API_DoQuery', {
			dbid: 'bby2j1bme',
			clist: ['1', '2', '3'],
			query: "{'3'.EX.'50'}"
		}, function(err, results){
			console.log(err, results);
		});

		qb.api('API_DoQuery', {
			dbid: 'bby2j1bme',
			clist: '2.3',
			slist: ['3'],
			query: "{'3'.XEX.'50'}"
		}, function(err, results){
			console.log(err, results);
		});
	}else{
		console.log('Not Connected');
	}
});