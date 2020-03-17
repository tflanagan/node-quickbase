import test from 'ava';
import * as dotenv from 'dotenv';
import { QuickBase } from '../quickbase';

dotenv.config();

const qb = new QuickBase({
	realm: process.env.QB_REALM,
	userToken: process.env.QB_USERTOKEN
});

test('getApp()', async (t) => {
	const results = await qb.getApp({
		appId: process.env.QB_APPID
	});

	t.truthy(results.id);
});

test('getAppTables()', async (t) => {
	const results = await qb.getAppTables({
		appId: process.env.QB_APPID
	});

	t.truthy(results[0].id);
});

test('getTable()', async (t) => {
	const results = await qb.getTable({
		tableId: process.env.QB_TABLEID
	});

	t.truthy(results.id);
});

test('getTableReports()', async (t) => {
	const results = await qb.getTableReports({
		tableId: process.env.QB_TABLEID
	});

	t.truthy(results[0].id);
});

test('getReport()', async (t) => {
	const results = await qb.getReport({
		tableId: process.env.QB_TABLEID,
		reportId: 1
	});

	t.truthy(results.id);
});

test('getField()', async (t) => {
	const results = await qb.getField({
		tableId: process.env.QB_TABLEID,
		fieldId: 1
	});

	t.truthy(results.id);
});

test('getFields()', async (t) => {
	const results = await qb.getFields({
		tableId: process.env.QB_TABLEID
	});

	t.truthy(results[0].id);
});

test('getFieldUsage()', async (t) => {
	const results = await qb.getFieldUsage({
		tableId: process.env.QB_TABLEID,
		fieldId: 1
	});

	t.truthy(results.field.id);
});

test('getFieldsUsage()', async (t) => {
	const results = await qb.getFieldsUsage({
		tableId: process.env.QB_TABLEID
	});

	t.truthy(results[0].field.id);
});

test('runQuery()', async (t) => {
	const results = await qb.runQuery({
		tableId: process.env.QB_TABLEID,
		query: {
			where: "{'3'.XEX.''}",
			select: [3]
		}
	});

	t.truthy(results.fields[0].id);
});

test('runReport()', async (t) => {
	const results = await qb.runReport({
		tableId: process.env.QB_TABLEID,
		reportId: 1
	});

	t.truthy(results.fields[0].id);
});

let newRid: number;

test.serial('upsertRecords()', async (t) => {
	const results = await qb.upsertRecords({
		tableId: process.env.QB_TABLEID,
		data: [
			{
				[process.env.QB_FIELDID]: {
					value: 'test value'
				}
			}
		]
	});

	newRid = results.metadata.createdRecordIds[0];

	t.truthy(newRid);
});

test.serial('deleteRecord()', async (t) => {
	const results = await qb.deleteRecord({
		tableId: process.env.QB_TABLEID,
		where: `{'3'.EX.'${newRid}'}`
	});

	t.truthy(results.numberDeleted);
});
