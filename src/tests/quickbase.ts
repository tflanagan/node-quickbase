'use strict';

/* Dependencies */
import * as dotenv from 'dotenv';
import { serial as test } from 'ava';
import { QuickBase, QuickBaseOptions } from '../quickbase';

/* Tests */
dotenv.config();

const QB_REALM = process.env.QB_REALM!;
const QB_USERTOKEN = process.env.QB_USERTOKEN!;
const QB_APPID = process.env.QB_APPID!;

const qbOptions: QuickBaseOptions = {
	server: 'api.quickbase.com',
	version: 'v1',

	realm: QB_REALM,
	userToken: QB_USERTOKEN,
	tempToken: '',

	userAgent: 'Testing',

	connectionLimit: 10,
	connectionLimitPeriod: 1000,
	errorOnConnectionLimit: false,

	proxy: false
};

const qb = new QuickBase(qbOptions);

const testValue: string = 'test value' // - б, в, г, д, ж, з, к, л, м, н, п, р, с, т, ф, х, ц, ч, ш, щ, а, э, ы, у, о, я, е, ё, ю, и';

let newDbid: string;
let newFid: number;
let newRid: number;

test('toJSON()', async (t) => {
	t.truthy(JSON.stringify(qb.toJSON()) === JSON.stringify(qbOptions));
});

test('fromJSON()', async (t) => {
	qb.fromJSON(qbOptions);

	t.truthy(JSON.stringify(qb.toJSON()) === JSON.stringify(qbOptions));
});

test('FromJSON()', async (t) => {
	const nQb = QuickBase.fromJSON(qbOptions);

	t.truthy(JSON.stringify(nQb.toJSON()) === JSON.stringify(qbOptions));
});

test('getApp()', async (t) => {
	const results = await qb.getApp({
		appId: QB_APPID
	});

	t.truthy(results.id);
});

test('getAppTables()', async (t) => {
	const results = await qb.getAppTables({
		appId: QB_APPID
	});

	t.truthy(results[0].id);
});

test('createTable()', async (t) => {
	const results = await qb.createTable({
		appId: QB_APPID,
		name: 'Test Name',
		description: 'Test Description'
	});

	newDbid = results.id;

	t.truthy(newDbid && results.name === 'Test Name');
});

test('updateTable()', async (t) => {
	const results = await qb.updateTable({
		appId: QB_APPID,
		tableId: newDbid,
		name: 'New Name'
	});

	t.truthy(results.name === 'New Name' && results.description === 'Test Description');
});

test('getTable()', async (t) => {
	const results = await qb.getTable({
		tableId: newDbid
	});

	t.truthy(results.id === newDbid);
});

test('getTableReports()', async (t) => {
	const results = await qb.getTableReports({
		tableId: newDbid
	});

	t.truthy(results[0].id);
});

test('getReport()', async (t) => {
	const results = await qb.getReport({
		tableId: newDbid,
		reportId: 1
	});

	t.truthy(results.id);
});

test('createField()', async (t) => {
	const results = await qb.createField({
		tableId: newDbid,
		fieldType: 'text',
		label: 'Test Field'
	});

	newFid = results.id;

	t.truthy(newFid && results.label === 'Test Field');
});

test('updateField()', async (t) => {
	const results = await qb.updateField({
		tableId: newDbid,
		fieldId: newFid,
		fieldType: 'text',
		label: 'Test Field 2',
		appearsByDefault: true
	});

	t.truthy(results.label === 'Test Field 2');
});

test('getField()', async (t) => {
	const results = await qb.getField({
		tableId: newDbid,
		fieldId: newFid
	});

	t.truthy(results.id && results.label === 'Test Field 2');
});

test('getFields()', async (t) => {
	const results = await qb.getFields({
		tableId: newDbid
	});

	t.truthy(results[0].id === newFid);
});

test('getFieldUsage()', async (t) => {
	const results = await qb.getFieldUsage({
		tableId: newDbid,
		fieldId: newFid
	});

	t.truthy(results.field.id === newFid);
});

test('getFieldsUsage()', async (t) => {
	const results = await qb.getFieldsUsage({
		tableId: newDbid
	});

	t.truthy(results[0].field.id === newFid);
});

test('upsertRecords()', async (t) => {
	const results = await qb.upsertRecords({
		tableId: newDbid,
		data: [
			{
				[newFid]: {
					value: testValue
				}
			}
		]
	});

	newRid = results.metadata.createdRecordIds[0];

	t.truthy(newRid);
});

test('runQuery()', async (t) => {
	const results = await qb.runQuery({
		tableId: newDbid,
		where: "{'3'.XEX.''}",
		select: [ newFid ]
	});

	t.truthy(results.fields[0].id === newFid && results.data[0][newFid].value === testValue);
});

test('runReport()', async (t) => {
	const results = await qb.runReport({
		tableId: newDbid,
		reportId: 1
	});

	t.truthy(results.data[0][newFid].value === testValue);
});

test('deleteRecords()', async (t) => {
	const results = await qb.deleteRecords({
		tableId: newDbid,
		where: `{'3'.EX.'${newRid}'}`
	});

	t.truthy(results.numberDeleted);
});

test('deleteFields()', async (t) => {
	const results = await qb.deleteFields({
		tableId: newDbid,
		fieldIds: [ newFid ]
	});

	t.truthy(results.deletedFieldIds[0] === newFid);
});

test('deleteTable()', async (t) => {
	const results = await qb.deleteTable({
		appId: QB_APPID,
		tableId: newDbid
	});

	t.truthy(results.deletedTableId === newDbid);
});
