'use strict';

var yaml = require('js-yaml');
var _ = require('lodash');

module.exports = Pointer;

module.exports.typePointer = new yaml.Type('tag:yaml.org,2002:pointer', {
  kind: 'scalar',
  resolve: resolvePointer,
  construct: constructPointer,
  instanceOf: Pointer
});

module.exports.type = new yaml.Type('tag:yaml.org,2002:variable', {
  kind: 'scalar',
  resolve: resolvePointer,
  construct: constructVariable,
  instanceOf: Pointer
});

module.exports.createSchema = function () {
  return yaml.Schema.create([module.exports.typePointer, module.exports.type]);
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
    return _.get(object, this.path);
  }
};

function constructPointer(data) {
  console.warn("Warning. !!pointer will be deprecated on 1.x.x. Use !!variable instead.");
  return new Pointer(data);
}


function constructVariable(data) {
  return new Pointer(data);
}


function resolvePointer(data) {
  return (typeof data === 'string');
}
