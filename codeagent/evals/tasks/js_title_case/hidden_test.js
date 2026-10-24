const assert = require('assert');
const { titleCase } = require('./strings');
assert.strictEqual(titleCase('hELLO   wORLD'), 'Hello World');
assert.strictEqual(titleCase(''), '');
console.log('ok');
