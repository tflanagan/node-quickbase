node-quickbase
==============

[![npm license](https://img.shields.io/npm/l/quickbase.svg)](https://www.npmjs.com/package/quickbase) [![npm version](https://img.shields.io/npm/v/quickbase.svg)](https://www.npmjs.com/package/quickbase) [![npm downloads](https://img.shields.io/npm/dm/quickbase.svg)](https://www.npmjs.com/package/quickbase)

A lightweight, very flexible QuickBase API

[API Documentation](https://github.com/tflanagan/node-quickbase/blob/master/documentation/api.md)

Install
-------
```
# Latest Stable Release
$ npm install quickbase

# Latest Commit
$ npm install tflanagan/node-quickbase
```

Browserify
----------
This library works out of the box with Browserify.
```
$ npm install quickbase
$ npm install -g browserify
$ browserify node_modules/quickbase > quickbase.browserify.js
```
This exposes the QuickBase object to the global namespace (```window.QuickBase || QuickBase```).

__Warning: Native Browser Promises do not share the same functionality as Bluebird Promises!__

Chaining functions off of an ```.api()``` function call uses the Bluebird Promise Library. Declaring a ```new Promise()``` uses Native Browser Promises (if available).

```
$ npm install -g minifier
$ minify --output quickbase.browserify.min.js quickbase.browserify.js
```

The use is the same as in Nodejs, but there is no need to ```require('quickbase')```.

```html
<script type="text/javascript" src="quickbase.browserify.js"></script>
<script type="text/javascript">
	var quickbase = new QuickBase({
		realm: 'www',
		appToken: '*****'
	});

	...
</script>
```

Example
-------
```javascript
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
```

License
-------

Copyright 2014 Tristian Flanagan

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
