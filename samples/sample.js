/**
 * JSDoc block
 * @param {string} name - the name
 * @returns {Promise<User>}
 */
import { readFile } from 'node:fs/promises';

const MAX_RETRIES = 3;          // constant
let counter = 0x1F + 42.5e3;    // numbers
const re = /^[a-z]+\d*$/gi;     // regex

export class User extends BaseModel {
  static #registry = new Map();
  constructor(name) {
    super();
    this.name = name;
  }
  async greet(other = 'world') {
    if (!other) return null;
    return `Hello, ${other}! I'm ${this.name}\n`;
  }
}

const obj = { key: 'value', nested: { deep: true, list: [1, 2, null, undefined] } };
console.log(obj?.nested.deep ?? false, typeof User === 'function', MAX_RETRIES, counter, re);
// TODO: handle errors from readFile
