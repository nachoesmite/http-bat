// Node
import fs = require('fs');
import path = require('path');
import url = require('url');
import util = require('util');

// NPM
// import jsYaml = require('js-yaml');
import _ = require('lodash');
import request = require('supertest');
import superAgent = require('superagent');
import expect = require('expect');
import RAML = require('raml-1-parser');
const pathMatch = require('raml-path-match');
import { Request } from 'superagent';


// Locals
import ATL = require('./ATL');
import ATLHelpers = require('./ATLHelpers');
import Coverage = require('./Coverage');
import { generateString as coverageToString } from '../lib/RAMLCoverageReporter';
import { ATLError, ATLSkipped, CommonAssertions } from './ATLAssertion';
import YAML = require('./YAML');

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

    describe('Checking mocha context', function () {
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
      let parsed = YAML.load(content);

      console.log(util.inspect(parsed, false, 5, true));

      this.ast.options.path = this.path;
      this.ast.fromObject(parsed);

      this.updateState();

      this._loaded();

      // Parse the raml for coverage
      if (this.ast.raml) {
        let resources = this.ast.raml.resources();

        for (let r in resources) {
          this.peekResource(resources[r]);
        }
      }
    } catch (e) {
      if (this.options.file)
        e.message = this.options.file + '\n' + e.message;

      throw e;
    }
  }

  run(app?): Promise<Bat> {
    let prom = ATLHelpers.flatPromise();

    try {
      if (this.ast.options.selfSignedCert) {
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
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

      // Run tests

      let tests = this.allTests();
      let allDone = [];

      tests.forEach(test => {
        let testResult = test.run();

        allDone.push(
          testResult
            .then(result => Promise.resolve({
              response: result,
              success: true
            }))
            .catch(result => Promise.resolve({
              response: result,
              success: false
            }))
        );

        testResult.then(res => {
          this.registerTestResult(test, {
            req: test.requester.superAgentRequest,
            res: test.requester.superAgentResponse,
            test: test,
            url: test.requester.url
          });
        });
      });

      Promise.all(allDone).then(() => prom.resolver());
    } catch (e) {
      prom.rejecter(e);
    }

    return prom.promise;
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
    res: superAgent.Response;
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

  allTests(): ATLHelpers.ATLTest[] {
    let tests = [];

    const walk = (suite: ATLHelpers.ATLSuite) => {
      if (suite.test)
        tests.push(suite.test);

      if (suite.suites && Object.keys(suite.suites).length) {
        for (let k in suite.suites)
          walk(suite.suites[k]);
      }
    };

    for (let suite in this.ast.suites)
      walk(this.ast.suites[suite]);

    return tests;
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