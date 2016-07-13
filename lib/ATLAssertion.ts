import { ATLTest, cloneObjectUsingPointers } from './ATLHelpers';
import { inspect } from 'util';
import { Response } from 'superagent';
import _ = require('lodash');
import { Pointer } from './Pointer';

export class ATLError extends Error {
  expected: any;
  actual: any;
  assertion: ATLAssertion;
}

export class ATLSkipped extends Error {
  constructor() {
    super('SKIPPED');
  }
}

export abstract class ATLAssertion {
  promise: Promise<ATLError>;
  name: string;

  constructor(public parent: ATLTest) {
    this.promise = Promise.reject(null);
  }

  error(data: { actual?: any; expected?: any; message: string }) {
    let message = data.message
      .replace('{actual}', inspect(data.actual))
      .replace('{expected}', inspect(data.expected));

    let err = new ATLError(message);
    err.actual = data.actual;
    err.expected = data.expected;
    err.assertion = this;
    throw err;
  }

  protected getObjectValue(object: any) {
    return cloneObjectUsingPointers(object, this.parent.suite.ATL.options.variables);
  }
}

export abstract class ATLResponseAssertion extends ATLAssertion {
  constructor(test: ATLTest) {
    super(test);

    this.promise =
      test
        .requester
        .promise
        .then(response => {
          try {
            let result = this.validate(response);
            if (!result)
              return Promise.resolve();
            return result as Promise<ATLError>;
          } catch (err) {
            err.assertion = this;
            return Promise.reject(err);
          }
        })
        // we don't care about IO errors
        .catch(err => Promise.reject(err));
  }

  abstract validate(response: Response): Promise<ATLError> | void;
}

export namespace CommonAssertions {

  export class PromiseAssertion extends ATLResponseAssertion {
    constructor(parent: ATLTest, name: string, public evaluator: (res: Response) => Promise<Error | ATLError | void>) {
      super(parent);
      this.name = name;
    }

    validate(response: Response) {
      return this
        .evaluator(response)
        .catch(err => Promise.resolve(err));
    }
  }

  export class StatusCodeAssertion extends ATLResponseAssertion {
    constructor(parent: ATLTest, public statusCode: number) {
      super(parent);
      this.name = "response.status == " + statusCode;
    }

    validate(response: Response) {
      if (response.status != this.statusCode)
        this.error({
          message: 'expected status code {expected} got {actual} instead',
          expected: this.statusCode,
          actual: response.status
        });
    }
  }

  export class BodyEqualsAssertion extends ATLResponseAssertion {
    constructor(parent: ATLTest, public bodyIs: any) {
      super(parent);
      this.name = "response.body is #value";
    }

    validate(response: Response) {
      if (this.bodyIs && typeof this.bodyIs == "object" && this.bodyIs instanceof RegExp) {
        /* istanbul ignore if */
        if (!this.bodyIs.test(response.text)) {
          this.error({
            message: 'expected response.body to match {expected}, got {actual}',
            expected: this.bodyIs,
            actual: response.text
          });
        }
      } else {
        let takenBody;

        if (typeof this.bodyIs == "string") {
          takenBody = response.text;
        } else {
          takenBody = response.body;
        }

        let bodyEquals = this.getObjectValue(this.bodyIs);

        /* istanbul ignore if */
        if (!_.isEqual(bodyEquals, takenBody)) {
          this.error({
            message: 'expected response.body {expected}, got {actual}',
            expected: bodyEquals,
            actual: takenBody
          });
        }
      }
    }
  }


  export class BodyMatchesAssertion extends ATLResponseAssertion {
    constructor(parent: ATLTest, public key: string, public value: any) {
      super(parent);
      this.name = "response.body::" + key;
    }

    validate(response: Response) {
      let value: any = this.getObjectValue(this.value);

      let readed = _.get(response.body, this.key);

      if (
        (!(value instanceof RegExp) && !_.isEqual(readed, value))
        ||
        ((value instanceof RegExp) && !value.test(readed))
      ) {
        this.error({
          message: 'expected response.body::' + this.key + ' to match {expected}, got {actual}',
          expected: value,
          actual: readed
        });
      }
    }
  }


  export class CopyBodyValueOperation extends ATLResponseAssertion {
    constructor(parent: ATLTest, public key: string, public value: Pointer) {
      super(parent);
      this.name = "response.body::" + key + " >> " + value.path;
    }

    validate(response: Response) {
      if (this.key === '*') {
        this.value.set(this.parent.suite.ATL.options.variables, response.body);
      } else {
        let takenValue = _.get(response.body, this.key);
        this.value.set(this.parent.suite.ATL.options.variables, takenValue);
      }
    }
  }

  export class HeaderMatchesAssertion extends ATLResponseAssertion {
    constructor(parent: ATLTest, public header: string, public value: any) {
      super(parent);
      this.header = header.toLowerCase();
      this.name = "response.header::" + header;
    }

    validate(response: Response) {
      let value: any = this.getObjectValue(this.value);

      let readed = response.get(this.header);

      if (this.header === 'content-type') {
        if (readed.indexOf(';') != -1) {
          readed = readed.substr(0, readed.indexOf(';')).trim();
        }
      }

      if (
        typeof value != "string" &&
        typeof value != "number" &&
        typeof value != "undefined" &&
        typeof value != "object" &&
        !(value instanceof RegExp) &&
        value !== null
      ) {
        this.error({
          message: 'readed value of header MUST be string, number or undefined, got {expected} instead. response.header::' + this.header + ' is {actual}',
          expected: value,
          actual: readed
        });
      }

      if (
        (!(value instanceof RegExp) && !_.isEqual(readed, value))
        ||
        ((value instanceof RegExp) && !value.test(readed))
      ) {
        this.error({
          message: 'expected response.header::' + this.header + ' to match {expected}, got {actual}',
          expected: value,
          actual: readed
        });
      }
    }
  }

}