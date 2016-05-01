var bat = require('../index')();

var app = require('./server');

bat.load(__dirname + '/test-1.yml');

bat.run(app);