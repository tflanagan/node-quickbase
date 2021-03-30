#!/usr/bin/env node

/* Dependencies */
const fs = require('fs');
const pkg = require('./package.json');
const minify = require('minify');
const execNode = require('child_process').exec;
const Browserify = require('browserify');
const { transpileModule } = require('typescript');

/* Helpers */
const browserify = async (files, options) => {
	return new Promise((resolve, reject) => {
		const b = new Browserify(files, options);

		b.bundle((err, src) => {
			if(err){
				return reject(err);
			}

			resolve(src);
		});
	});
};

const exec = async (cmd) => {
	return new Promise((resolve, reject) => {
		execNode(cmd, (err, stdout, stderr) => {
			if(err){
				err.stdout = stdout;
				err.stderr = stderr;

				return reject(err);
			}

			if(stderr && !stderr.match(/ExperimentalWarning/)){
				err = new Error(`Command failed: ${cmd}`);

				err.stdout = stdout;
				err.stderr = stderr;

				return reject(err);
			}

			resolve(stdout);
		});
	});
};

const formatPerson = (person) => {
	if(typeof(person) === 'string'){
		return person;
	}

	const parts = [];

	if(person.name){
		parts.push(person.name);
	}

	if(person.email){
		parts.push(`<${person.email}>`);
	}

	if(person.url){
		parts.push(`(${person.url})`);
	}

	return parts.join(' ');
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

const unlinkFile = async (path) => {
	return new Promise((resolve, reject) => {
		fs.unlink(path, (err) => {
			if(err){
				return reject(err);
			}

			resolve();
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
		const mainFilename = pkg.name;

		console.log('Compiling TypeScript for Node...');
		await exec('npx tsc');

		console.log('Browserify...');
		const browserifiedPrep = await browserify([
			`./dist/${mainFilename}.js`
		]);

		console.log('Compiling for Browser...');
		const browserified = transpileModule(browserifiedPrep.toString(), {
			compilerOptions: {
				target: 'ES5',
				module: 'commonjs',
				lib: [
					'dom',
					'ES6'
				],
				allowJs: true,
				checkJs: false,
				sourceMap: false,
				declaration: false,
				removeComments: true
			}
		});

		await writeFile(`./dist/${mainFilename}.browserify.js`, browserified.outputText);

		console.log('Minify Browser...');
		const browserSource = await minify(`./dist/${mainFilename}.browserify.js`);

		console.log('Loading Source...');
		const source = (await readFile(`./dist/${mainFilename}.js`)).toString().trim();

		console.log('Loading License...');
		const license = (await readFile('./LICENSE')).toString().trim();

		console.log('Prepending Build and Project Information...');
		const projectInfo = [
			'/*!',
			` * Project Name: ${pkg.name}`,
			` * Project Description: ${pkg.description}`,
			` * Version: ${pkg.version}`,
			` * Build Timestamp: ${new Date().toISOString()}`,
			` * Project Homepage: ${pkg.homepage}`,
			` * Git Location: ${pkg.repository.url}`,
			` * Authored By: ${formatPerson(pkg.author)}`,
			pkg.maintainers && pkg.maintainers.length > 0 ? [
				' * Maintained By:',
				pkg.maintainers.map((maintainer) => {
					return ` *                ${formatPerson(maintainer)}`;
				}).join('\n'),
			].join('\n') : '',
			pkg.contributors && pkg.contributors.length > 0 ? [
				' * Contributors:',
				pkg.contributors.map((contributor) => {
					return ` *               ${formatPerson(contributor)}`;
				}).join('\n'),
			].join('\n') : '',
			` * License: ${pkg.license}`,
			'*/',
			license.split('\n').map((line, i, lines) => {
				line = ' * ' + line;

				if(i === 0){
					line = '\n/*!\n' + line;
				}else
				if(i === lines.length - 1){
					line += '\n*/';
				}

				return line;
			}).join('\n').trim()
		].filter((val) => {
			return !!val;
		}).join('\n').trim();

		await writeFile(`./dist/${mainFilename}.browserify.min.js`, [
			projectInfo,
			browserSource.trim()
		].join('\n'));

		await writeFile(`./dist/${mainFilename}.js`, [
			projectInfo,
			source.trim()
		].join('\n'));

		console.log('Cleanup...');
		await unlinkFile(`./dist/${mainFilename}.browserify.js`);

		console.log('Done building.');
	}catch(err){
		console.error(err);
	}
})();
