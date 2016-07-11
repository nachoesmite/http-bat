// Node
import fs = require('fs');
import path = require('path');
import url = require('url');
import util = require('util');

// NPM
import jsYaml = require('js-yaml');
import _ = require('lodash');
import request = require('supertest');
import expect = require('expect');
import RAML = require('raml-1-parser');
const jsonschema = require('jsonschema');
const pathMatch = require('raml-path-match');

// Locals
import ATL = require('./ATL');
import ATLHelpers = require('./ATLHelpers');
import Coverage = require('./Coverage');
import { generateString as coverageToString } from '../lib/RAMLCoverageReporter';



export interface IBatOptions {
  baseUri?: string;
  variables?: ATLHelpers.IDictionary<any>;
  file?: string;
  raw?: string;
}

export class Bat {
  path: string;
  file: string;

  ast: ATL.ATL;

  agent: request.SuperTest;

  private _loaded: Function;
  private _loadedFailed: Function;
  loaderSemaphore: Promise<any>;

  describe: any = describe;
  it: any = it;

  coverageElements: Coverage.CoverageResource[] = [];

  constructor(public options: IBatOptions = {}) {
    this.ast = new ATL.ATL();

    let gotAST = ATLHelpers.flatPromise();

    this.loaderSemaphore = gotAST.promise;
    this._loaded = gotAST.resolver;
    this._loadedFailed = gotAST.rejecter;

    if (options.raw) {
      this.raw(options.raw);
    } else if (this.options.file) {
      this.load(options.file);
    } else {
      this.checkMochaContext()
        .then(() => this.run());
    }
  }

  checkMochaContext() {

    let gotContext = ATLHelpers.flatPromise();

    this.describe('Checking mocha context', function () {
      gotContext.resolver(this.ctx);
    });

    // check for context configurations
    return gotContext.promise.then(ctx => {
      if (ctx) {
        ctx = ctx.config || ctx;

        if (ctx.batFile) {
          this.load(ctx.batFile);
        } else if (ctx.rawBat) {
          this.raw(ctx.rawBat);
        }

        if (ctx.baseUri) {
          this.options.baseUri = ctx.baseUri;
        }

        if (ctx.variables) {
          this.options.variables = this.options.variables || {};
          _.merge(this.options.variables, ctx.variables);
        }
      }
    });
  }

  private updateState() {
    if (this.options.variables) {
      _.merge(this.ast.options.variables, this.options.variables);
    }

    if (this.options.baseUri && this.options.baseUri != 'default') {
      this.ast.options.baseUri = this.options.baseUri;
    }
  }

  load(file: string) {
    this.path = path.dirname(file);
    process.chdir(this.path);
    this.file = file;

    this.raw(fs.readFileSync(this.file, 'utf8'));
  }

  raw(content: string) {
    let parsed = jsYaml.load(content, {
      schema: ATLHelpers.pointerLib.createSchema()
    });

    this.ast.fromObject(parsed);

    this.updateState();

    this._loaded();
  }

  run(app?) {
    this.describe(this.file || 'http-bat', () => {
      if (this.ast.options.selfSignedCert) {
        this.it('Allowing self signed server certificates', done => {
          process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
          done();
        });
      }

      this.it('Ensure baseUri', done => {
        if (this.options.baseUri == 'default')
          delete this.options.baseUri;

        if (!app || app === "default" || app === '') {
          app = this.options.baseUri || this.ast.options.baseUri;
        }

        if (!app) {
          done(new Error("baseUri not specified"));
          return;
        }

        if (typeof app === 'string' && app.substr(-1) === '/') {
          app = app.substr(0, app.length - 1);
        }

        this.agent = request.agent(app);

        done();
      });

      // Parse the raml for coverage
      if (this.ast.raml) {
        let resources = this.ast.raml.resources();

        for (let r in resources) {
          this.peekResource(resources[r]);
        }
      }

      // Run suites
      for (let k in this.ast.suites) {
        let suite = this.ast.suites[k];

        this.runSuite(suite);
      }

      this.ensureRamlCoverage();
    });
  }

  private ensureRamlCoverage() {
    if (this.ast.raml) {
      this.describe("RAML Coverage", () => {
        this.it('Wait the results before start', done => {
          Promise.all(this.coverageElements.map(item => item.run()))
            .then(() => done())
            .catch(err => done(err));
        });

        if (this.ast.options.raml.coverage) {
          this.coverageElements.forEach(x => x.injectMochaTests());
        }

        it('Print coverage', (done) => {
          Promise.all(this.coverageElements.map(x => x.getCoverage()))
            .then(x => {
              let total = x.reduce((prev, actual) => {
                prev.errored += actual.errored;
                prev.total += actual.total;
                prev.notCovered += actual.notCovered;
                return prev;
              }, { total: 0, errored: 0, notCovered: 0 });
              console.log(util.inspect(total, false, 2, true));
              done();
            });
        });
      });
    }
  }

