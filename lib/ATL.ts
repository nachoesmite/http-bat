import util = require('util');

import ATLHelpers = require('./ATLHelpers');
import _ = require('lodash');
import RAML = require('raml-1-parser');

import { SuperAgent, SuperAgentRequest, agent } from 'superagent';

import path = require('path');

if (typeof Promise != 'function')
  require('es6-promise').polyfill();

export interface IATLOptions {
  variables?: ATLHelpers.IDictionary<any>;
  path?: string;
  file?: string;
  baseUri?: string;
  baseUriParameters?: ATLHelpers.IDictionary<string>;
  selfSignedCert: boolean;
  raml: {
    coverage: boolean;
    resourceTypes: boolean;
    traits: boolean;
  };
}

export class ATL {
  options: IATLOptions = {
    variables: {},
    path: null,
    file: null,
    selfSignedCert: false,
    raml: {
      coverage: true,
      resourceTypes: true,
      traits: true
    }
  };

  agent: SuperAgent<SuperAgentRequest>;

  raml: RAML.api08.Api | RAML.api10.Api;

  suites: ATLHelpers.IDictionary<ATLHelpers.ATLSuite> = {};

  schemas: ATLHelpers.IDictionary<any> = {};

  fromObject(object: any) {
    if (typeof object !== "object")
      throw new TypeError("fromObject: the first parameter must be an object");

    // merge the variables
    if ('variables' in object) {
      if (typeof object.variables != "object")
        throw new TypeError("fromObject.variables: MUST be an object");

      this.options.variables = _.merge(this.options.variables || {}, object.variables);
    } else {
      this.options.variables = this.options.variables || {};
    }

    // override variables.ENV if not exists or is an object

    if (!this.options.variables['ENV'] || typeof this.options.variables['ENV'] != "object")
      this.options.variables['ENV'] = {};

    _.extend(this.options.variables['ENV'], _.cloneDeep(process.env));

    // prepare the baseUri
    if ('baseUri' in object) {
      if (typeof object.baseUri == "string")
        this.options.baseUri = object.baseUri;
      else
        throw new TypeError("baseUri: invalid type");

      if (this.options.baseUri.substr(-1) === '/') {
        this.options.baseUri = this.options.baseUri.substr(0, this.options.baseUri.length - 1);
      }
    }

    if ('options' in object) {
      ATLHelpers.ensureInstanceOf("options", object.options, Object);

      Object.keys(object.options).forEach(key => {
        let value = object.options[key];

        switch (key) {
          case 'selfSignedCert':
            ATLHelpers.ensureInstanceOf("options.selfSignedCert", value, Boolean);
            this.options.selfSignedCert = !!value;
            break;
          case 'raml':
            ATLHelpers.ensureInstanceOf("options.raml", value, Object);
            _.merge(this.options.raml, value);
            break;
          default:
            throw new TypeError("unknown option:" + key);
        }
      });
    }

    if ('baseUriParameters' in object) {
      if (!object.baseUriParameters || typeof object.baseUriParameters != "object" || object.baseUriParameters instanceof Array)
        throw new TypeError("baseUriParameters: MUST be a dictionary");

      this.options.baseUriParameters = _.cloneDeep(object.baseUriParameters);
    }

    // parse the tests
    if ('tests' in object) {
      if (!object.tests || typeof object.tests != "object" || object.tests instanceof Array) {
        throw new TypeError("tests: MUST be a dictionary");
      }

      let suite: ATLHelpers.ATLSuite = null;

      for (let sequenceName in object.tests) {
        suite = ATLHelpers.parseSuites(object.tests[sequenceName], this);
        suite.name = sequenceName;

        this.suites[suite.name] = suite;
      }
    }

    if ('schemas' in object) {
      if (!object.schemas || !(object.schemas instanceof Array)) {
        throw new TypeError("schemas: MUST be a list");
      }

      for (let sequenceName in object.schemas) {
        let schemaName: string = null;

        if (typeof object.schemas[sequenceName] == "string") {
          // load string schema by path
          // TODO, load schema
          this._addSchema(sequenceName, {});

        } else if (typeof object.schemas[sequenceName] == "object") {
          this._addSchema(schemaName, object.schemas[sequenceName]);
        } else {
          throw new TypeError("schemas: invalid schema " + sequenceName);
        }
      }
    }

    if ('raml' in object) {
      if (!object.raml || typeof object.raml != "string") {
        throw new TypeError("raml: MUST be a string");
      }

      try {
        this.raml = RAML.loadApiSync(object.raml, { rejectOnErrors: true });
      } catch (e) {
        if (e.parserErrors) {
          throw path.resolve(object.raml) + ':\n' + e.message + "\n" + e.parserErrors.map(x => "  " + x.message + " line " + x.line).join("\n");
        } else {
          console.log(util.inspect(e));
        }
        throw e;
      }

      let schemas = this.raml.schemas();

      for (let i in schemas) {
        let schemaList = schemas[i].toJSON();
        for (let schemaName in schemaList) {
          let json = null;
          try {
            json = JSON.parse(schemaList[schemaName]);
            this._addSchema(schemaName, json);
          } catch (e) {
            e.message = 'Error parsing JSON schema ' + schemaName + '\n\t' + e.message + '\n' + util.inspect(schemaList[schemaName]);
            throw e;
          }
        }
      }
    }

    for (let suiteKey in this.suites) {
      this.replaceSchema(this.suites[suiteKey]);
    }
  }

  private replaceSchema(suite: ATLHelpers.ATLSuite) {
    if (suite.test && suite.test.response.body && suite.test.response.body.schema) {
      if (typeof suite.test.response.body.schema == "string") {
        if (suite.test.response.body.schema in this.schemas) {
          suite.test.response.body.schema = this.schemas[suite.test.response.body.schema];
        } else {
          throw new Error('schema ' + suite.test.response.body.schema + ' not found on test ' + suite.test.method + ' ' + suite.test.uri);
        }
      }
    }

    if (suite.suites) {
      for (let suiteKey in suite.suites) {
        this.replaceSchema(suite.suites[suiteKey]);
      }
    }
  }

  private _addSchema(schemaName: string, schema: any) {
    if (schemaName in this.schemas)
      throw new TypeError("schemas: duplicated schema " + schemaName);

    // VALIDATE SCHEMA

    this.schemas[schemaName] = schema;
  }
}