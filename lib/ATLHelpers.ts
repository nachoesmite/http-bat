
import util = require('util');

import methods = require('methods');
import { ATL } from './ATL';
import PointerLib = require('./Pointer');

import { ATLError, ATLResponseAssertion, CommonAssertions } from './ATLAssertion';
import { ATLRequest } from './ATLRequest';
export const pointerLib = PointerLib;

export interface IDictionary<T> {
  [key: string]: T;
}

const log = console.log.bind(console);

/// ---

export class ATLSuite {
  constructor(public name: string) {

  }
  suites: IDictionary<ATLSuite> = null;
  async: boolean = false;
  descriptor: any = null;
  test: ATLTest = null;
  skip: boolean = false;
  ATL: ATL;
}

/// ---

export interface IATLTestRes {
  status?: number;
  body?: {
    is?: any;
    matches?: KeyValueObject<KeyValueObject<any>>[];
    take?: KeyValueObject<PointerLib.Pointer>[];
    copyTo?: PointerLib.Pointer;
    schema?: any;
    print?: boolean;
  };
  headers?: IDictionary<string>;
  print?: boolean;
}

export interface IATLTestReq {
  attach?: KeyValueObject<string>[];
  form?: KeyValueObject<any>[];
  json?: any;
  urlencoded?: KeyValueObject<any>[];
  queryParameters?: IDictionary<any>;
  headers?: IDictionary<any>;
}

export class ATLTest {
  suite: ATLSuite;

  description: string;
  testId: string;

  method: string;

  uri: string;
  uriParameters: IDictionary<any>;

  timeout = 30000;

  response: IATLTestRes = {};
  request: IATLTestReq = {};

  dependsOn: ATLSuite[] = [];

  skip: boolean = false;

  result: any;

  private _resolve: (error?) => void;
  private _reject: (error?) => void;

  promise: Promise<any> = new Promise((a, b) => {
    this._resolve = a;
    this._reject = b;
  });

  requester: ATLRequest = new ATLRequest(this);
  assertions: ATLResponseAssertion[] = [];

  run(): Promise<void> {

    let dependencies = this.dependsOn.length ? Promise.all(this.dependsOn.map(x => x.test.promise)) : Promise.resolve();

    dependencies
      .then(() => this.requester.run())
      .catch(() => {
        this.requester.dependencyFailed();
      });

    let assertionResults = Promise.all(this.assertions.map(x => x.promise));

    assertionResults
      .then(assertionResults => {
        let errors = assertionResults.filter(x => !!x);

        if (errors.length) {
          this._reject(errors);
        } else {
          this._resolve();
        }
      })
      .catch(errors => {
        this._reject(errors);
      });

    return this.promise;
  }
}

/// ---

export class KeyValueObject<T> {
  constructor(public key: string, public value: T) {

  }
}

/// ---

export function parseSuites(object, instance: ATL): ATLSuite {

  let suite = new ATLSuite("");

  suite.ATL = instance;

  let ret: IDictionary<ATLSuite> = suite.suites = {};

  let prevSuite = null;

  for (let t in object) {
    switch (t) {
      case 'skip':
        ensureInstanceOf("skip", object.skip, Number, Boolean);
        suite.skip = !!object.skip;
        break;

      default:
        let method = parseMethodHeader(t);

        if (method) {
          let methodBody = object[t];
          let subSuite = new ATLSuite(methodBody.description || (method.method.toUpperCase() + ' ' + method.url));

          subSuite.descriptor = methodBody;

          let warn = function (msg) {
            console.warn("Warning:\n\t" + subSuite.name + "\n\t\t" + msg);
          };

          try {
            subSuite.test = parseTest(subSuite.descriptor, warn, suite);
          } catch (e) {
            throw new Error((method.method.toUpperCase() + ' ' + method.url) + ", " + e);
          }

          subSuite.test.method = method.method;
          subSuite.test.uri = method.url;

          if (prevSuite)
            subSuite.test.dependsOn.push(prevSuite);

          prevSuite = subSuite;

          ret[subSuite.name] = subSuite;
        }
    }
  }

  return suite;
}

