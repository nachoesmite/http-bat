var ymlParser = require('js-yaml');
var fs = require('fs');

describe = describe || require('mocha').describe;
pre = before || require('mocha').before;
it = it || require('mocha').it;
afterAll = after || require('mocha').after;

var request = require('supertest');
var methods = require('methods');
var yamlinc = require('yaml-include');
var Url = require('url');
var Path = require('path');
var _ = require('lodash');

var libPointer = require('./lib/pointer');

var Bat = module.exports = function Bat() {

  var options = {
    baseUri: null,
    stores: {},
    file: null,
    path: null,
    ast: {
      tests: {},
      stores: {}
    },
    agent: null,
    app: null,
    tests: []
  }

  return {
    options: options,
    load: load,
    run: run
  }

  function load(file) {
    options.path = Path.dirname(file);
    process.chdir(options.path);
    options.file = file;

    options.ast = ymlParser.load(fs.readFileSync(options.file, 'utf8'), {
      schema: libPointer.createSchema(yamlinc.YAML_INCLUDE_SCHEMA)
    });

    options.ast.stores = options.ast.stores || {};

    /* istanbul ignore if: untestable */
    if (!(options.ast.stores instanceof Object) || (options.ast.stores instanceof Array)) {
      throw new TypeError("stores: must be an object");
    }

    options.baseUri = options.ast.baseUri;
  }

  function run(app) {
    if (typeof app === 'string' && app.substr(-1) === '/') {
      app = app.substr(0, app.length - 1);
    }

    options.agent = options.agent || request.agent(app);
    options.ast.stores.ENV = _.extend(options.ast.stores.ENV, _.cloneDeep(process.env));

    for (var sequenceName in options.ast.tests) {
      describe(sequenceName, function () {
        (function (tests) {
          for (var t in tests) {
            var method = Bat.parseMethod(t);

            if (method) {
              var methodBody = tests[t];

              testMethod(options.agent, method.method, method.url, methodBody, options).forEach(function (test) {
                test();
              });
            }
          }
        })(options.ast.tests[sequenceName])
      })
    }
  }
}




Bat.parseMethod = function parseMethod(name) {
  var parts = name.split(/\s+/g);
  var method = null;


  method = parts[0].trim().toLowerCase();

  if (method.length == 0) {
    return null;
  }

  // methods should have 2 parts
  if (parts.length != 2) {
    return null;
  }

  if (methods.indexOf(method) == -1) {
    throw new ArgumentException("ERROR: unknown method " + method + " on " + name);
  }

  // methods should be upper case
  if (parts[0] != parts[0].toUpperCase()) {
    throw new Error("ERROR: the method must be upper case: " + name);
  }

  // if the URL doesn't starts with "/"
  if (parts[1].substr(0, 1) != '/' && parts[1].substr(0, 1) != '?') {
    throw new Error("ERROR: the url must starts with '/' or '?': " + name);
  }

  // if the URL ends with "/"
  if (parts[1].substr(-1) == '/' && parts[1].length > 1) {
    throw new Error("ERROR: the url must not ends with '/': " + name);
  }

  return {
    method: method,
    url: parts[1]
  }
}

