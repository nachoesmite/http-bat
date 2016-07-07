'use strict';

const yaml = require('js-yaml');
import _ = require('lodash');

export const type = new yaml.Type('tag:yaml.org,2002:variable', {
  kind: 'scalar',
  resolve: resolvePointer,
  construct: constructVariable,
  instanceOf: Pointer
});

export function createSchema() {
  return yaml.Schema.create([module.exports.type]);
}

export class Pointer {
  constructor(public path: string) {

  }

  set(object: any, value: any) {
    _.set(object, this.path, value);
  }

  get(object: any) {
    return _.get(object, this.path);
  }
}

// ---

function constructVariable(data) {
  return new Pointer(data);
}


function resolvePointer(data) {
  return (typeof data === 'string');
}
