var app = require('./server');
var Bat = require('../lib/bat').Bat;

var instance = new Bat({
  file: __dirname + '/test-1.yml'
});

instance.run(app);

after(function () {
  instance.writeCoverage('../coverage/lcov.info');
});