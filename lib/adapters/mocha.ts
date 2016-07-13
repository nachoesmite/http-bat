// NODE
import { inspect } from 'util';

// LOCAL
import { ATLTest, ATLSuite, flatPromise } from '../ATLHelpers';
import { ATL } from '../ATL';
import { Bat } from '../bat';
import { CoverageResource, CoverageAssertion } from '../Coverage';

function runSuite(suite: ATLSuite): Promise<boolean> {
  let execFn = suite.skip ? describe.skip : describe;

  if (suite.test) {
    let test = suite.test;

    execFn(test.description || (test.method.toUpperCase() + ' ' + test.uri), function () {
      it(test.method.toUpperCase() + ' ' + test.uri, function (done) {
        this.timeout(test.timeout + 100);
        test
          .requester
          .promise
          .then(response => {
            done();
          })
          .catch(err => {
            console.error(inspect(err));
            done(err);
          });
      });

      test.assertions.forEach(x => {
        (x.skip ? it.skip : it)(x.name, function (done) {
          this.timeout(test.timeout + 100);
          x.promise
            .then(err => {
              if (err) {
                console.error(inspect(err));
                done(err);
              } else
                done();
            })
            .catch(err => {
              console.error(inspect(err));
              done(err);
            });
        });
      });
    });

    return test.promise
      .then(x => true)
      .catch(x => false);
  }

  let that = this;

  let flatProm = flatPromise();

  if (suite.suites && Object.keys(suite.suites).length) {
    execFn(suite.name, function () {
      let results = [];

      for (let k in suite.suites) {
        results.push(runSuite(suite.suites[k]));
      }

      Promise.all(
        results.filter(x => !!x)
      )
        .then(results => {
          flatProm.resolver(results.every(result => result == true));
        })
        .catch(results => {
          flatProm.resolver(false);
        });
    });
  }

  return flatProm.promise;
}



export function registerMochaSuites(bat: Bat) {
  let allSuites = [];

  for (let suiteName in bat.ast.suites) {
    allSuites.push(runSuite(bat.ast.suites[suiteName]));
  }

  if (bat.ast.raml) {
    describe("RAML Coverage", () => {
      if (bat.ast.options.raml.coverage) {

        bat.coverageElements.forEach(x => {
          injectMochaCoverageTests(x.resourceAssertion);
        });
      }

      Promise.all(allSuites).then(r => {
        bat.coverageElements.forEach(item => item.run());

        Promise.all(
          bat
            .coverageElements
            .map(x => x.getCoverage())
        ).then(x => {
          let total = x.reduce((prev, actual) => {
            prev.errored += actual.errored;
            prev.total += actual.total;
            prev.notCovered += actual.notCovered;
            return prev;
          }, { total: 0, errored: 0, notCovered: 0 });
          console.log('RAMLCoverage:', inspect(total, false, 2, true));
        });
      });
    });
  }
}

const walkCoverageAssetion = (assertion: CoverageAssertion, level: number) => {
  if (assertion.validationFn) {
    it(assertion.name, function (done) {
      assertion.promise.promise
        .then(() => done())
        .catch(done);
    });
  }
  if (assertion.innerAssertions.length) {
    describe(assertion.name, function () {
      this.bail(false);
      assertion.innerAssertions.forEach(x => walkCoverageAssetion(x, level + 1));
    });
  }
};

function injectMochaCoverageTests(x: CoverageAssertion) {
  x && walkCoverageAssetion(x, 0);
}