  private peekResource(resource: RAML.api08.Resource | RAML.api10.Resource, parent?: string) {
    let thisUrl = (parent || "") + resource.relativeUri().value();

    this.coverageElements.push(new Coverage.CoverageResource(resource as any, this));

    let resources = resource.resources();

    for (let r in resources) {
      this.peekResource(resources[r], thisUrl);
    }
  }

  private registerTestResult(test: ATLHelpers.ATLTest, ctx: {
    req: request.Test;
    res: request.Response;
    test: ATLHelpers.ATLTest;
    url: string;
  }) {
    let key = ATLHelpers.matchUrl(test.uri);

    this.coverageElements.forEach(coverageElement => {
      if (coverageElement.matches(ctx.url)) {
        coverageElement.resolve(ctx.test, ctx.res);
      }
    });
  }


  private runSuite(suite: ATLHelpers.ATLSuite) {
    let execFn = suite.skip ? this.describe.skip : this.describe;

    if (suite.test) {
      this.runTest(suite.test);
    }

    let that = this;

    if (suite.suites && Object.keys(suite.suites).length) {
      execFn(suite.name, function () {
        for (let k in suite.suites) {
          let s = suite.suites[k];
          that.runSuite(s);
        }
      });
    }
  }

  obtainSchemaValidator(schema: any) {
    let v = new jsonschema.Validator();

    if (typeof schema == "string") {
      if (schema in this.ast.schemas) {
        v.addSchema(this.ast.schemas[schema], schema);
        schema = this.ast.schemas[schema];
      } else {
        try {
          schema = JSON.parse(schema);
          v.addSchema(schema);
        } catch (e) {

        }
      }
    } else if (typeof schema == "object") {
      v.addSchema(schema);
    } else {
      throw new Error('Invalid schema ' + util.inspect(schema));
    }

    if (v.unresolvedRefs && v.unresolvedRefs.length) {
      this.describe("Load referenced schemas", function () {
        while (v.unresolvedRefs && v.unresolvedRefs.length) {
          let nextSchema = v.unresolvedRefs.shift();
          this.it("load schema " + nextSchema, () => {
            let theSchema = this.ast.schemas[nextSchema];

            if (!theSchema)
              throw new Error("schema " + nextSchema + " not found");

            v.addSchema(theSchema, nextSchema);
          });
        }
      });
    }

    return (content) => {
      return v.validate(content, schema);
    };
  }

