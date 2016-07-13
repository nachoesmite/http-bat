var app = require('./server');
var Bat = require('../lib/bat').Bat;

var instance = new Bat({
  file: __dirname + '/test-1.yml'
});

var registerMochaSuites = require('../lib/adapters/mocha').registerMochaSuites;
registerMochaSuites(instance);

instance.run(app);

after(function () {
  instance.writeCoverage('../coverage/lcov.info');
});