export function parseTest(body, warn: (warn) => void, suite: ATLSuite): ATLTest {
  let test = new ATLTest;
  test.suite = suite;

  // parse uriParameters
  if ('uriParameters' in body) {
    if (!body.uriParameters || typeof body.uriParameters != "object" || body.uriParameters instanceof Array)
      throw new TypeError("uriParameters must be an object");

    test.uriParameters = {};

    let keys = Object.keys(body.uriParameters);

    keys.forEach(key => {
      let val = body.uriParameters[key];
      ensureInstanceOf("queryParameters." + key, val, Number, String, PointerLib.Pointer);
      test.uriParameters[key] = val;
    });
  }

  // parse method description
  if ('description' in body) {
    ensureInstanceOf("description", body.description, String);

    if (body.description.trim().length > 0) {
      test.description = body.description;
    }
  }

  // parse method id
  if ('id' in body) {
    ensureInstanceOf("id", body.id, Number, String);

    test.testId = body.id.toString();
  }

  // parse timeout
  if ('timeout' in body) {
    ensureInstanceOf("timeout", body.timeout, Number);

    if (body.timeout <= 0)
      throw new TypeError("timeout must be a number > 0");

    test.timeout = body.timeout;
  }


  // parse queryParameters
  if ('queryParameters' in body) {
    if (!body.queryParameters || typeof body.queryParameters != "object" || body.queryParameters instanceof Array)
      throw new TypeError("queryParameters must be an object");

    test.request.queryParameters = test.request.queryParameters || {};

    let keys = Object.keys(body.queryParameters);

    keys.forEach(key => {
      let val = body.queryParameters[key];
      ensureInstanceOf("queryParameters." + key, val, Number, String, Boolean, PointerLib.Pointer);
      test.request.queryParameters[key] = val;
    });
  }

  test.request.headers = test.request.headers || {};

  // parse headers
  if ('headers' in body) {
    if (!body.headers || typeof body.headers != "object" || body.headers instanceof Array)
      throw new TypeError("headers must be an object");

    test.request.headers = test.request.headers || {};

    let keys = Object.keys(body.headers);

    keys.forEach(key => {
      let val = body.headers[key];
      ensureInstanceOf("headers." + key, val, String, PointerLib.Pointer);
      test.request.headers[key.toLowerCase()] = val;
    });
  }

  if ('request' in body) {
    parseRequest(test, body.request, warn);
  }

  if ('skip' in body) {
    ensureInstanceOf("skip", body.skip, Number, Boolean);
    test.skip = !!body.skip;
  }

  if ('response' in body) {
    parseResponse(test, body.response, warn);
  } else {
    test.response.status = 200;
  }

  generateTestAssertions(test);

  return test;
}

function parseRequest(test: ATLTest, request, warn) {
  ensureInstanceOf("body.request", request, Object);
  Object.keys(request).forEach(bodyKey => {
    let value = request[bodyKey];
    switch (bodyKey) {
      case 'content-type': // ###############################################################
        ensureInstanceOf("request.content-type", value, String, PointerLib.Pointer);

        test.request.headers = test.request.headers || {};
        test.request.headers['content-type'] = value;

        break;
      case 'json': // #######################################################################
        test.request.json = value;

        break;
      case 'attach': // #####################################################################
        ensureInstanceOf("request.attach", value, Array);

        test.request.attach = [];
        for (let i in value) {
          let currentAttachment = value[i];
          for (let key in currentAttachment) {
            test.request.attach.push(new KeyValueObject(key, currentAttachment[key]));
            break;
          }
        }

        break;
      case 'form': // #######################################################################
        if (!('content-type' in test.request.headers))
          test.request.headers['content-type'] = "multipart/form-data";
        else
          throw new TypeError("you CAN'T use content-type AND form fields");

        ensureInstanceOf("request.form", value, Array);

        test.request.form = [];
        for (let i in value) {
          let currentAttachment = value[i];
          for (let key in currentAttachment) {
            test.request.form.push(new KeyValueObject(key, currentAttachment[key]));
            break;
          }
        }

        break;
      case 'urlencoded': // #################################################################
        if (!('content-type' in test.request.headers))
          test.request.headers['content-type'] = "application/x-www-form-urlencoded";
        else
          throw new TypeError("you CAN'T use content-type AND urlencoded form");

        ensureInstanceOf("request.urlencoded", value, Array);

        test.request.urlencoded = value;

        break;
      default:
        warn("Unknown identifier request." + bodyKey);
    }
  });
}

