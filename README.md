node-quickbase
==============

A lightweight, very flexible QuickBase API

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
This library works out of the box with Browserify, this is not heavily tested, please use caution and report any bugs.
```
$ cd node_modules/node-quickbase
$ browserify -r ./main.js:quickbase > quickbase.browserify.js
```

```html
<script type="text/javascript" src="node_modules/node-quickbase/quickbase.browserify.js"></script>
<script type="text/javascript">
	var QuickBase = require('quickbase');

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
		rid: record.$.rid,
		fields: [
			{ fid: 12, value: record.f[1]._ }
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