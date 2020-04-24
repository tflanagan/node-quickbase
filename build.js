#!/usr/bin/env node

/* Dependencies */
const fs = require('fs');
const join = require('path').join;
const execNode = require('child_process').exec;

const minifyPath = join('.', 'node_modules', 'minify', 'bin', 'minify.js');
const browserifyPath = join('.', 'node_modules', 'browserify', 'bin', 'cmd.js');

/* Helpers */
const exec = async (cmd) => {
	return new Promise((resolve, reject) => {
		execNode(cmd, (err, stdout, stderr) => {
			if(err){
				err.stdout = stdout;
				err.stderr = stderr;

				return reject(err);
			}

			if(stderr && !stderr.match(/ExperimentalWarning/)){
				err = new Error('Command failed: ' + cmd);

				err.stdout = stdout;
				err.stderr = stderr;

				return reject(err);
			}

			resolve(stdout);
		});
	});
};

/* Build */
(async () => {
	try {
		let results;

		console.log('Compiling TypeScript...');
		await exec('npx tsc');

		console.log('Browserify...');
		await exec('node ' + browserifyPath + ' ./dist/quickbase.js > ./dist/quickbase.browserify.js');

		console.log('Minify...');
		await exec('node ' + minifyPath + ' ./dist/quickbase.browserify.js > ./dist/quickbase.browserify.min.js');

		console.log('Cleanup...');
		await exec([
			'rm ./dist/quickbase.browserify.js'
		].join(' && '));

		console.log('Done building.');
	}catch(err){
		console.error(err);
	}
})();