function parseResponse(test: ATLTest, response, warn) {
  ensureInstanceOf("response", response, Object);
  Object.keys(response).forEach(bodyKey => {
    let value = response[bodyKey];
    switch (bodyKey) {
      case 'headers': // ####################################################################
        ensureInstanceOf("response.headers", value, Object);

        test.response.headers = {};

        let keys = Object.keys(value);

        keys.forEach(key => {
          let val = value[key];
          ensureInstanceOf("response.headers." + key, val, String, PointerLib.Pointer);
          test.response.headers[key.toLowerCase()] = val;
        });

        if (keys.length == 0) {
          warn("response.headers: empty parameters");
        }

        break;
      case 'contentType': // ################################################################
      case 'content-type':
        ensureInstanceOf("response.content-type", value, String, PointerLib.Pointer);

        test.response.headers = test.response.headers || {};

        if ('content-type' in test.response.headers)
          throw new TypeError("response.content-type alredy registered as request.header.content-type You can not use BOTH");

        test.response.headers['content-type'] = value;

        break;
      case 'status': // #####################################################################
        ensureInstanceOf("response.status", value, Number);

        test.response.status = value | 0;

        break;
      case 'print': // ######################################################################
        ensureInstanceOf("response.print", value, Boolean);

        test.response.print = value;
        break;
      case 'body':
        parseResponseBody(test, value, warn);

        break;
      default:
        warn("Unknown identifier response." + bodyKey);
    }
  });
}


function parseResponseBody(test: ATLTest, responseBody, warn) {
  ensureInstanceOf("response.body", responseBody, Object);

  test.response.body = {};

  Object.keys(responseBody).forEach(bodyKey => {
    let value = responseBody[bodyKey];
    switch (bodyKey) {
      case 'is': // ####################################################################
        test.response.body.is = value;

        break;
      case 'matches': // ################################################################
        ensureInstanceOf("response.body.matches", value, Array);

        test.response.body.matches = [];

        for (let i in value) {
          let kv = value[i];
          for (let i in kv) {
            test.response.body.matches.push(new KeyValueObject(i, kv[i]));
          }
        }

        break;
      case 'schema': // #################################################################
        ensureInstanceOf("response.body.schema", value, String, Object);

        test.response.body.schema = value;

        break;
      case 'take': // #####################################################################
        ensureInstanceOf("response.body.take", value, Array, PointerLib.Pointer);

        if (value instanceof Array) {
          test.response.body.take = [];
          value.forEach(function (takenElement) {
            for (let i in takenElement) {

              if (!(takenElement[i] instanceof PointerLib.Pointer))
                throw new Error("response.body.take.* must be a pointer ex: !!variable myValue");

              test.response.body.take.push(new KeyValueObject(i, takenElement[i]));
            }
          });

        } else {
          /* istanbul ignore else */
          if (value instanceof PointerLib.Pointer) {
            test.response.body.copyTo = value;
          } else {
            throw new Error("response.body.take must be a sequence of pointers or a !!variable");
          }
        }

        break;
      case 'print':
        ensureInstanceOf("response.body.print", value, Boolean);

        test.response.body.print = value;
        break;
      default:
        warn("Unknown identifier body.response." + bodyKey);
    }
  });
}

export function ensureInstanceOf(name: string, value: any, ...types: Function[]): void {
  for (let i = 0; i < types.length; i++) {

    if (typeof types[i] == "function") {
      if (types[i] === Object && typeof value != "object")
        continue;

      if (typeof value != "undefined") {
        if (types[i] === Number && typeof value == "number")
          if (isNaN(value))
            continue;
          else
            return;

        if (types[i] === String && typeof value === 'string')
          return;

        if (types[i] === Boolean && typeof value === 'boolean')
          return;

        if (value instanceof types[i])
          return;
      }
    }
  }

  throw new TypeError(name + " must be instance of " + types.map((x: any) => x && x.displayName || x && x.name || x.toString()).join(" | "));
}


export function parseMethodHeader(name) {
  let parts: string[] = name.split(/\s+/g);
  let method: string = null;

  method = parts[0].trim().toLowerCase();

  if (method.length == 0)
    return null;

  // methods should have 2 parts
  if (parts.length != 2)
    return null;

  if (parts[0] != parts[0].toUpperCase())
    return null;

  if (methods.indexOf(method) == -1)
    throw new TypeError("ERROR: unknown method " + method + " on " + name);

  // if the URL doesn't starts with "/"
  if (parts[1].substr(0, 1) != '/' && parts[1].substr(0, 1) != '?')
    throw new Error("ERROR: the url must starts with '/' or '?': " + name);

  // if the URL ends with "/"
  if (parts[1].substr(-1) == '/' && parts[1].length > 1)
    throw new Error("ERROR: the url must not ends with '/': " + name);

  return {
    method: method,
    url: parts[1]
  };
}


