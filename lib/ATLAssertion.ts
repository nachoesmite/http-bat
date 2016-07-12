


class ATLError extends Error {

}

export abstract class ATLAssertion {
  promise: Promise<ATLError>;

  constructor(public parent: ATLTest) {
    this.promise = parent.promise
      .then(result => this.validate(result))
      // we don't care about IO errors
      .catch(() => Promise.reject(null));
  }

  abstract validate(result: any): Promise<ATLError>;
}
