'use strict';

/* Dependencies */
import { serial as test } from 'ava';
import { QuickBaseError } from '../quickbase';

/* Tests */
const errObj = {
	code: 403,
	message: 'Access Denied',
	description: 'User token is invalid'
};

const qbErr = new QuickBaseError(errObj.code, errObj.message, errObj.description);

test('QuickBaseError', async (t) => {
	t.truthy(qbErr.code === errObj.code && qbErr.message === errObj.message && qbErr.description === errObj.description);
});

test('toJSON()', async (t) => {
	t.truthy(JSON.stringify(qbErr.toJSON()) === JSON.stringify(errObj));
});

test('fromJSON()', async (t) => {
	qbErr.fromJSON(errObj);

	t.truthy(JSON.stringify(qbErr.toJSON()) === JSON.stringify(errObj));
});

test('FromJSON()', async (t) => {
	const nQbErr = QuickBaseError.fromJSON(errObj);

	t.truthy(JSON.stringify(nQbErr.toJSON()) === JSON.stringify(errObj));
});
