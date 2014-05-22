node-quickbase
==============

A lightweight, very flexible QuickBase API

Setup
-----

```js
var quickbase = require('quickbase');

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
```

License
-------

Copyright 2014 Tristian Flanagan

Licensed under the Apache License, Version 2.0 (the "License"); you may not use these files except in compliance with the License. You may obtain a copy of the License at

http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
