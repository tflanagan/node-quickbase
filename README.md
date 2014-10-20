node-quickbase
==============

A lightweight, very flexible QuickBase API

Upgrading from v0.0.* to v0.1.*
------------------------
Upgrading from v0.0.* to v0.1.* has potential to break code. v0.1.0 is a complete rewrite, losing a lot of extra baggage.

Things removed:
* QueryEdit API calls
* Unstructured ImportFromCSV API calls

Some of these features may come back into the fold in future releases, sorry for any inconvenience. 

Example
-----

```js
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
```

Inner Workings
--------------
###Constructor

```new quickbase(<object> options[, <function> callback]);```

```
Options = {
    realm: 'www',
	domain: 'quickbase.com',
	username: '',
	password: '',
	appToken: '',
	hours: 12,

	flags: {
		useXML: true,
		msInUTC: true,
		includeRids: true,
		returnPercentage: false,
		fmt: 'structured'
	},

	autoStart: true
}
```
```callback(err, ticket)``` is optional.

###setSettings

```quickbase.setSettings(<object> options); ```

Upserts the internal settings variable.

###getSettings

```quickbase.getSettings(); ```

Returns the internal settings variable.

###api
```quickbase.api(<string> action, <object> payload[, <function> callback]);```

```action``` = API Action String, ie: ```API_DoQuery```, ```API_EditRecord```, etc

```payload``` = Object of XML elements and values, ie:
```
Payload = {
    dbid: 'aabbccdde',
    clist: '1.2.3',
    slist: '3',
    options: 'num-5'
}
```

```callback(err, results)``` is optional.

###processQueue
```quickbase.processQueue(); ```

Processes all queue'd requests. Is fired internally whenever a successful API_Authenticate is completed.

License
-------

Copyright 2014 Tristian Flanagan

Licensed under the Apache License, Version 2.0 (the "License"); you may not use these files except in compliance with the License. You may obtain a copy of the License at

http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
