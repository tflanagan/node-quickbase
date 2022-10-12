/* Types */
type Person = {
	name: string;
	email: string;
	url: string;
};

/* Dependencies */
import {
	readFile,
	unlink,
	writeFile
} from 'fs/promises';
import {
	exec as execNode
} from 'child_process';

import Debug from 'debug';
import minify from 'minify';
import Browserify from 'browserify';
import {
	ModuleKind,
	ScriptTarget,
	transpileModule
} from 'typescript';

const pkg = require('../../package.json');
const debug = Debug('quickbase:build');

/* Helpers */
const browserify = async (files: Browserify.InputFile[], options?: Browserify.Options): Promise<Buffer> => {
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
		const browserifiedPrep = await browserify([
			`./dist/${mainFilename}.js`
		]);

		const browserified = transpileModule(browserifiedPrep.toString(), {
			compilerOptions: {
				target: ScriptTarget.ES5,
				module: ModuleKind.CommonJS,
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

		debug('Minifing Browserified file...');
		const browserSource = await minify(`./dist/${mainFilename}.browserify.js`);

		debug('Loading Source...');
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

		debug('Cleanup...');
		await unlink(`./dist/${mainFilename}.browserify.js`);

		debug('Done building.');
	}catch(err){
		console.error(err);
	}
})();
