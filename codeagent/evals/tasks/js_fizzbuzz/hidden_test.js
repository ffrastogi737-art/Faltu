const assert = require('assert');
const { fizzbuzz } = require('./fizzbuzz');
assert.deepStrictEqual([3, 5, 15, 7].map(fizzbuzz), ['Fizz', 'Buzz', 'FizzBuzz', '7']);
console.log('ok');
