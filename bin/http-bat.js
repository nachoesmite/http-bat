#!/usr/bin/env node

var path = require('path')
var fs = require('fs')
var joinPath = require('path').join
var dirname = require('path').dirname
var resolve = require('path').resolve
var glob = require('glob')
var _ = require('lodash')
var Mocha = require('mocha');

var Bat = require('../lib/bat').Bat;

var pkg = require('../package.json')

var opts = require('yargs')
  .usage('http-bat test.yml [--uri uri] -- [mocha argv]')
  .version('version', pkg.version)
  .alias('u', 'uri')
  .describe('u', 'target Uri')
  .parse(process.argv)

var cwd = process.cwd()

var files = opts._[2];
var uri = opts.uri || "default";

if (uri) {
  console.info("http-bat: Default endpoint setted to " + uri);
}

if (!files) {
  files = '**/*.yml';
}

var checkpointReached = false;
for (var i in process.argv) {
  if (checkpointReached) {
    mochaArgv.push(process.argv[i]);
  } else if (process.argv[i] == '--') {
    checkpointReached = true;
  }
}

var mocha = new Mocha({
  bail: true,
  useColors: true
});

var foundFiles = glob.sync(files, {
  nodir: true,
  cwd: cwd,
  realpath: true,
  stat: true
});

if (!foundFiles.length) {
  console.error("http-bat: No file matching " + JSON.stringify(files));
  process.exit(1);
}

var instances = [];

foundFiles.forEach(function (file) {

  file = path.resolve(file);
  mocha.suite.emit('pre-require', global, file, mocha);

  mocha.suite.emit('require', (function (file, uri) {
    var instance = new Bat({
      baseUri: uri,
      file: file
    });

    instance.run()

    instances.push(instance);
  })(file, uri), file, mocha);

  mocha.suite.emit('post-require', global, file, mocha);
});

var runner = mocha.run();

runner.on('end', function () {
  var coverageFile = path.resolve(cwd, 'coverage/lcov.info');
  instances.forEach(function (x) { x.writeCoverage(coverageFile) });
})