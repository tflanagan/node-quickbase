#!/usr/bin/env node

/* Dependencies */
const fs = require('fs');
const minify = require('minify');
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

const readFile = async (path) => {
	return new Promise((resolve, reject) => {
		fs.readFile(path, (err, buffer) => {
			if(err){
				return reject(err);
			}

			resolve(buffer);
		});
	});
};

const writeFile = async (path, data) => {
	return new Promise((resolve, reject) => {
		fs.writeFile(path, data, (err) => {
			if(err){
				return reject(err);
			}

			resolve();
		});
	});
};

/* Build */
(async () => {
	try {
		let searchStr, searchRgx;

		console.log('Compiling TypeScript for Node...');
		await exec('npx tsc');

		console.log('Injecting Promise polyfill...');
		const source = await readFile('./dist/quickbase.js');

		searchStr = 'const axios_1 =';
		searchRgx = new RegExp(searchStr);

		await writeFile('./dist/quickbase.prep.js', source.toString().replace(searchRgx, [
			'const Promise = require(\'bluebird\');',
			'if(!global.Promise){ global.Promise = Promise; }',
			searchStr
		].join('\n')));

		console.log('Browserify...');
		await exec('npx browserify ./dist/quickbase.prep.js > ./dist/quickbase.browserify.js');

		console.log('Compiling for Browser...');
		await exec('npx tsc --project ./tsconfig-es5.json');

		console.log('Minify...');
		const results = await minify('./dist/tmp/quickbase.browserify.js');
		const license = await readFile('./LICENSE');

		searchStr = 'var i=this&&this.__importDefault';
		searchRgx = new RegExp(searchStr);

		await writeFile('./dist/quickbase.browserify.min.js', results.toString().replace(searchRgx, [
			license.toString().split('\n').map((line, i, lines) => {
				line = ' * ' + line;

				if(i === 0){
					line = '\n/*!\n' + line;
				}else
				if(i === lines.length - 1){
					line += '\n*/';
				}

				return line;
			}).join('\n'),
			searchStr
		].join('\n')));

		console.log('Cleanup...');
		await exec([
			'rm -rf ./dist/tmp/',
			'rm ./dist/quickbase.prep.js',
			'rm ./dist/quickbase.browserify.js'
		].join(' && '));

		console.log('Done building.');
	}catch(err){
		console.error(err);
	}
})();