function testMethod(agent, verb, url, body, options) {
  var tests = [];
  tests.push(function () {
    return describe(verb.toUpperCase() + ' ' + url, function () {
      it(verb, function (done) {

        var parsedUrl = Url.parse(url, true);

        parsedUrl.query = parsedUrl.query || {};

        var newQs = parsedUrl.query;

        if (body.queryParameters) {
          if ('search' in parsedUrl)
            delete parsedUrl.search;

          var qsParams = cloneObjectUsingPointers(body.queryParameters, options.ast.stores);
          for (var i in qsParams) {
            newQs[i] = qsParams[i];
          }
        }

        url = Url.format(parsedUrl);

        var req = agent[verb](url);

        if (body.headers) {
          var headers = cloneObjectUsingPointers(body.headers, options.ast.stores);
          for (var h in headers) {

            req.set(h, headers[h] == undefined ? '' : headers[h].toString());
          }
        }

        // we must send some data..
        if (body.request) {
          if (body.request['content-type']) {
            req.set('Content-Type', body.request['content-type']);
          }

          if (body.request.json) {
            req.send(cloneObjectUsingPointers(body.request.json, options.ast.stores));
          }

          if (body.request.attach) {
            if (body.request.attach instanceof Array) {
              for (var i in body.request.attach) {
                var currentAttachment = body.request.attach[i];
                for (var key in currentAttachment) {
                  req.attach(key, Path.resolve(options.path, currentAttachment[key]));
                }
              }
            } else {
              /* istanbul ignore throw: untestable */
              throw new TypeError("request.attach must be a sequence");
            }
          }

          if (body.request.form) {
            if (!body.request['content-type'])
              req.type('form');

            if (body.request.form instanceof Array) {
              for (var i in body.request.form) {
                var currentAttachment = cloneObjectUsingPointers(body.request.form[i], options.ast.stores);

                for (var key in currentAttachment) {
                  req.field(key, currentAttachment[key]);
                }
              }
            } else {
              /* istanbul ignore throw: untestable */
              throw new TypeError("request.form must be a sequence");
            }
          }

          if (body.request.urlencoded) {
            if (!body.request['content-type'])
              req.set('Content-Type', "application/x-www-form-urlencoded");

            if (body.request.urlencoded instanceof Array) {
              req.send(cloneObjectUsingPointers(body.request.urlencoded, options.ast.stores))
            } else {
              /* istanbul ignore throw: untestable */
              throw new TypeError("request.urlencoded must be a sequence");
            }
          }
        }


        if (body.response) {
          if (body.response['content-type']) {
            req.expect(function (res) {
              var contentType = res.get('content-type');
              if (contentType.indexOf(';') != -1) {
                contentType = contentType.substr(0, contentType.indexOf(';'))
              }
              /* istanbul ignore if: untestable */
              if (body.response['content-type'].toLowerCase() != contentType.toLowerCase()) {
                throw new Error("Unexpected content-type " + JSON.stringify(contentType) + " expected: " + JSON.stringify(body.response['content-type']));
              }
            });
          }

          if (body.response.status) {
            req.expect(body.response.status);
          }

          if (body.response.print) {
            req.expect(function (res) {
              console.log('/////////////////////////////');
              console.log(verb.toUpperCase() + ' ' + url, "RESPONSE:", JSON.stringify(res, null, 2));
              console.log('/////////////////////////////')
            });
          }

          if (body.response.body) {
            if (body.response.body.print) {
              req.expect(function (res) {
                console.log('/////////////////////////////');
                console.log(verb.toUpperCase() + ' ' + url, "BODY:", JSON.stringify(res.body, null, 2));
                console.log('/////////////////////////////')
              });
            }
            if ('is' in body.response.body) {
              var bodyEquals = cloneObjectUsingPointers(body.response.body.is, options.ast.stores);

              switch (typeof bodyEquals) {
                case "object":
                  if (bodyEquals == null) {
                    req.expect(function (res) {
                      /* istanbul ignore if: untestable */
                      if (res.body != null)
                        throw new Error("Unexpected response " + JSON.stringify(res.body) + " expected: null");
                    });
                  } else {
                    req.expect(bodyEquals);
                  }
                  break;

                case "string":
                  req.expect(bodyEquals);
                  break;
                case "number":
                case "boolean":
                  req.expect(function (res) {
                    if (res.body != bodyEquals)
                      throw new Error("Unexpected response " + JSON.stringify(res.body) + " expected: " + bodyEquals);
                  });
                  break;
              }
            }

            if (body.response.body.matches) {

              var matches = cloneObjectUsingPointers(body.response.body.matches, options.ast.stores);

              for (var match in matches) {
                (function (match, value) {
                  req.expect(function (res) {
                    var readed = _.get(res.body, match);

                    /* istanbul ignore if: untestable */
                    if (
                      typeof value == "string" && !_.isEqual(readed, value)
                      || ((value instanceof RegExp) && !value.test(readed))
                    )
                      throw new Error("Unexpected response match _.get(" + JSON.stringify(match) + ") = " + JSON.stringify(_.get(res.body, match)) + " expected: " + JSON.stringify(value));
                  });
                })(match, matches[match]);
              }
            }

            if (body.response.body.take) {
              for (var take in body.response.body.take) {
                (function (match, pointer) {
                  req.expect(function (res) {
                    /* istanbul ignore if: untestable */
                    if (!(pointer instanceof libPointer))
                      throw new Error("body.take.* must be a pointer ex: !!pointer myValue");

                    var takenValue = _.get(res.body, take);
                    pointer.set(options.ast.stores, takenValue);
                  });
                })(take, body.response.body.take[take]);
              }
            }
          }

          if (body.response.headers) {
            var headers = cloneObjectUsingPointers(body.response.headers, options.ast.stores);

            for (var h in headers) {
              req.expect(h, headers[h].toString());
            }
          }
        }

        req.end(function (err, res) {
          if (err && err instanceof Error) {
            err = new err.constructor(err.message + "\n" + JSON.stringify(res, null, 2).replace(/^(.*)/gm, "      $1"));
          }
          done(err, res);
        });
      });
    })
  })
  return tests;
}

function cloneObjectUsingPointers(baseObject, store) {
  if (typeof baseObject !== "object") {
    return baseObject;
  }

  return cloneObject(baseObject, store);
}


function cloneObject(obj, store) {
  obj = obj && obj instanceof Object ? obj : '';

  // Handle Date (return new Date object with old value)
  if (obj instanceof Date) {
    return new Date(obj);
  }

  if (obj instanceof String || obj instanceof Number || obj instanceof Boolean) {
    return obj;
  }

  // Handle Array (return a full slice of the array)
  if (obj instanceof Array) {
    return obj.slice();
  }

  if (obj instanceof libPointer) {
    return obj.get(store);
  }

  if (obj instanceof RegExp) {
    return obj;
  }

  // Handle Object
  if (obj instanceof Object) {
    var copy = new obj.constructor();
    for (var attr in obj) {
      if (obj.hasOwnProperty(attr)) {
        if (obj[attr] instanceof Object) {
          copy[attr] = cloneObject(obj[attr], store);
        } else {
          copy[attr] = obj[attr];
        }
      }
    }
    return copy;
  }

  throw new Error("Unable to copy obj! Its type isn't supported.");
}