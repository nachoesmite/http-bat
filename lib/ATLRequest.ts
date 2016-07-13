// NODE
import { inspect } from 'util';
import url = require('url');
import path = require('path');

// NPM
import { Response, SuperAgentRequest } from 'superagent';

// LOCAL
import { ATLTest, cloneObjectUsingPointers, flatPromise } from './ATLHelpers';
import { Pointer } from './Pointer';

export class ATLRequest {
  urlObject: url.Url;
  url: string;

  superAgentRequest: SuperAgentRequest;
  superAgentResponse: Response;

  private flatPromise = flatPromise();

  promise: Promise<Response> = this.flatPromise.promise;

  constructor(public test: ATLTest) {

  }

  run(): Promise<Response> {
    try {
      this._run();
    } catch (e) {
      this.flatPromise.rejecter(e);
    }
    return this.promise;
  }

  private _run() {
    this.urlObject = url.parse(this.test.uri, true);

    this.urlObject.query = this.urlObject.query || {};

    if (this.test.request.queryParameters) {
      if ('search' in this.urlObject)
        delete this.urlObject.search;

      let qsParams = cloneObjectUsingPointers(this.test.request.queryParameters, this.test.suite.ATL.options.variables);

      for (let i in qsParams) {
        let typeOfValue = typeof qsParams[i];

        if (typeOfValue == 'undefined') continue;

        if (typeOfValue != 'string' && typeOfValue != 'number') {
          throw new Error("Only strings and numbers are allowed on queryParameters. " + i + "=" + inspect(qsParams[i]));
        }

        this.urlObject.query[i] = qsParams[i];
      }
    }

    for (let i in this.test.uriParameters) {
      let value = null;

      if (this.test.uriParameters[i] instanceof Pointer) {
        value = this.test.uriParameters[i].get(this.test.suite.ATL.options.variables);
      } else {
        value = this.test.uriParameters[i];
      }

      let typeOfValue = typeof value;

      if (typeOfValue != 'string' && typeOfValue != 'number') {
        throw new Error("Only strings and numbers are allowed on uriParameters. " + i + "=" + inspect(value));
      }

      this.urlObject.pathname = this.urlObject.pathname.replace(new RegExp("{" + i + "}", "g"), function (fulltext, match) {
        return encodeURIComponent(value);
      });

      // TODO Method URI Interpolation
    }

    this.url = url.format(this.urlObject);


    let req: SuperAgentRequest = this.superAgentRequest = this.test.suite.ATL.agent[this.test.method.toLowerCase()](this.url);

    // we must send some data..
    if (this.test.request) {
      if (this.test.request.headers) {
        let headers = cloneObjectUsingPointers(this.test.request.headers, this.test.suite.ATL.options.variables);

        for (let h in headers) {
          req.set(h, headers[h] == undefined ? '' : headers[h].toString());
        }
      }

      if (this.test.request.json) {
        let data = cloneObjectUsingPointers(this.test.request.json, this.test.suite.ATL.options.variables);
        //          requestHolder.ctx.REQUEST.body = data;
        req.send(data);
      }

      if (this.test.request.attach) {
        /* istanbul ignore if */
        if (!this.test.suite.ATL.options.path) {
          throw new Error("attach is not allowed using RAW definitions");
        }

        for (let i in this.test.request.attach) {
          let currentAttachment = this.test.request.attach[i];
          req.attach(currentAttachment.key, path.resolve(this.test.suite.ATL.options.path, currentAttachment.value));
        }
      }

      if (this.test.request.form) {
        req.type('form');

        for (let i in this.test.request.form) {
          let currentAttachment = cloneObjectUsingPointers(this.test.request.form[i], this.test.suite.ATL.options.variables);
          req.field(currentAttachment.key, currentAttachment.value);
        }
      }

      if (this.test.request.urlencoded) {
        req.send(cloneObjectUsingPointers(this.test.request.urlencoded, this.test.suite.ATL.options.variables));
      }

      // TODO add RAW body, add elseifs validations
    }


    req.end((err, res) => {
      this.superAgentResponse = res;

      if (err) {
        return this.flatPromise.rejecter(err);
      }

      return this.flatPromise.resolver(res);
    });
  }

  dependencyFailed() {
    this.flatPromise.rejecter(new Error('Dependency failed, skipping request.'));
  }
}