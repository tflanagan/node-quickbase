// npm install tflanagan/node-quickbase
var QuickBase = require('quickbase');

var quickbase = new QuickBase({
	realm: 'www',
	appToken: '*****'
});

/* Promise Based */
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

/* Callback Based */
quickbase.api('API_Authenticate', {
	username: '*****',
	password: '*****'
}, (err, result) => {
	if(err){
		throw err;
	}

	quickbase.api('API_DoQuery', {
		dbid: '*****',
		clist: '3.12',
		options: 'num-5'
	}, (err, result) => {
		if(err){
			throw err;
		}

		let i = 0,
			fin = () => {
				++i;

				if(i === result.table.records.length){
					quickbase.api('API_DoQuery', {
						dbid: '*****',
						clist: '3.12',
						options: 'num-5'
					}, (err, result) => {
						if(err){
							throw err;
						}

						console.log('done');
					})
				}
			};

		result.table.records.forEach((record) => {
			quickbase.api('API_EditRecord', {
				dbid: '*****',
				rid: record[3],
				fields: [
					{ fid: 12, value: record[12] }
				]
			}, (err, results) => {
				if(err){
					throw err;
				}

				fin();
			});
		});
	});
});