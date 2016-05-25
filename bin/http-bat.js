#!/usr/bin/env node

var spawn = require('child_process').spawn;
var path = require('path')
var fs = require('fs')
var joinPath = require('path').join
var dirname = require('path').dirname
var resolve = require('path').resolve
var glob = require('glob')
var _ = require('lodash')

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

var executionQueue = [];
var mochaArgv = [];

var checkpointReached = false;
for (var i in process.argv) {
  if (checkpointReached) {
    mochaArgv.push(process.argv[i]);
  } else if (process.argv[i] == '--') {
    checkpointReached = true;
  }
}

if (mochaArgv.length == 0) {
  mochaArgv.push('-R');
  mochaArgv.push('spec');
  mochaArgv.push('--bail');
}

glob(files, {
  nodir: true
}, function (er, files) {
  if (er) {
    console.error(er);
    process.exit(1);
  }

  if (!files.length) {
    console.error("http-bat: No file matching " + JSON.stringify(files));
    process.exit(1);
  }

  for (var fileIndex in files) {
    var file = files[fileIndex];
    executionQueue.push({
      file: resolve(cwd, file),
      uri: uri
    })
  }

  executeTest();
});


var mochaBin = joinPath(require.resolve('mocha'), '..', 'bin', 'mocha');
var specPath = require.resolve('./genericSpec');
mochaArgv.push(specPath);

function executeTest() {
  if (executionQueue.length == 0) {
    process.exit(0);
    return;
  }

  var test = executionQueue.shift();
  var env = _.extend(_.cloneDeep(process.env), {
    HTTP_BAT_FILENAME: test.file,
    HTTP_BAT_URI: test.uri
  });

  console.log("http-bat: Running test file " + test.file);

  var child = spawn(mochaBin, mochaArgv, {
    detached: false,
    stdio: [process.stdin, process.stdout, process.stderr],
    env: env,
    cwd: cwd
  });

  child.on('close', function (code) {
    if (code !== 0) {
      console.error("http-bat: ERROR! Test on file " + test.file + " failed!")
      process.exit(code);
      return;
    }
    executeTest();
    console.log("closed", code);
  });
}