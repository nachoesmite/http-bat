export import PointerType = require('./Pointer');
export import Parser = require('yaml-ast-parser');

export import ASTParser = require('yaml-ast-parser');

import SAFE_SCHEMA = require('yaml-ast-parser/dist/schema/default_safe');
import Schema = require('yaml-ast-parser/dist/schema');

let schema = new Schema({
  include: [
    SAFE_SCHEMA
  ],
  explicit: [
    PointerType.type
  ]
});

function walkFindingErrors(node: ASTParser.YAMLNode, errors: ASTParser.Error[]) {
  if (node.errors && node.errors.length) {
    node.errors.forEach(err => errors.push(err));
  }

  if (typeof node.value == "object" && node.value.errors && 'value' in node.value) {
    walkFindingErrors(node.value, errors);
  }
}

export function load(content: string) {
  let errors: ASTParser.Error[] = [];

  let parsed = Parser.load(content, {
    schema: schema
  });

  walkFindingErrors(parsed as any, errors);

  if (errors.length) {
    // errors.forEach(err => console.error(err));
    throw errors[0];
  }

  return parsed;
}