'use strict';

var fs = require('fs'),
	path = require('path');

module.exports = (function(){
	var actions = [];

	fs.readdirSync(__dirname)
		.filter(function(file){
			return (file.indexOf('.') !== 0) && (file !== 'index.js');
		})
		.forEach(function(file){
			var action = require(path.join(__dirname, file)),
				actionName = file.split('.');

			actionName.splice(actionName.length - 1, 1);

			actions[actionName.join('.')] = action;
		});

	return actions;
})();