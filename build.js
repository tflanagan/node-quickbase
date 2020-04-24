#!/usr/bin/env node

/* Dependencies */
const execNode = require('child_process').exec;

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
		console.log('Compiling TypeScript...');
		await exec('npx tsc');

		console.log('Browserify...');
		await exec('npx browserify ./dist/quickbase.js > ./dist/quickbase.browserify.js');

		console.log('Minify...');
		await exec('npx minify ./dist/quickbase.browserify.js > ./dist/quickbase.browserify.min.js');

		console.log('Cleanup...');
		await exec([
			'rm ./dist/quickbase.browserify.js'
		].join(' && '));

		console.log('Done building.');
	}catch(err){
		console.error(err);
	}
})();
