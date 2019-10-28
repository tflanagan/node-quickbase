node-quickbase
==============

[![npm license](https://img.shields.io/npm/l/quickbase.svg)](https://www.npmjs.com/package/quickbase) [![npm version](https://img.shields.io/npm/v/quickbase.svg)](https://www.npmjs.com/package/quickbase) [![npm downloads](https://img.shields.io/npm/dm/quickbase.svg)](https://www.npmjs.com/package/quickbase) [![Build Status](https://travis-ci.org/tflanagan/node-quickbase.svg)](https://travis-ci.org/tflanagan/node-quickbase)

A lightweight, very flexible QuickBase API

[API Documentation](https://github.com/tflanagan/node-quickbase/blob/master/documentation/api.md)

Install
-------
```
$ npm install quickbase@alpha
```

Example
-------
```javascript
'use strict';

const QuickBase = require('quickbase');

const quickbase = new QuickBase({
	realm: 'www',
	clientId: '*****',
	clientSecret: '*****',
	userToken: '*****'
});

quickbase.getApp('bb3ay23za').then((results) => {
	console.log(results);
}).catch((err) => {
	console.error(err);
});
```

Class
-----
```javascript
class QuickBase {

	public object defaults;

	public function constructor(options);

	public function getApp(appId);
	public function getAppTables(appId);
	public function getFields(tableId);
	public function getField(tableId, fieldId);
	public function getReport(tableId, reportId);
	public function getTable(tableId);
	public function getTableReports(tableId);
	public function runReport(tableId, reportId);

	public class Throttle([maxConnections = 10[, errorOnConnectionLimit = false]]);
	public class Promise;

}
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
