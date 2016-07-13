// Node
import fs = require('fs');
import path = require('path');
import url = require('url');
import util = require('util');

// NPM
import jsYaml = require('js-yaml');
import _ = require('lodash');
import request = require('supertest');
import superAgent = require('superagent');
import expect = require('expect');
import RAML = require('raml-1-parser');
const jsonschema = require('jsonschema');
const pathMatch = require('raml-path-match');
import { Request } from 'superagent';

// Locals
import ATL = require('./ATL');
import ATLHelpers = require('./ATLHelpers');
import Coverage = require('./Coverage');
import { generateString as coverageToString } from '../lib/RAMLCoverageReporter';
import { ATLError, ATLSkipped, CommonAssertions } from './ATLAssertion';


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
    try {
      let parsed = jsYaml.load(content, {
        schema: ATLHelpers.pointerLib.createSchema()
      });

      this.ast.options.path = this.path;
      this.ast.fromObject(parsed);

      this.updateState();

      this._loaded();
    } catch (e) {
      if (this.options.file)
        e.message = this.options.file + '\n' + e.message;

      throw e;
    }
  }

  run(app?): Promise<Bat> {
    let prom = ATLHelpers.flatPromise();

    this.describe(this.file || 'http-bat', () => {
      if (this.ast.options.selfSignedCert) {
        this.it('Allowing self signed server certificates', done => {
          process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
          done();
        });
      }


      if (this.options.baseUri == 'default')
        delete this.options.baseUri;

      if (!app || app === "default" || app === '') {
        app = this.options.baseUri || this.ast.options.baseUri;
      }

      if (!app) {
        throw new Error("baseUri not specified");
      }

      if (typeof app === 'string' && app.substr(-1) === '/') {
        app = app.substr(0, app.length - 1);
      }

      this.ast.agent = request.agent(app);

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

      this.deferedIt('Finalize ATL Document').then(done => {
        prom.resolver();

        done();
      });
    });

    return prom.promise;
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
    req: superAgent.SuperAgentRequest;
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

  private runSuite(suite: ATLHelpers.ATLSuite): Promise<any> {
    let execFn = suite.skip ? this.describe.skip : this.describe;
    let promises = [];

    if (suite.test) {
      // this.runTest(suite.test);
      let testResult = suite.test.run();

      promises.push(testResult);

      testResult.then(res => {
        this.registerTestResult(suite.test, {
          req: suite.test.requester.superAgentRequest,
          res: suite.test.requester.superAgentResponse,
          test: suite.test,
          url: suite.test.requester.url
        });
      });

      generateMochaTest(suite.test);
    }

    let that = this;

    if (suite.suites && Object.keys(suite.suites).length) {
      execFn(suite.name, function () {
        for (let k in suite.suites) {
          let s = suite.suites[k];
          promises = promises.concat(that.runSuite(s));
        }
      });
    }

    return Promise.all(promises);
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

function generateMochaTest(test: ATLHelpers.ATLTest) {

  let execFn = test.skip
    ? describe.skip
    : describe;

  execFn(test.description || (test.method.toUpperCase() + ' ' + test.uri), function () {
    it(test.method.toUpperCase() + ' ' + test.uri, function (done) {
      test
        .requester
        .promise
        .then(response => {
          done();
        })
        .catch(err => {
          console.error(util.inspect(err));
          done(err);
        });
    });


    test.assertions.forEach(x => {
      it(x.name, function (done) {
        x.promise
          .then(err => {
            if (err) {
              console.error(util.inspect(err));
              done(err);
            } else
              done();
          })
          .catch(err => {
            console.error(util.inspect(err));
            done(err);
          });
      });
    });
  });
}