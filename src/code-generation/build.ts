/* Types */
type Person = {
	name: string;
	email: string;
	url: string;
};

/* Dependencies */
import {
	readFile,
	writeFile
} from 'fs/promises';
import {
	exec as execNode
} from 'child_process';

import Debug from 'debug';
import * as esbuild from 'esbuild';

const pkg = require('../../package.json');
const debug = Debug('quickbase:build');

/* Helpers */
const exec = async (cmd: string): Promise<string> => {
	return new Promise((resolve, reject) => {
		execNode(cmd, (err, stdout, stderr) => {
			if(err){
				return reject(err);
			}

			if(stderr && !stderr.match(/ExperimentalWarning/)){
				err = new Error(`Command failed: ${cmd}`);

				return reject(err);
			}

			resolve(stdout);
		});
	});
};

const formatPerson = (person: Person) => {
	if(typeof(person) === 'string'){
		return person;
	}

	const parts: string[] = [];

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

/* Build */
(async () => {
	try {
		const mainFilename = pkg.name;

		debug('Compiling TypeScript...');
		await exec('npx tsc');

		debug('Compiling for Browser...');
		await esbuild.build({
			entryPoints: [ `./dist/${mainFilename}.js` ],
			bundle: true,
			minify: true,
			sourcemap: true,
			target: ['es2015'],
			outfile: `./dist/${mainFilename}.browserify.min.js`
		});

		debug('Loading Source...');
		const browserSource = await readFile(`./dist/${mainFilename}.browserify.min.js`).then((val) => val.toString().trim());
		const cjsSrc = await readFile(`./dist/${mainFilename}.js`).then((val) => val.toString().trim());

		debug('Loading License...');
		const license = (await readFile('./LICENSE')).toString().trim();

		debug('Prepending Build and Package Information...');
		const projectInfo = [
			'/*!',
			` * Package Name: ${pkg.name}`,
			` * Package Description: ${pkg.description}`,
			` * Version: ${pkg.version}`,
			` * Build Timestamp: ${new Date().toISOString()}`,
			` * Package Homepage: ${pkg.homepage}`,
			` * Git Location: ${pkg.repository.url}`,
			` * Authored By: ${formatPerson(pkg.author)}`,
			pkg.maintainers && pkg.maintainers.length > 0 ? [
				' * Maintained By:',
				pkg.maintainers.map((maintainer: Person) => {
					return ` * - ${formatPerson(maintainer)}`;
				}).join('\n'),
			].join('\n') : '',
			pkg.contributors && pkg.contributors.length > 0 ? [
				' * Contributors:',
				pkg.contributors.map((contributor: Person) => {
					return ` * - ${formatPerson(contributor)}`;
				}).join('\n'),
			].join('\n') : '',
			` * License: ${pkg.license}`,
			' *',
			license.split('\n').map((line) => {
				return ' * ' + line;
			}).join('\n'),
			'*/',
		].filter((val) => {
			return !!val;
		}).join('\n').trim();

		await Promise.all([
			writeFile(`./dist/${mainFilename}.browserify.min.js`, [
				projectInfo,
				browserSource.trim()
			].join('\n')),
			writeFile(`./dist/${mainFilename}.js`, [
				projectInfo,
				cjsSrc.trim()
			].join('\n'))
		]);

		debug('Done building.');
	}catch(err){
		console.error(err);
	}
})();