  private runTest(test: ATLHelpers.ATLTest) {
    let execFn = test.skip
      ? this.describe.skip
      : this.describe;

    let that = this;

    let requestHolder = {
      req: null as request.Test,
      res: null as request.Response,
      url: test.uri,
      ctx: {
        REQUEST: {} as any,
        RESPONSE: {} as any
      }
    };

    execFn(test.description || (test.method.toUpperCase() + ' ' + test.uri), function () {

      if (test.uriParameters) {
        that.deferedIt('Ensure uriParameters').then(function (resolver) {
          for (let i in test.uriParameters) {
            let value = null;

            if (test.uriParameters[i] instanceof ATLHelpers.pointerLib.Pointer) {
              value = test.uriParameters[i].get(that.ast.options.variables);
            } else {
              value = test.uriParameters[i];
            }

            let typeOfValue = typeof value;

            /* istanbul ignore if */
            if (typeOfValue != 'string' && typeOfValue != 'number') {
              resolver("Only strings and numbers are allowed on uriParameters. " + i + "=" + util.inspect(value));
              return;
            }

            requestHolder.url = requestHolder.url.replace(new RegExp("{" + i + "}", "g"), function (fulltext, match) {
              return encodeURIComponent(value);
            });
          }
          resolver();
        });
      }



      let parsedUrl = url.parse(requestHolder.url, true);

      parsedUrl.query = parsedUrl.query || {};

      let newQs = parsedUrl.query;

      if (test.request.queryParameters) {
        that.deferedIt('Ensure queryParameters').then(function (resolver) {
          if ('search' in parsedUrl)
            delete parsedUrl.search;

          let qsParams = ATLHelpers.cloneObjectUsingPointers(test.request.queryParameters, that.ast.options.variables);

          for (let i in qsParams) {
            newQs[i] = qsParams[i];
          }

          requestHolder.ctx.REQUEST.queryParameters = qsParams;

          requestHolder.url = url.format(parsedUrl);

          resolver();
        });
      }

      that.deferedIt(test.method.toUpperCase() + ' ' + requestHolder.url, test.timeout).then(function (resolver) {
        try {
          let req = requestHolder.req = that.agent[test.method.toLowerCase()](requestHolder.url);

          requestHolder.ctx.REQUEST.method = test.method;
          requestHolder.ctx.REQUEST.url = requestHolder.url;

          // we must send some data..
          if (test.request) {
            if (test.request.headers) {
              requestHolder.ctx.REQUEST.headers = {};
              let headers = ATLHelpers.cloneObjectUsingPointers(test.request.headers, that.ast.options.variables);
              for (let h in headers) {

                req.set(h, headers[h] == undefined ? '' : headers[h].toString());
                if (typeof test.request.headers[h] == "object" && test.request.headers[h] instanceof ATLHelpers.pointerLib.Pointer && test.request.headers[h].path.indexOf("ENV") == 0) {
                  requestHolder.ctx.REQUEST.headers[h] = "(TAKEN FROM " + test.request.headers[h].path + ")";
                } else {
                  requestHolder.ctx.REQUEST.headers[h] = typeof headers[h] != "undefined" && headers[h].toString() || headers[h];
                }
              }
            }

            if (test.request.json) {
              let data = ATLHelpers.cloneObjectUsingPointers(test.request.json, that.ast.options.variables);
              requestHolder.ctx.REQUEST.body = data;
              req.send(data);
            }

            if (test.request.attach) {
              /* istanbul ignore if */
              if (!that.path) {
                resolver(ATLHelpers.error("attach is not allowed using RAW definitions", requestHolder.ctx));
                return;
              }

              for (let i in test.request.attach) {
                let currentAttachment = test.request.attach[i];
                try {
                  req.attach(currentAttachment.key, path.resolve(that.path, currentAttachment.value));
                } catch (e) {
                  resolver(e);
                  return;
                }
              }
            }

            if (test.request.form) {
              req.type('form');

              for (let i in test.request.form) {
                let currentAttachment = ATLHelpers.cloneObjectUsingPointers(test.request.form[i], that.ast.options.variables);
                req.field(currentAttachment.key, currentAttachment.value);
              }
            }

            if (test.request.urlencoded) {
              req.send(ATLHelpers.cloneObjectUsingPointers(test.request.urlencoded, that.ast.options.variables));
            }
          }

          req.end(function (err, res) {
            requestHolder.res = res;
            requestHolder.ctx.RESPONSE = res;
            /* istanbul ignore if: untestable */
            if (err && err instanceof Error) {
              err = ATLHelpers.error(err.message, requestHolder.ctx);
            }

            resolver(err);

            if (!err) {
              that.registerTestResult(test, {
                req,
                res,
                test,
                url: requestHolder.url
              });
            }

            test.resolve(res, err);
          });
        } catch (e) {
          resolver(e);
        }
      });


      execFn("Validate response", function () {
        if (test.response) {
          if (test.response.status) {
            that.deferedIt("response.status == " + test.response.status, test.timeout).then(resolver => {
              /* istanbul ignore else */
              if (requestHolder.res.status == test.response.status)
                resolver();
              else
                resolver(ATLHelpers.error('expected status code ' + test.response.status + ' got ' + requestHolder.res.status, requestHolder.ctx));
            });
          }

          if (test.response.body) {
            if ('is' in test.response.body) {
              that.deferedIt("response.body", test.timeout).then(resolver => {
                let bodyEquals = ATLHelpers.cloneObjectUsingPointers(test.response.body.is, that.ast.options.variables);

                try {
                  if (test.response.body.is && typeof test.response.body.is == "object" && test.response.body.is instanceof RegExp) {
                    /* istanbul ignore if */
                    if (!test.response.body.is.test(requestHolder.res.text)) {
                      let a = util.inspect(bodyEquals);
                      let b = util.inspect(test.response.body.is);
                      resolver(ATLHelpers.error('expected response.body to match ' + a + ' response body, got ' + b, requestHolder.ctx));
                    } else {
                      resolver();
                    }
                  } else {
                    let takenBody;
                    if (typeof test.response.body.is == "string") {
                      takenBody = requestHolder.res.text;
                    } else {
                      takenBody = requestHolder.res.body;
                    }

                    /* istanbul ignore if */
                    if (!_.isEqual(bodyEquals, takenBody)) {
                      let a = util.inspect(bodyEquals);
                      let b = util.inspect(takenBody);
                      resolver(ATLHelpers.errorDiff('expected ' + a + ' response body, got ' + b, bodyEquals, takenBody, requestHolder.ctx));
                    } else {
                      resolver();
                    }
                  }
                } catch (e) {
                  resolver(e);
                }
              });
            }

            if (test.response.body.schema) {
              let v = that.obtainSchemaValidator(test.response.body.schema);

              that.deferedIt("response.body schema", test.timeout).then(resolver => {
                let validationResult = v(requestHolder.res.body);
                try {
                  if (validationResult.valid) {
                    resolver();
                  } else {
                    let errors = ["Schema error:"];
                    validationResult.errors && validationResult.errors.forEach(x => errors.push("  " + x.stack));

                    resolver(ATLHelpers.error(errors.join('\n') || "Invalid schema", requestHolder.ctx));
                  }
                } catch (e) {
                  resolver(e);
                }
              });
            }

            if (test.response.body.matches) {
              test.response.body.matches.forEach(kvo => {
                that.deferedIt("response.body::" + kvo.key, test.timeout).then(resolver => {
                  let value: any = ATLHelpers.cloneObjectUsingPointers(kvo.value, that.ast.options.variables);

                  let readed = _.get(requestHolder.res.body, kvo.key);

                  /* istanbul ignore if */
                  if (
                    (!(value instanceof RegExp) && !_.isEqual(readed, value))
                    ||
                    ((value instanceof RegExp) && !value.test(readed))
                  ) {
                    resolver(ATLHelpers.errorDiff('expected response.body::' + kvo.key + ' to be ' + util.inspect(value) + ' got ' + util.inspect(readed), value, readed, requestHolder.ctx));
                  } else {
                    resolver();
                  }
                });
              });

            }

            if (test.response.body.take) {
              let take = test.response.body.take;

              take.forEach(function (takenElement) {
                that.deferedIt("response.body::" + takenElement.key + " >> !!variables " + takenElement.value.path, test.timeout).then(resolver => {
                  let takenValue = _.get(requestHolder.res.body, takenElement.key);
                  takenElement.value.set(that.ast.options.variables, takenValue);
                  resolver();
                });
              });
            }

            if (test.response.body.copyTo && test.response.body.copyTo instanceof ATLHelpers.pointerLib.Pointer) {
              that.deferedIt("response.body >> !!variables " + test.response.body.copyTo.path, test.timeout).then(resolver => {
                test.response.body.copyTo.set(that.ast.options.variables, requestHolder.res.body);
                resolver();
              });
            }

            if (test.response.headers) {
              let headers = ATLHelpers.cloneObjectUsingPointers(test.response.headers, that.options.variables);

              for (let h in headers) {
                if (h !== 'content-type') {
                  headers[h] = headers[h].toString();

                  that.deferedIt("response.header::" + h, test.timeout).then(resolve => {
                    let value = requestHolder.res.get(h.toLowerCase());

                    /* istanbul ignore if */
                    if (headers[h] != value) {
                      let a = util.inspect(headers[h]);
                      let b = util.inspect(value);
                      resolve(ATLHelpers.errorDiff('expected response.header::' + h + ' to be ' + a + ' got ' + b, headers[h], value, requestHolder.ctx));
                    } else {
                      resolve();
                    }
                  });
                }
              }
            }
          }
        }
      });
    });

  }