export function cloneObjectUsingPointers<T>(baseObject: T, store): any {
  if (typeof baseObject !== "object") {
    return baseObject;
  }

  return cloneObject(baseObject, store);
}


function cloneObject(obj, store) {

  if (obj === null || obj === undefined)
    return obj;

  if (typeof obj == "string" || typeof obj == "number" || typeof obj == "boolean")
    return obj;

  // Handle Date (return new Date object with old value)
  if (obj instanceof Date) {
    return new Date(obj);
  }

  if (obj instanceof String || obj instanceof Number || obj instanceof Boolean) {
    return obj;
  }

  // Handle Array (return a full slice of the array)
  if (obj instanceof Array) {
    let newArray = obj.slice();
    return newArray.map(x => cloneObject(x, store));
  }

  if (obj instanceof PointerLib.Pointer) {
    let result: any;
    try {
      result = cloneObject(obj.get(store), store);
    } catch (e) {
      console.error("cloneObject::Error", e);
    }

    return result;
  }

  if (obj instanceof RegExp) {
    return obj;
  }

  // Handle Object
  if (obj instanceof Object) {
    let copy = new obj.constructor();
    for (let attr in obj) {
      if (obj.hasOwnProperty(attr)) {
        copy[attr] = cloneObject(obj[attr], store);
      }
    }
    return copy;
  }

  throw new Error("Unable to copy obj! Its type isn't supported. " + util.inspect(obj));
}


export function matchUrl(url: string) {
  // remove hash & queryString
  url = url.split(/[?#]/)[0];

  // normalize uriParameters to ?
  url = url.replace(/\{([a-zA-Z0-9_]+)\}/g, function () {
    return '?';
  } as any);

  return url;
}


export function flatPromise() {
  let result = {
    resolver: null as (a?: any) => any,
    rejecter: null as (a: any) => any,
    promise: null as Promise<any>
  };

  result.promise = new Promise((a, b) => {
    result.resolver = a;
    result.rejecter = b;
  });

  return result;
}


export function errorDiff(msg, expected, actual, ctx) {
  let err = new Error(msg) as any;
  if (ctx) {
    err.message = null;
    err.inspect = function () {
      err.message = msg;
      return msg + "\n" + JSON.stringify(ctx, null, 2);
    };
  }
  err.expected = expected;
  err.actual = actual;
  err.showDiff = true;
  return err;
}


export function error(msg, ctx) {
  let err = new Error(msg) as any;
  if (ctx) {
    err.message = null;
    err.inspect = function () {
      err.message = msg;
      return msg + "\n" + JSON.stringify(ctx, null, 2);
    };
  }
  return err;
}


if (!(error('test', {}) instanceof Error)) process.exit(1);
if (!(errorDiff('test', 1, 2, {}) instanceof Error)) process.exit(1);


function generateTestAssertions(test: ATLTest) {
  if (test.skip) return;

  if (test.response) {
    if (test.response.status) {
      test.assertions.push(
        new CommonAssertions.StatusCodeAssertion(test, test.response.status)
      );
    }

    if (test.response.body) {
      if ('is' in test.response.body) {
        test.assertions.push(
          new CommonAssertions.BodyEqualsAssertion(test, test.response.body.is)
        );
      }

      if (test.response.body.schema) {
        test.assertions.push(
          new CommonAssertions.ValidateSchemaOperation(test, test.response.body.schema)
        );
      }

      if (test.response.body.matches) {
        test.response.body.matches.forEach(kvo => {
          test.assertions.push(
            new CommonAssertions.BodyMatchesAssertion(test, kvo.key, kvo.value)
          );
        });
      }

      if (test.response.headers) {
        for (let h in test.response.headers) {
          test.assertions.push(
            new CommonAssertions.HeaderMatchesAssertion(test, h, test.response.headers[h])
          );
        }
      }

      if (test.response.body.take) {
        let take = test.response.body.take;

        take.forEach(function (takenElement) {
          test.assertions.push(
            new CommonAssertions.CopyBodyValueOperation(test, takenElement.key, takenElement.value)
          );
        });
      }

      if (test.response.body.copyTo && test.response.body.copyTo instanceof pointerLib.Pointer) {
        test.assertions.push(
          new CommonAssertions.CopyBodyValueOperation(test, '*', test.response.body.copyTo)
        );
      }
    }
  }
}