var Bat = require('../lib/bat').Bat;
var flatPromise = require('../lib/ATLHelpers').flatPromise;

describe('Set up context', function () {
  this.ctx = {
    batFile: __dirname + '/mocha.context.yml',
    variables: {
      connectionHeader: 'close'
    },
    baseUri: 'https://github.com'
  };

  var instance = new Bat

  it('ends', function () { })
})

describe('Set up context, test RAW yaml', function () {
  this.ctx = {
    rawBat: [
      "tests:",
      "  RAW_TESTS:",
      "    GET /:",
      "      description: Testing mocha context",
      "      timeout: 10000"
    ].join("\n"),
    baseUri: 'https://github.com'
  };

  var prom = flatPromise();

  it('ends', function (_done) {
    prom.resolver(_done);
  });

  var instance = new Bat

  prom.promise.then(function (done) {
    instance.loaderSemaphore
      .then(function() { done(); })
      .catch(function(e){ done(e) });
  });

})