  deferedIt(name: string, timeout?: number): Promise<(err?) => void> {
    let fill = null;

    let prom = ATLHelpers.flatPromise();

    this.it(name, function (done) {
      if (timeout)
        this.timeout(timeout);

      prom.resolver.call(this, function (ret) {
        /* istanbul ignore if */
        if (ret) {
          if (done.fail)
            done.fail(ret);
          else
            done(ret);
        } else {
          done();
        }
      });

      prom.promise.catch(done);
    });

    return prom.promise;
  }

  coverageData: ATLHelpers.IDictionary<{
    source: Array<number | void>;
  }> = {};

  writeCoverage(coverFile: string) {
    let cwd = path.dirname(coverFile);

    if (this.coverageData && Object.keys(this.coverageData).length) {
      console.info("Writing coverage information: " + coverFile);

      let coverage = '';

      try {
        fs.mkdirSync(cwd);
      } catch (e) { }

      try {
        coverage = fs.readFileSync(coverFile).toString();
      } catch (e) {

      }

      if (coverage.length) coverage = coverage + '\n';

      coverage =
        coverage += Object.keys(this.coverageData)
          .filter(x => !!x)
          .map((file) => {
            return coverageToString(file, this.coverageData[file] as any);
          }).join('\n');

      fs.writeFileSync(coverFile, coverage);

      console.info("Writing coverage information. OK!");
    }
  }
}

