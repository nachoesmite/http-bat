var ymlParser = require('js-yaml');
var fs = require('fs');

var testCase = require('mocha').describe;
var pre = require('mocha').before;
var assertions = require('mocha').it;

var Bat = module.exports = function Bat() {

  var ast = null;
  var baseUri = null;

  return {
    load: load,
    run: run
  }

  function load(path) {
    ast = ymlParser.load(fs.readFileSync(path, 'utf8'));

    baseUri = ast.baseUri;


  }

  function run(app) {
    for (var i in ast.tests) {

      (function (tests) {
        testCase(i, function () {
          for (var t in tests) {
            assertions(t, function () { return true; })
          }
        })
      })(ast.tests[i])

    }
  }
}