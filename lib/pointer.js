'use strict';

var yaml = require('js-yaml');
var _ = require('lodash');

module.exports = Pointer;

module.exports.type = new yaml.Type('tag:yaml.org,2002:pointer', {
  kind: 'scalar',
  resolve: resolvePointer,
  construct: constructPointer,
  instanceOf: Pointer
});

module.exports.createSchema = function (schema) {
  return yaml.Schema.create([module.exports.type]);
}

// ---

function Pointer(path) {
  this.path = path;
}

Pointer.prototype = {
  set: function (object, value) {
    _.set(object, this.path, value);
  },
  get: function (object) {
    _.set(object, this.path);
  }
};

function constructPointer(data) {
  return new Pointer(data);
}

function resolvePointer(data) {
  return (typeof data === 'string');
}


