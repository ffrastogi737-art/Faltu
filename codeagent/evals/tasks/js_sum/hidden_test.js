const assert = require('assert');
const { sum } = require('./sum');
assert.strictEqual(sum(['1', '2', 3]), 6);
assert.strictEqual(sum([]), 0);
console.log('ok');
