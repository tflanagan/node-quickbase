import test from 'ava';
import { QuickBase } from '../quickbase';

const qb = new QuickBase({
	realm: 'asdf',
	userToken: 'asf'
});

console.log(qb);

const fn = () => 'foo';

test('fn() returns foo', t => {
	t.is(fn(), 'foo');
});
