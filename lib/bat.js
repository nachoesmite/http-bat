"use strict";
// Node
var fs = require('fs');
var path = require('path');
var url = require('url');
var util = require('util');
// NPM
var jsYaml = require('js-yaml');
var _ = require('lodash');
var request = require('supertest');
var jsonschema = require('jsonschema');
var pathMatch = require('raml-path-match');
// Locals
var ATL = require('./ATL');
var ATLHelpers = require('./ATLHelpers');
var Coverage = require('./Coverage');
var RAMLCoverageReporter_1 = require('../lib/RAMLCoverageReporter');
var Bat = (function () {
    function Bat(options) {
        var _this = this;
        if (options === void 0) { options = {}; }
        this.options = options;
        this.describe = describe;
        this.it = it;
        this.coverageElements = [];
        this.coverageData = {};
        this.ast = new ATL.ATL();
        var gotAST = ATLHelpers.flatPromise();
        this.loaderSemaphore = gotAST.promise;
        this._loaded = gotAST.resolver;
        this._loadedFailed = gotAST.rejecter;
        if (options.raw) {
            this.raw(options.raw);
        }
        else if (this.options.file) {
            this.load(options.file);
        }
        else {
            this.checkMochaContext()
                .then(function () { return _this.run(); });
        }
    }
    Bat.prototype.checkMochaContext = function () {
        var _this = this;
        var gotContext = ATLHelpers.flatPromise();
        this.describe('Checking mocha context', function () {
            gotContext.resolver(this.ctx);
        });
        // check for context configurations
        return gotContext.promise.then(function (ctx) {
            if (ctx) {
                ctx = ctx.config || ctx;
                if (ctx.batFile) {
                    _this.load(ctx.batFile);
                }
                else if (ctx.rawBat) {
                    _this.raw(ctx.rawBat);
                }
                if (ctx.baseUri) {
                    _this.options.baseUri = ctx.baseUri;
                }
                if (ctx.variables) {
                    _this.options.variables = _this.options.variables || {};
                    _.merge(_this.options.variables, ctx.variables);
                }
            }
        });
    };
    Bat.prototype.updateState = function () {
        if (this.options.variables) {
            _.merge(this.ast.options.variables, this.options.variables);
        }
        if (this.options.baseUri && this.options.baseUri != 'default') {
            this.ast.options.baseUri = this.options.baseUri;
        }
    };
    Bat.prototype.load = function (file) {
        this.path = path.dirname(file);
        process.chdir(this.path);
        this.file = file;
        this.raw(fs.readFileSync(this.file, 'utf8'));
    };
    Bat.prototype.raw = function (content) {
        try {
            var parsed = jsYaml.load(content, {
                schema: ATLHelpers.pointerLib.createSchema()
            });
            this.ast.options.path = this.path;
            this.ast.fromObject(parsed);
            this.updateState();
            this._loaded();
        }
        catch (e) {
            if (this.options.file)
                e.message = this.options.file + '\n' + e.message;
            throw e;
        }
    };
    Bat.prototype.run = function (app) {
        var _this = this;
        var prom = ATLHelpers.flatPromise();
        this.describe(this.file || 'http-bat', function () {
            if (_this.ast.options.selfSignedCert) {
                _this.it('Allowing self signed server certificates', function (done) {
                    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
                    done();
                });
            }
            if (_this.options.baseUri == 'default')
                delete _this.options.baseUri;
            if (!app || app === "default" || app === '') {
                app = _this.options.baseUri || _this.ast.options.baseUri;
            }
            if (!app) {
                throw new Error("baseUri not specified");
            }
            if (typeof app === 'string' && app.substr(-1) === '/') {
                app = app.substr(0, app.length - 1);
            }
            _this.ast.agent = request.agent(app);
            // Parse the raml for coverage
            if (_this.ast.raml) {
                var resources = _this.ast.raml.resources();
                for (var r in resources) {
                    _this.peekResource(resources[r]);
                }
            }
            // Run suites
            for (var k in _this.ast.suites) {
                var suite_1 = _this.ast.suites[k];
                _this.runSuite(suite_1);
            }
            _this.ensureRamlCoverage();
            _this.deferedIt('Finalize ATL Document').then(function (done) {
                prom.resolver();
                done();
            });
        });
        return prom.promise;
    };
    Bat.prototype.ensureRamlCoverage = function () {
        var _this = this;
        if (this.ast.raml) {
            this.describe("RAML Coverage", function () {
                _this.it('Wait the results before start', function (done) {
                    Promise.all(_this.coverageElements.map(function (item) { return item.run(); }))
                        .then(function () { return done(); })
                        .catch(function (err) { return done(err); });
                });
                if (_this.ast.options.raml.coverage) {
                    _this.coverageElements.forEach(function (x) { return x.injectMochaTests(); });
                }
                it('Print coverage', function (done) {
                    Promise.all(_this.coverageElements.map(function (x) { return x.getCoverage(); }))
                        .then(function (x) {
                        var total = x.reduce(function (prev, actual) {
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
    };
    Bat.prototype.peekResource = function (resource, parent) {
        var thisUrl = (parent || "") + resource.relativeUri().value();
        this.coverageElements.push(new Coverage.CoverageResource(resource, this));
        var resources = resource.resources();
        for (var r in resources) {
            this.peekResource(resources[r], thisUrl);
        }
    };
    Bat.prototype.registerTestResult = function (test, ctx) {
        var key = ATLHelpers.matchUrl(test.uri);
        this.coverageElements.forEach(function (coverageElement) {
            if (coverageElement.matches(ctx.url)) {
                coverageElement.resolve(ctx.test, ctx.res);
            }
        });
    };
    Bat.prototype.runSuite = function (suite) {
        var execFn = suite.skip ? this.describe.skip : this.describe;
        var promises = [];
        if (suite.test) {
            // this.runTest(suite.test);
            promises.push(suite.test.run());
            generateMochaTest(suite.test);
        }
        var that = this;
        if (suite.suites && Object.keys(suite.suites).length) {
            execFn(suite.name, function () {
                for (var k in suite.suites) {
                    var s = suite.suites[k];
                    promises = promises.concat(that.runSuite(s));
                }
            });
        }
        return Promise.all(promises);
    };
    Bat.prototype.obtainSchemaValidator = function (schema) {
        var v = new jsonschema.Validator();
        if (typeof schema == "string") {
            if (schema in this.ast.schemas) {
                v.addSchema(this.ast.schemas[schema], schema);
                schema = this.ast.schemas[schema];
            }
            else {
                try {
                    schema = JSON.parse(schema);
                    v.addSchema(schema);
                }
                catch (e) {
                }
            }
        }
        else if (typeof schema == "object") {
            v.addSchema(schema);
        }
        else {
            throw new Error('Invalid schema ' + util.inspect(schema));
        }
        if (v.unresolvedRefs && v.unresolvedRefs.length) {
            this.describe("Load referenced schemas", function () {
                var _this = this;
                var _loop_1 = function() {
                    var nextSchema = v.unresolvedRefs.shift();
                    this_1.it("load schema " + nextSchema, function () {
                        var theSchema = _this.ast.schemas[nextSchema];
                        if (!theSchema)
                            throw new Error("schema " + nextSchema + " not found");
                        v.addSchema(theSchema, nextSchema);
                    });
                };
                var this_1 = this;
                while (v.unresolvedRefs && v.unresolvedRefs.length) {
                    _loop_1();
                }
            });
        }
        return function (content) {
            return v.validate(content, schema);
        };
    };
    Bat.prototype.runTest = function (test) {
        var execFn = test.skip
            ? this.describe.skip
            : this.describe;
        var that = this;
        var requestHolder = {
            req: null,
            res: null,
            url: test.uri,
            ctx: {
                REQUEST: {},
                RESPONSE: {}
            }
        };
        execFn(test.description || (test.method.toUpperCase() + ' ' + test.uri), function () {
            if (test.uriParameters) {
                that.deferedIt('Ensure uriParameters').then(function (resolver) {
                    var _loop_2 = function(i) {
                        var value = null;
                        if (test.uriParameters[i] instanceof ATLHelpers.pointerLib.Pointer) {
                            value = test.uriParameters[i].get(that.ast.options.variables);
                        }
                        else {
                            value = test.uriParameters[i];
                        }
                        var typeOfValue = typeof value;
                        /* istanbul ignore if */
                        if (typeOfValue != 'string' && typeOfValue != 'number') {
                            resolver("Only strings and numbers are allowed on uriParameters. " + i + "=" + util.inspect(value));
                            return { value: void 0 };
                        }
                        requestHolder.url = requestHolder.url.replace(new RegExp("{" + i + "}", "g"), function (fulltext, match) {
                            return encodeURIComponent(value);
                        });
                    };
                    for (var i in test.uriParameters) {
                        var state_2 = _loop_2(i);
                        if (typeof state_2 === "object") return state_2.value;
                    }
                    resolver();
                });
            }
            var parsedUrl = url.parse(requestHolder.url, true);
            parsedUrl.query = parsedUrl.query || {};
            var newQs = parsedUrl.query;
            if (test.request.queryParameters) {
                that.deferedIt('Ensure queryParameters').then(function (resolver) {
                    if ('search' in parsedUrl)
                        delete parsedUrl.search;
                    var qsParams = ATLHelpers.cloneObjectUsingPointers(test.request.queryParameters, that.ast.options.variables);
                    for (var i in qsParams) {
                        newQs[i] = qsParams[i];
                    }
                    requestHolder.ctx.REQUEST.queryParameters = qsParams;
                    requestHolder.url = url.format(parsedUrl);
                    resolver();
                });
            }
            that.deferedIt(test.method.toUpperCase() + ' ' + requestHolder.url, test.timeout).then(function (resolver) {
                try {
                    var req_1 = requestHolder.req = that.ast.agent[test.method.toLowerCase()](requestHolder.url);
                    requestHolder.ctx.REQUEST.method = test.method;
                    requestHolder.ctx.REQUEST.url = requestHolder.url;
                    // we must send some data..
                    if (test.request) {
                        if (test.request.headers) {
                            requestHolder.ctx.REQUEST.headers = {};
                            var headers = ATLHelpers.cloneObjectUsingPointers(test.request.headers, that.ast.options.variables);
                            for (var h in headers) {
                                req_1.set(h, headers[h] == undefined ? '' : headers[h].toString());
                                if (typeof test.request.headers[h] == "object" && test.request.headers[h] instanceof ATLHelpers.pointerLib.Pointer && test.request.headers[h].path.indexOf("ENV") == 0) {
                                    requestHolder.ctx.REQUEST.headers[h] = "(TAKEN FROM " + test.request.headers[h].path + ")";
                                }
                                else {
                                    requestHolder.ctx.REQUEST.headers[h] = typeof headers[h] != "undefined" && headers[h].toString() || headers[h];
                                }
                            }
                        }
                        if (test.request.json) {
                            var data = ATLHelpers.cloneObjectUsingPointers(test.request.json, that.ast.options.variables);
                            requestHolder.ctx.REQUEST.body = data;
                            req_1.send(data);
                        }
                        if (test.request.attach) {
                            /* istanbul ignore if */
                            if (!that.path) {
                                resolver(ATLHelpers.error("attach is not allowed using RAW definitions", requestHolder.ctx));
                                return;
                            }
                            for (var i in test.request.attach) {
                                var currentAttachment = test.request.attach[i];
                                try {
                                    req_1.attach(currentAttachment.key, path.resolve(that.path, currentAttachment.value));
                                }
                                catch (e) {
                                    resolver(e);
                                    return;
                                }
                            }
                        }
                        if (test.request.form) {
                            req_1.type('form');
                            for (var i in test.request.form) {
                                var currentAttachment = ATLHelpers.cloneObjectUsingPointers(test.request.form[i], that.ast.options.variables);
                                req_1.field(currentAttachment.key, currentAttachment.value);
                            }
                        }
                        if (test.request.urlencoded) {
                            req_1.send(ATLHelpers.cloneObjectUsingPointers(test.request.urlencoded, that.ast.options.variables));
                        }
                    }
                    req_1.end(function (err, res) {
                        requestHolder.res = res;
                        requestHolder.ctx.RESPONSE = res;
                        /* istanbul ignore if: untestable */
                        if (err && err instanceof Error) {
                            err = ATLHelpers.error(err.message, requestHolder.ctx);
                        }
                        resolver(err);
                        if (!err) {
                            that.registerTestResult(test, {
                                req: req_1,
                                res: res,
                                test: test,
                                url: requestHolder.url
                            });
                        }
                        test.resolve(res, err);
                    });
                }
                catch (e) {
                    resolver(e);
                }
            });
            execFn("Validate response", function () {
                if (test.response) {
                    if (test.response.status) {
                        that.deferedIt("response.status == " + test.response.status, test.timeout).then(function (resolver) {
                            /* istanbul ignore else */
                            if (requestHolder.res.status == test.response.status)
                                resolver();
                            else
                                resolver(ATLHelpers.error('expected status code ' + test.response.status + ' got ' + requestHolder.res.status, requestHolder.ctx));
                        });
                    }
                    if (test.response.body) {
                        if ('is' in test.response.body) {
                            that.deferedIt("response.body", test.timeout).then(function (resolver) {
                                var bodyEquals = ATLHelpers.cloneObjectUsingPointers(test.response.body.is, that.ast.options.variables);
                                try {
                                    if (test.response.body.is && typeof test.response.body.is == "object" && test.response.body.is instanceof RegExp) {
                                        /* istanbul ignore if */
                                        if (!test.response.body.is.test(requestHolder.res.text)) {
                                            var a = util.inspect(bodyEquals);
                                            var b = util.inspect(test.response.body.is);
                                            resolver(ATLHelpers.error('expected response.body to match ' + a + ' response body, got ' + b, requestHolder.ctx));
                                        }
                                        else {
                                            resolver();
                                        }
                                    }
                                    else {
                                        var takenBody = void 0;
                                        if (typeof test.response.body.is == "string") {
                                            takenBody = requestHolder.res.text;
                                        }
                                        else {
                                            takenBody = requestHolder.res.body;
                                        }
                                        /* istanbul ignore if */
                                        if (!_.isEqual(bodyEquals, takenBody)) {
                                            var a = util.inspect(bodyEquals);
                                            var b = util.inspect(takenBody);
                                            resolver(ATLHelpers.errorDiff('expected ' + a + ' response body, got ' + b, bodyEquals, takenBody, requestHolder.ctx));
                                        }
                                        else {
                                            resolver();
                                        }
                                    }
                                }
                                catch (e) {
                                    resolver(e);
                                }
                            });
                        }
                        if (test.response.body.schema) {
                            var v_1 = that.obtainSchemaValidator(test.response.body.schema);
                            that.deferedIt("response.body schema", test.timeout).then(function (resolver) {
                                var validationResult = v_1(requestHolder.res.body);
                                try {
                                    if (validationResult.valid) {
                                        resolver();
                                    }
                                    else {
                                        var errors_1 = ["Schema error:"];
                                        validationResult.errors && validationResult.errors.forEach(function (x) { return errors_1.push("  " + x.stack); });
                                        resolver(ATLHelpers.error(errors_1.join('\n') || "Invalid schema", requestHolder.ctx));
                                    }
                                }
                                catch (e) {
                                    resolver(e);
                                }
                            });
                        }
                        if (test.response.body.matches) {
                            test.response.body.matches.forEach(function (kvo) {
                                that.deferedIt("response.body::" + kvo.key, test.timeout).then(function (resolver) {
                                    var value = ATLHelpers.cloneObjectUsingPointers(kvo.value, that.ast.options.variables);
                                    var readed = _.get(requestHolder.res.body, kvo.key);
                                    /* istanbul ignore if */
                                    if ((!(value instanceof RegExp) && !_.isEqual(readed, value))
                                        ||
                                            ((value instanceof RegExp) && !value.test(readed))) {
                                        resolver(ATLHelpers.errorDiff('expected response.body::' + kvo.key + ' to be ' + util.inspect(value) + ' got ' + util.inspect(readed), value, readed, requestHolder.ctx));
                                    }
                                    else {
                                        resolver();
                                    }
                                });
                            });
                        }
                        if (test.response.body.take) {
                            var take = test.response.body.take;
                            take.forEach(function (takenElement) {
                                that.deferedIt("response.body::" + takenElement.key + " >> !!variables " + takenElement.value.path, test.timeout).then(function (resolver) {
                                    var takenValue = _.get(requestHolder.res.body, takenElement.key);
                                    takenElement.value.set(that.ast.options.variables, takenValue);
                                    resolver();
                                });
                            });
                        }
                        if (test.response.body.copyTo && test.response.body.copyTo instanceof ATLHelpers.pointerLib.Pointer) {
                            that.deferedIt("response.body >> !!variables " + test.response.body.copyTo.path, test.timeout).then(function (resolver) {
                                test.response.body.copyTo.set(that.ast.options.variables, requestHolder.res.body);
                                resolver();
                            });
                        }
                        if (test.response.headers) {
                            var headers_1 = ATLHelpers.cloneObjectUsingPointers(test.response.headers, that.options.variables);
                            var _loop_3 = function(h) {
                                if (h !== 'content-type') {
                                    headers_1[h] = headers_1[h].toString();
                                    that.deferedIt("response.header::" + h, test.timeout).then(function (resolve) {
                                        var value = requestHolder.res.get(h.toLowerCase());
                                        /* istanbul ignore if */
                                        if (headers_1[h] != value) {
                                            var a = util.inspect(headers_1[h]);
                                            var b = util.inspect(value);
                                            resolve(ATLHelpers.errorDiff('expected response.header::' + h + ' to be ' + a + ' got ' + b, headers_1[h], value, requestHolder.ctx));
                                        }
                                        else {
                                            resolve();
                                        }
                                    });
                                }
                            };
                            for (var h in headers_1) {
                                _loop_3(h);
                            }
                        }
                    }
                }
            });
        });
    };
    Bat.prototype.deferedIt = function (name, timeout) {
        var fill = null;
        var prom = ATLHelpers.flatPromise();
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
                }
                else {
                    done();
                }
            });
            prom.promise.catch(done);
        });
        return prom.promise;
    };
    Bat.prototype.writeCoverage = function (coverFile) {
        var _this = this;
        var cwd = path.dirname(coverFile);
        if (this.coverageData && Object.keys(this.coverageData).length) {
            console.info("Writing coverage information: " + coverFile);
            var coverage = '';
            try {
                fs.mkdirSync(cwd);
            }
            catch (e) { }
            try {
                coverage = fs.readFileSync(coverFile).toString();
            }
            catch (e) {
            }
            if (coverage.length)
                coverage = coverage + '\n';
            coverage =
                coverage += Object.keys(this.coverageData)
                    .filter(function (x) { return !!x; })
                    .map(function (file) {
                    return RAMLCoverageReporter_1.generateString(file, _this.coverageData[file]);
                }).join('\n');
            fs.writeFileSync(coverFile, coverage);
            console.info("Writing coverage information. OK!");
        }
    };
    return Bat;
}());
exports.Bat = Bat;
function generateMochaTest(test) {
    var execFn = test.skip
        ? describe.skip
        : describe;
    execFn(test.description || (test.method.toUpperCase() + ' ' + test.uri), function () {
        it(test.method.toUpperCase() + ' ' + test.uri, function (done) {
            test
                .requester
                .promise
                .then(function (response) {
                done();
            })
                .catch(function (err) {
                console.error(util.inspect(err));
                done(err);
            });
        });
        test.assertions.forEach(function (x) {
            it(x.name, function (done) {
                x.promise
                    .then(function (err) {
                    if (err) {
                        console.error(util.inspect(err));
                        done(err);
                    }
                    else
                        done();
                })
                    .catch(function (err) {
                    console.error(util.inspect(err));
                    done(err);
                });
            });
        });
    });
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYmF0LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiYmF0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQSxPQUFPO0FBQ1AsSUFBTyxFQUFFLFdBQVcsSUFBSSxDQUFDLENBQUM7QUFDMUIsSUFBTyxJQUFJLFdBQVcsTUFBTSxDQUFDLENBQUM7QUFDOUIsSUFBTyxHQUFHLFdBQVcsS0FBSyxDQUFDLENBQUM7QUFDNUIsSUFBTyxJQUFJLFdBQVcsTUFBTSxDQUFDLENBQUM7QUFFOUIsTUFBTTtBQUNOLElBQU8sTUFBTSxXQUFXLFNBQVMsQ0FBQyxDQUFDO0FBQ25DLElBQU8sQ0FBQyxXQUFXLFFBQVEsQ0FBQyxDQUFDO0FBQzdCLElBQU8sT0FBTyxXQUFXLFdBQVcsQ0FBQyxDQUFDO0FBSXRDLElBQU0sVUFBVSxHQUFHLE9BQU8sQ0FBQyxZQUFZLENBQUMsQ0FBQztBQUN6QyxJQUFNLFNBQVMsR0FBRyxPQUFPLENBQUMsaUJBQWlCLENBQUMsQ0FBQztBQUU3QyxTQUFTO0FBQ1QsSUFBTyxHQUFHLFdBQVcsT0FBTyxDQUFDLENBQUM7QUFDOUIsSUFBTyxVQUFVLFdBQVcsY0FBYyxDQUFDLENBQUM7QUFDNUMsSUFBTyxRQUFRLFdBQVcsWUFBWSxDQUFDLENBQUM7QUFDeEMscUNBQW1ELDZCQUE2QixDQUFDLENBQUE7QUFXakY7SUFlRSxhQUFtQixPQUF5QjtRQWY5QyxpQkF5b0JDO1FBMW5CYSx1QkFBZ0MsR0FBaEMsWUFBZ0M7UUFBekIsWUFBTyxHQUFQLE9BQU8sQ0FBa0I7UUFMNUMsYUFBUSxHQUFRLFFBQVEsQ0FBQztRQUN6QixPQUFFLEdBQVEsRUFBRSxDQUFDO1FBRWIscUJBQWdCLEdBQWdDLEVBQUUsQ0FBQztRQXdsQm5ELGlCQUFZLEdBRVAsRUFBRSxDQUFDO1FBdmxCTixJQUFJLENBQUMsR0FBRyxHQUFHLElBQUksR0FBRyxDQUFDLEdBQUcsRUFBRSxDQUFDO1FBRXpCLElBQUksTUFBTSxHQUFHLFVBQVUsQ0FBQyxXQUFXLEVBQUUs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VCxDQUFDLENBQUM7aUJBQ0QsS0FBSyxDQUFDLFVBQUEsR0FBRztnQkFDUixPQUFPLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztnQkFDakMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1lBQ1osQ0FBQyxDQUFDLENBQUM7UUFDUCxDQUFDLENBQUMsQ0FBQztRQUdILElBQUksQ0FBQyxVQUFVLENBQUMsT0FBTyxDQUFDLFVBQUEsQ0FBQztZQUN2QixFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksRUFBRSxVQUFVLElBQUk7Z0JBQ3ZCLENBQUMsQ0FBQyxPQUFPO3FCQUNOLElBQUksQ0FBQyxVQUFBLEdBQUc7b0JBQ1AsRUFBRSxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQzt3QkFDUixPQUFPLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQzt3QkFDakMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDO29CQUNaLENBQUM7b0JBQUMsSUFBSTt3QkFDSixJQUFJLEVBQUUsQ0FBQztnQkFDWCxDQUFDLENBQUM7cUJBQ0QsS0FBSyxDQUFDLFVBQUEsR0FBRztvQkFDUixPQUFPLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztvQkFDakMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDO2dCQUNaLENBQUMsQ0FBQyxDQUFDO1lBQ1AsQ0FBQyxDQUFDLENBQUM7UUFDTCxDQUFDLENBQUMsQ0FBQztJQUNMLENBQUMsQ0FBQyxDQUFDO0FBQ0wsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8vIE5vZGVcbmltcG9ydCBmcyA9IHJlcXVpcmUoJ2ZzJyk7XG5pbXBvcnQgcGF0aCA9IHJlcXVpcmUoJ3BhdGgnKTtcbmltcG9ydCB1cmwgPSByZXF1aXJlKCd1cmwnKTtcbmltcG9ydCB1dGlsID0gcmVxdWlyZSgndXRpbCcpO1xuXG4vLyBOUE1cbmltcG9ydCBqc1lhbWwgPSByZXF1aXJlKCdqcy15YW1sJyk7XG5pbXBvcnQgXyA9IHJlcXVpcmUoJ2xvZGFzaCcpO1xuaW1wb3J0IHJlcXVlc3QgPSByZXF1aXJlKCdzdXBlcnRlc3QnKTtcbmltcG9ydCBzdXBlckFnZW50ID0gcmVxdWlyZSgnc3VwZXJhZ2VudCcpO1xuaW1wb3J0IGV4cGVjdCA9IHJlcXVpcmUoJ2V4cGVjdCcpO1xuaW1wb3J0IFJBTUwgPSByZXF1aXJlKCdyYW1sLTEtcGFyc2VyJyk7XG5jb25zdCBqc29uc2NoZW1hID0gcmVxdWlyZSgnanNvbnNjaGVtYScpO1xuY29uc3QgcGF0aE1hdGNoID0gcmVxdWlyZSgncmFtbC1wYXRoLW1hdGNoJyk7XG5cbi8vIExvY2Fsc1xuaW1wb3J0IEFUTCA9IHJlcXVpcmUoJy4vQVRMJyk7XG5pbXBvcnQgQVRMSGVscGVycyA9IHJlcXVpcmUoJy4vQVRMSGVscGVycycpO1xuaW1wb3J0IENvdmVyYWdlID0gcmVxdWlyZSgnLi9Db3ZlcmFnZScpO1xuaW1wb3J0IHsgZ2VuZXJhdGVTdHJpbmcgYXMgY292ZXJhZ2VUb1N0cmluZyB9IGZyb20gJy4uL2xpYi9SQU1MQ292ZXJhZ2VSZXBvcnRlcic7XG5pbXBvcnQgeyBBVExFcnJvciwgQVRMU2tpcHBlZCwgQ29tbW9uQXNzZXJ0aW9ucyB9IGZyb20gJy4vQVRMQXNzZXJ0aW9uJztcblxuXG5leHBvcnQgaW50ZXJmYWNlIElCYXRPcHRpb25zIHtcbiAgYmFzZVVyaT86IHN0cmluZztcbiAgdmFyaWFibGVzPzogQVRMSGVscGVycy5JRGljdGlvbmFyeTxhbnk+O1xuICBmaWxlPzogc3RyaW5nO1xuICByYXc/OiBzdHJpbmc7XG59XG5cbmV4cG9ydCBjbGFzcyBCYXQge1xuICBwYXRoOiBzdHJpbmc7XG4gIGZpbGU6IHN0cmluZztcblxuICBhc3Q6IEFUTC5BVEw7XG5cbiAgcHJpdmF0ZSBfbG9hZGVkOiBGdW5jdGlvbjtcbiAgcHJpdmF0ZSBfbG9hZGVkRmFpbGVkOiBGdW5jdGlvbjtcbiAgbG9hZGVyU2VtYXBob3JlOiBQcm9taXNlPGFueT47XG5cbiAgZGVzY3JpYmU6IGFueSA9IGRlc2NyaWJlO1xuICBpdDogYW55ID0gaXQ7XG5cbiAgY292ZXJhZ2VFbGVtZW50czogQ292ZXJhZ2UuQ292ZXJhZ2VSZXNvdXJjZVtdID0gW107XG5cbiAgY29uc3RydWN0b3IocHVibGljIG9wdGlvbnM6IElCYXRPcHRpb25zID0ge30pIHtcbiAgICB0aGlzLmFzdCA9IG5ldyBBVEwuQVRMKCk7XG5cbiAgICBsZXQgZ290QVNUID0gQVRMSGVscGVycy5mbGF0UHJvbWlzZSgpO1xuXG4gICAgdGhpcy5sb2FkZXJTZW1hcGhvcmUgPSBnb3RBU1QucHJvbWlzZTtcbiAgICB0aGlzLl9sb2FkZWQgPSBnb3RBU1QucmVzb2x2ZXI7XG4gICAgdGhpcy5fbG9hZGVkRmFpbGVkID0gZ290QVNULnJlamVjdGVyO1xuXG4gICAgaWYgKG9wdGlvbnMucmF3KSB7XG4gICAgICB0aGlzLnJhdyhvcHRpb25zLnJhdyk7XG4gICAgfSBlbHNlIGlmICh0aGlzLm9wdGlvbnMuZmlsZSkge1xuICAgICAgdGhpcy5sb2FkKG9wdGlvbnMuZmlsZSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMuY2hlY2tNb2NoYUNvbnRleHQoKVxuICAgICAgICAudGhlbigoKSA9PiB0aGlzLnJ1bigpKTtcbiAgICB9XG4gIH1cblxuICBjaGVja01vY2hhQ29udGV4dCgpIHtcblxuICAgIGxldCBnb3RDb250ZXh0ID0gQVRMSGVscGVycy5mbGF0UHJvbWlzZSgpO1xuXG4gICAgdGhpcy5kZXNjcmliZSgnQ2hlY2tpbmcgbW9jaGEgY29udGV4dCcsIGZ1bmN0aW9uICgpIHtcbiAgICAgIGdvdENvbnRleHQucmVzb2x2ZXIodGhpcy5jdHgpO1xuICAgIH0pO1xuXG4gICAgLy8gY2hlY2sgZm9yIGNvbnRleHQgY29uZmlndXJhdGlvbnNcbiAgICByZXR1cm4gZ290Q29udGV4dC5wcm9taXNlLnRoZW4oY3R4ID0+IHtcbiAgICAgIGlmIChjdHgpIHtcbiAgICAgICAgY3R4ID0gY3R4LmNvbmZpZyB8fCBjdHg7XG5cbiAgICAgICAgaWYgKGN0eC5iYXRGaWxlKSB7XG4gICAgICAgICAgdGhpcy5sb2FkKGN0eC5iYXRGaWxlKTtcbiAgICAgICAgfSBlbHNlIGlmIChjdHgucmF3QmF0KSB7XG4gICAgICAgICAgdGhpcy5yYXcoY3R4LnJhd0JhdCk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoY3R4LmJhc2VVcmkpIHtcbiAgICAgICAgICB0aGlzLm9wdGlvbnMuYmFzZVVyaSA9IGN0eC5iYXNlVXJpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGN0eC52YXJpYWJsZXMpIHtcbiAgICAgICAgICB0aGlzLm9wdGlvbnMudmFyaWFibGVzID0gdGhpcy5vcHRpb25zLnZhcmlhYmxlcyB8fCB7fTtcbiAgICAgICAgICBfLm1lcmdlKHRoaXMub3B0aW9ucy52YXJpYWJsZXMsIGN0eC52YXJpYWJsZXMpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfSk7XG4gIH1cblxuICBwcml2YXRlIHVwZGF0ZVN0YXRlKCkge1xuICAgIGlmICh0aGlzLm9wdGlvbnMudmFyaWFibGVzKSB7XG4gICAgICBfLm1lcmdlKHRoaXMuYXN0Lm9wdGlvbnMudmFyaWFibGVzLCB0aGlzLm9wdGlvbnMudmFyaWFibGVzKTtcbiAgICB9XG5cbiAgICBpZiAodGhpcy5vcHRpb25zLmJhc2VVcmkgJiYgdGhpcy5vcHRpb25zLmJhc2VVcmkgIT0gJ2RlZmF1bHQnKSB7XG4gICAgICB0aGlzLmFzdC5vcHRpb25zLmJhc2VVcmkgPSB0aGlzLm9wdGlvbnMuYmFzZVVyaTtcbiAgICB9XG4gIH1cblxuICBsb2FkKGZpbGU6IHN0cmluZykge1xuICAgIHRoaXMucGF0aCA9IHBhdGguZGlybmFtZShmaWxlKTtcbiAgICBwcm9jZXNzLmNoZGlyKHRoaXMucGF0aCk7XG4gICAgdGhpcy5maWxlID0gZmlsZTtcblxuICAgIHRoaXMucmF3KGZzLnJlYWRGaWxlU3luYyh0aGlzLmZpbGUsICd1dGY4JykpO1xuICB9XG5cbiAgcmF3KGNvbnRlbnQ6IHN0cmluZykge1xuICAgIHRyeSB7XG4gICAgICBsZXQgcGFyc2VkID0ganNZYW1sLmxvYWQoY29udGVudCwge1xuICAgICAgICBzY2hlbWE6IEFUTEhlbHBlcnMucG9pbnRlckxpYi5jcmVhdGVTY2hlbWEoKVxuICAgICAgfSk7XG5cbiAgICAgIHRoaXMuYXN0Lm9wdGlvbnMucGF0aCA9IHRoaXMucGF0aDtcbiAgICAgIHRoaXMuYXN0LmZyb21PYmplY3QocGFyc2VkKTtcblxuICAgICAgdGhpcy51cGRhdGVTdGF0ZSgpO1xuXG4gICAgICB0aGlzLl9sb2FkZWQoKTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICBpZiAodGhpcy5vcHRpb25zLmZpbGUpXG4gICAgICAgIGUubWVzc2FnZSA9IHRoaXMub3B0aW9ucy5maWxlICsgJ1xcbicgKyBlLm1lc3NhZ2U7XG5cbiAgICAgIHRocm93IGU7XG4gICAgfVxuICB9XG5cbiAgcnVuKGFwcD8pOiBQcm9taXNlPEJhdD4ge1xuICAgIGxldCBwcm9tID0gQVRMSGVscGVycy5mbGF0UHJvbWlzZSgpO1xuXG4gICAgdGhpcy5kZXNjcmliZSh0aGlzLmZpbGUgfHwgJ2h0dHAtYmF0JywgKCkgPT4ge1xuICAgICAgaWYgKHRoaXMuYXN0Lm9wdGlvbnMuc2VsZlNpZ25lZENlcnQpIHtcbiAgICAgICAgdGhpcy5pdCgnQWxsb3dpbmcgc2VsZiBzaWduZWQgc2VydmVyIGNlcnRpZmljYXRlcycsIGRvbmUgPT4ge1xuICAgICAgICAgIHByb2Nlc3MuZW52Lk5PREVfVExTX1JFSkVDVF9VTkFVVEhPUklaRUQgPSBcIjBcIjtcbiAgICAgICAgICBkb25lKCk7XG4gICAgICAgIH0pO1xuICAgICAgfVxuXG5cbiAgICAgIGlmICh0aGlzLm9wdGlvbnMuYmFzZVVyaSA9PSAnZGVmYXVsdCcpXG4gICAgICAgIGRlbGV0ZSB0aGlzLm9wdGlvbnMuYmFzZVVyaTtcblxuICAgICAgaWYgKCFhcHAgfHwgYXBwID09PSBcImRlZmF1bHRcIiB8fCBhcHAgPT09ICcnKSB7XG4gICAgICAgIGFwcCA9IHRoaXMub3B0aW9ucy5iYXNlVXJpIHx8IHRoaXMuYXN0Lm9wdGlvbnMuYmFzZVVyaTtcbiAgICAgIH1cblxuICAgICAgaWYgKCFhcHApIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiYmFzZVVyaSBub3Qgc3BlY2lmaWVkXCIpO1xuICAgICAgfVxuXG4gICAgICBpZiAodHlwZW9mIGFwcCA9PT0gJ3N0cmluZycgJiYgYXBwLnN1YnN0cigtMSkgPT09ICcvJykge1xuICAgICAgICBhcHAgPSBhcHAuc3Vic3RyKDAsIGFwcC5sZW5ndGggLSAxKTtcbiAgICAgIH1cblxuICAgICAgdGhpcy5hc3QuYWdlbnQgPSByZXF1ZXN0LmFnZW50KGFwcCk7XG5cbiAgICAgIC8vIFBhcnNlIHRoZSByYW1sIGZvciBjb3ZlcmFnZVxuICAgICAgaWYgKHRoaXMuYXN0LnJhbWwpIHtcbiAgICAgICAgbGV0IHJlc291cmNlcyA9IHRoaXMuYXN0LnJhbWwucmVzb3VyY2VzKCk7XG5cbiAgICAgICAgZm9yIChsZXQgciBpbiByZXNvdXJjZXMpIHtcbiAgICAgICAgICB0aGlzLnBlZWtSZXNvdXJjZShyZXNvdXJjZXNbcl0pO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIC8vIFJ1biBzdWl0ZXNcbiAgICAgIGZvciAobGV0IGsgaW4gdGhpcy5hc3Quc3VpdGVzKSB7XG4gICAgICAgIGxldCBzdWl0ZSA9IHRoaXMuYXN0LnN1aXRlc1trXTtcblxuICAgICAgICB0aGlzLnJ1blN1aXRlKHN1aXRlKTtcbiAgICAgIH1cblxuICAgICAgdGhpcy5lbnN1cmVSYW1sQ292ZXJhZ2UoKTtcblxuICAgICAgdGhpcy5kZWZlcmVkSXQoJ0ZpbmFsaXplIEFUTCBEb2N1bWVudCcpLnRoZW4oZG9uZSA9PiB7XG4gICAgICAgIHByb20ucmVzb2x2ZXIoKTtcblxuICAgICAgICBkb25lKCk7XG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIHJldHVybiBwcm9tLnByb21pc2U7XG4gIH1cblxuICBwcml2YXRlIGVuc3VyZVJhbWxDb3ZlcmFnZSgpIHtcbiAgICBpZiAodGhpcy5hc3QucmFtbCkge1xuICAgICAgdGhpcy5kZXNjcmliZShcIlJBTUwgQ292ZXJhZ2VcIiwgKCkgPT4ge1xuICAgICAgICB0aGlzLml0KCdXYWl0IHRoZSByZXN1bHRzIGJlZm9yZSBzdGFydCcsIGRvbmUgPT4ge1xuICAgICAgICAgIFByb21pc2UuYWxsKHRoaXMuY292ZXJhZ2VFbGVtZW50cy5tYXAoaXRlbSA9PiBpdGVtLnJ1bigpKSlcbiAgICAgICAgICAgIC50aGVuKCgpID0+IGRvbmUoKSlcbiAgICAgICAgICAgIC5jYXRjaChlcnIgPT4gZG9uZShlcnIpKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgaWYgKHRoaXMuYXN0Lm9wdGlvbnMucmFtbC5jb3ZlcmFnZSkge1xuICAgICAgICAgIHRoaXMuY292ZXJhZ2VFbGVtZW50cy5mb3JFYWNoKHggPT4geC5pbmplY3RNb2NoYVRlc3RzKCkpO1xuICAgICAgICB9XG5cbiAgICAgICAgaXQoJ1ByaW50IGNvdmVyYWdlJywgKGRvbmUpID0+IHtcbiAgICAgICAgICBQcm9taXNlLmFsbCh0aGlzLmNvdmVyYWdlRWxlbWVudHMubWFwKHggPT4geC5nZXRDb3ZlcmFnZSgpKSlcbiAgICAgICAgICAgIC50aGVuKHggPT4ge1xuICAgICAgICAgICAgICBsZXQgdG90YWwgPSB4LnJlZHVjZSgocHJldiwgYWN0dWFsKSA9PiB7XG4gICAgICAgICAgICAgICAgcHJldi5lcnJvcmVkICs9IGFjdHVhbC5lcnJvcmVkO1xuICAgICAgICAgICAgICAgIHByZXYudG90YWwgKz0gYWN0dWFsLnRvdGFsO1xuICAgICAgICAgICAgICAgIHByZXYubm90Q292ZXJlZCArPSBhY3R1YWwubm90Q292ZXJlZDtcbiAgICAgICAgICAgICAgICByZXR1cm4gcHJldjtcbiAgICAgICAgICAgICAgfSwgeyB0b3RhbDogMCwgZXJyb3JlZDogMCwgbm90Q292ZXJlZDogMCB9KTtcbiAgICAgICAgICAgICAgY29uc29sZS5sb2codXRpbC5pbnNwZWN0KHRvdGFsLCBmYWxzZSwgMiwgdHJ1ZSkpO1xuICAgICAgICAgICAgICBkb25lKCk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgICB9KTtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIHBlZWtSZXNvdXJjZShyZXNvdXJjZTogUkFNTC5hcGkwOC5SZXNvdXJjZSB8IFJBTUwuYXBpMTAuUmVzb3VyY2UsIHBhcmVudD86IHN0cmluZykge1xuICAgIGxldCB0aGlzVXJsID0gKHBhcmVudCB8fCBcIlwiKSArIHJlc291cmNlLnJlbGF0aXZlVXJpKCkudmFsdWUoKTtcblxuICAgIHRoaXMuY292ZXJhZ2VFbGVtZW50cy5wdXNoKG5ldyBDb3ZlcmFnZS5Db3ZlcmFnZVJlc291cmNlKHJlc291cmNlIGFzIGFueSwgdGhpcykpO1xuXG4gICAgbGV0IHJlc291cmNlcyA9IHJlc291cmNlLnJlc291cmNlcygpO1xuXG4gICAgZm9yIChsZXQgciBpbiByZXNvdXJjZXMpIHtcbiAgICAgIHRoaXMucGVla1Jlc291cmNlKHJlc291cmNlc1tyXSwgdGhpc1VybCk7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSByZWdpc3RlclRlc3RSZXN1bHQodGVzdDogQVRMSGVscGVycy5BVExUZXN0LCBjdHg6IHtcbiAgICByZXE6IHJlcXVlc3QuVGVzdDtcbiAgICByZXM6IHJlcXVlc3QuUmVzcG9uc2U7XG4gICAgdGVzdDogQVRMSGVscGVycy5BVExUZXN0O1xuICAgIHVybDogc3RyaW5nO1xuICB9KSB7XG4gICAgbGV0IGtleSA9IEFUTEhlbHBlcnMubWF0Y2hVcmwodGVzdC51cmkpO1xuXG4gICAgdGhpcy5jb3ZlcmFnZUVsZW1lbnRzLmZvckVhY2goY292ZXJhZ2VFbGVtZW50ID0+IHtcbiAgICAgIGlmIChjb3ZlcmFnZUVsZW1lbnQubWF0Y2hlcyhjdHgudXJsKSkge1xuICAgICAgICBjb3ZlcmFnZUVsZW1lbnQucmVzb2x2ZShjdHgudGVzdCwgY3R4LnJlcyk7XG4gICAgICB9XG4gICAgfSk7XG4gIH1cblxuXG4gIHByaXZhdGUgcnVuU3VpdGUoc3VpdGU6IEFUTEhlbHBlcnMuQVRMU3VpdGUpOiBQcm9taXNlPGFueT4ge1xuICAgIGxldCBleGVjRm4gPSBzdWl0ZS5za2lwID8gdGhpcy5kZXNjcmliZS5za2lwIDogdGhpcy5kZXNjcmliZTtcbiAgICBsZXQgcHJvbWlzZXMgPSBbXTtcblxuICAgIGlmIChzdWl0ZS50ZXN0KSB7XG4gICAgICAvLyB0aGlzLnJ1blRlc3Qoc3VpdGUudGVzdCk7XG4gICAgICBwcm9taXNlcy5wdXNoKHN1aXRlLnRlc3QucnVuKCkpO1xuXG4gICAgICBnZW5lcmF0ZU1vY2hhVGVzdChzdWl0ZS50ZXN0KTtcbiAgICB9XG5cbiAgICBsZXQgdGhhdCA9IHRoaXM7XG5cbiAgICBpZiAoc3VpdGUuc3VpdGVzICYmIE9iamVjdC5rZXlzKHN1aXRlLnN1aXRlcykubGVuZ3RoKSB7XG4gICAgICBleGVjRm4oc3VpdGUubmFtZSwgZnVuY3Rpb24gKCkge1xuICAgICAgICBmb3IgKGxldCBrIGluIHN1aXRlLnN1aXRlcykge1xuICAgICAgICAgIGxldCBzID0gc3VpdGUuc3VpdGVzW2tdO1xuICAgICAgICAgIHByb21pc2VzID0gcHJvbWlzZXMuY29uY2F0KHRoYXQucnVuU3VpdGUocykpO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9XG5cbiAgICByZXR1cm4gUHJvbWlzZS5hbGwocHJvbWlzZXMpO1xuICB9XG5cbiAgb2J0YWluU2NoZW1hVmFsaWRhdG9yKHNjaGVtYTogYW55KSB7XG4gICAgbGV0IHYgPSBuZXcganNvbnNjaGVtYS5WYWxpZGF0b3IoKTtcblxuICAgIGlmICh0eXBlb2Ygc2NoZW1hID09IFwic3RyaW5nXCIpIHtcbiAgICAgIGlmIChzY2hlbWEgaW4gdGhpcy5hc3Quc2NoZW1hcykge1xuICAgICAgICB2LmFkZFNjaGVtYSh0aGlzLmFzdC5zY2hlbWFzW3NjaGVtYV0sIHNjaGVtYSk7XG4gICAgICAgIHNjaGVtYSA9IHRoaXMuYXN0LnNjaGVtYXNbc2NoZW1hXTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgc2NoZW1hID0gSlNPTi5wYXJzZShzY2hlbWEpO1xuICAgICAgICAgIHYuYWRkU2NoZW1hKHNjaGVtYSk7XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcblxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSBlbHNlIGlmICh0eXBlb2Ygc2NoZW1hID09IFwib2JqZWN0XCIpIHtcbiAgICAgIHYuYWRkU2NoZW1hKHNjaGVtYSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignSW52YWxpZCBzY2hlbWEgJyArIHV0aWwuaW5zcGVjdChzY2hlbWEpKTtcbiAgICB9XG5cbiAgICBpZiAodi51bnJlc29sdmVkUmVmcyAmJiB2LnVucmVzb2x2ZWRSZWZzLmxlbmd0aCkge1xuICAgICAgdGhpcy5kZXNjcmliZShcIkxvYWQgcmVmZXJlbmNlZCBzY2hlbWFzXCIsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgd2hpbGUgKHYudW5yZXNvbHZlZFJlZnMgJiYgdi51bnJlc29sdmVkUmVmcy5sZW5ndGgpIHtcbiAgICAgICAgICBsZXQgbmV4dFNjaGVtYSA9IHYudW5yZXNvbHZlZFJlZnMuc2hpZnQoKTtcbiAgICAgICAgICB0aGlzLml0KFwibG9hZCBzY2hlbWEgXCIgKyBuZXh0U2NoZW1hLCAoKSA9PiB7XG4gICAgICAgICAgICBsZXQgdGhlU2NoZW1hID0gdGhpcy5hc3Quc2NoZW1hc1tuZXh0U2NoZW1hXTtcblxuICAgICAgICAgICAgaWYgKCF0aGVTY2hlbWEpXG4gICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcInNjaGVtYSBcIiArIG5leHRTY2hlbWEgKyBcIiBub3QgZm91bmRcIik7XG5cbiAgICAgICAgICAgIHYuYWRkU2NoZW1hKHRoZVNjaGVtYSwgbmV4dFNjaGVtYSk7XG4gICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH1cblxuICAgIHJldHVybiAoY29udGVudCkgPT4ge1xuICAgICAgcmV0dXJuIHYudmFsaWRhdGUoY29udGVudCwgc2NoZW1hKTtcbiAgICB9O1xuICB9XG5cbiAgcHJpdmF0ZSBydW5UZXN0KHRlc3Q6IEFUTEhlbHBlcnMuQVRMVGVzdCkge1xuICAgIGxldCBleGVjRm4gPSB0ZXN0LnNraXBcbiAgICAgID8gdGhpcy5kZXNjcmliZS5za2lwXG4gICAgICA6IHRoaXMuZGVzY3JpYmU7XG5cbiAgICBsZXQgdGhhdCA9IHRoaXM7XG5cbiAgICBsZXQgcmVxdWVzdEhvbGRlciA9IHtcbiAgICAgIHJlcTogbnVsbCBhcyByZXF1ZXN0LlRlc3QsXG4gICAgICByZXM6IG51bGwgYXMgcmVxdWVzdC5SZXNwb25zZSxcbiAgICAgIHVybDogdGVzdC51cmksXG4gICAgICBjdHg6IHtcbiAgICAgICAgUkVRVUVTVDoge30gYXMgYW55LFxuICAgICAgICBSRVNQT05TRToge30gYXMgYW55XG4gICAgICB9XG4gICAgfTtcblxuICAgIGV4ZWNGbih0ZXN0LmRlc2NyaXB0aW9uIHx8ICh0ZXN0Lm1ldGhvZC50b1VwcGVyQ2FzZSgpICsgJyAnICsgdGVzdC51cmkpLCBmdW5jdGlvbiAoKSB7XG5cbiAgICAgIGlmICh0ZXN0LnVyaVBhcmFtZXRlcnMpIHtcbiAgICAgICAgdGhhdC5kZWZlcmVkSXQoJ0Vuc3VyZSB1cmlQYXJhbWV0ZXJzJykudGhlbihmdW5jdGlvbiAocmVzb2x2ZXIpIHtcbiAgICAgICAgICBmb3IgKGxldCBpIGluIHRlc3QudXJpUGFyYW1ldGVycykge1xuICAgICAgICAgICAgbGV0IHZhbHVlID0gbnVsbDtcblxuICAgICAgICAgICAgaWYgKHRlc3QudXJpUGFyYW1ldGVyc1tpXSBpbnN0YW5jZW9mIEFUTEhlbHBlcnMucG9pbnRlckxpYi5Qb2ludGVyKSB7XG4gICAgICAgICAgICAgIHZhbHVlID0gdGVzdC51cmlQYXJhbWV0ZXJzW2ldLmdldCh0aGF0LmFzdC5vcHRpb25zLnZhcmlhYmxlcyk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICB2YWx1ZSA9IHRlc3QudXJpUGFyYW1ldGVyc1tpXTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgbGV0IHR5cGVPZlZhbHVlID0gdHlwZW9mIHZhbHVlO1xuXG4gICAgICAgICAgICAvKiBpc3RhbmJ1bCBpZ25vcmUgaWYgKi9cbiAgICAgICAgICAgIGlmICh0eXBlT2ZWYWx1ZSAhPSAnc3RyaW5nJyAmJiB0eXBlT2ZWYWx1ZSAhPSAnbnVtYmVyJykge1xuICAgICAgICAgICAgICByZXNvbHZlcihcIk9ubHkgc3RyaW5ncyBhbmQgbnVtYmVycyBhcmUgYWxsb3dlZCBvbiB1cmlQYXJhbWV0ZXJzLiBcIiArIGkgKyBcIj1cIiArIHV0aWwuaW5zcGVjdCh2YWx1ZSkpO1xuICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJlcXVlc3RIb2xkZXIudXJsID0gcmVxdWVzdEhvbGRlci51cmwucmVwbGFjZShuZXcgUmVnRXhwKFwie1wiICsgaSArIFwifVwiLCBcImdcIiksIGZ1bmN0aW9uIChmdWxsdGV4dCwgbWF0Y2gpIHtcbiAgICAgICAgICAgICAgcmV0dXJuIGVuY29kZVVSSUNvbXBvbmVudCh2YWx1ZSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmVzb2x2ZXIoKTtcbiAgICAgICAgfSk7XG4gICAgICB9XG5cblxuXG4gICAgICBsZXQgcGFyc2VkVXJsID0gdXJsLnBhcnNlKHJlcXVlc3RIb2xkZXIudXJsLCB0cnVlKTtcblxuICAgICAgcGFyc2VkVXJsLnF1ZXJ5ID0gcGFyc2VkVXJsLnF1ZXJ5IHx8IHt9O1xuXG4gICAgICBsZXQgbmV3UXMgPSBwYXJzZWRVcmwucXVlcnk7XG5cbiAgICAgIGlmICh0ZXN0LnJlcXVlc3QucXVlcnlQYXJhbWV0ZXJzKSB7XG4gICAgICAgIHRoYXQuZGVmZXJlZEl0KCdFbnN1cmUgcXVlcnlQYXJhbWV0ZXJzJykudGhlbihmdW5jdGlvbiAocmVzb2x2ZXIpIHtcbiAgICAgICAgICBpZiAoJ3NlYXJjaCcgaW4gcGFyc2VkVXJsKVxuICAgICAgICAgICAgZGVsZXRlIHBhcnNlZFVybC5zZWFyY2g7XG5cbiAgICAgICAgICBsZXQgcXNQYXJhbXMgPSBBVExIZWxwZXJzLmNsb25lT2JqZWN0VXNpbmdQb2ludGVycyh0ZXN0LnJlcXVlc3QucXVlcnlQYXJhbWV0ZXJzLCB0aGF0LmFzdC5vcHRpb25zLnZhcmlhYmxlcyk7XG5cbiAgICAgICAgICBmb3IgKGxldCBpIGluIHFzUGFyYW1zKSB7XG4gICAgICAgICAgICBuZXdRc1tpXSA9IHFzUGFyYW1zW2ldO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIHJlcXVlc3RIb2xkZXIuY3R4LlJFUVVFU1QucXVlcnlQYXJhbWV0ZXJzID0gcXNQYXJhbXM7XG5cbiAgICAgICAgICByZXF1ZXN0SG9sZGVyLnVybCA9IHVybC5mb3JtYXQocGFyc2VkVXJsKTtcblxuICAgICAgICAgIHJlc29sdmVyKCk7XG4gICAgICAgIH0pO1xuICAgICAgfVxuXG4gICAgICB0aGF0LmRlZmVyZWRJdCh0ZXN0Lm1ldGhvZC50b1VwcGVyQ2FzZSgpICsgJyAnICsgcmVxdWVzdEhvbGRlci51cmwsIHRlc3QudGltZW91dCkudGhlbihmdW5jdGlvbiAocmVzb2x2ZXIpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBsZXQgcmVxID0gcmVxdWVzdEhvbGRlci5yZXEgPSB0aGF0LmFzdC5hZ2VudFt0ZXN0Lm1ldGhvZC50b0xvd2VyQ2FzZSgpXShyZXF1ZXN0SG9sZGVyLnVybCk7XG5cbiAgICAgICAgICByZXF1ZXN0SG9sZGVyLmN0eC5SRVFVRVNULm1ldGhvZCA9IHRlc3QubWV0aG9kO1xuICAgICAgICAgIHJlcXVlc3RIb2xkZXIuY3R4LlJFUVVFU1QudXJsID0gcmVxdWVzdEhvbGRlci51cmw7XG5cbiAgICAgICAgICAvLyB3ZSBtdXN0IHNlbmQgc29tZSBkYXRhLi5cbiAgICAgICAgICBpZiAodGVzdC5yZXF1ZXN0KSB7XG4gICAgICAgICAgICBpZiAodGVzdC5yZXF1ZXN0LmhlYWRlcnMpIHtcbiAgICAgICAgICAgICAgcmVxdWVzdEhvbGRlci5jdHguUkVRVUVTVC5oZWFkZXJzID0ge307XG4gICAgICAgICAgICAgIGxldCBoZWFkZXJzID0gQVRMSGVscGVycy5jbG9uZU9iamVjdFVzaW5nUG9pbnRlcnModGVzdC5yZXF1ZXN0LmhlYWRlcnMsIHRoYXQuYXN0Lm9wdGlvbnMudmFyaWFibGVzKTtcbiAgICAgICAgICAgICAgZm9yIChsZXQgaCBpbiBoZWFkZXJzKSB7XG5cbiAgICAgICAgICAgICAgICByZXEuc2V0KGgsIGhlYWRlcnNbaF0gPT0gdW5kZWZpbmVkID8gJycgOiBoZWFkZXJzW2hdLnRvU3RyaW5nKCkpO1xuICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgdGVzdC5yZXF1ZXN0LmhlYWRlcnNbaF0gPT0gXCJvYmplY3RcIiAmJiB0ZXN0LnJlcXVlc3QuaGVhZGVyc1toXSBpbnN0YW5jZW9mIEFUTEhlbHBlcnMucG9pbnRlckxpYi5Qb2ludGVyICYmIHRlc3QucmVxdWVzdC5oZWFkZXJzW2hdLnBhdGguaW5kZXhPZihcIkVOVlwiKSA9PSAwKSB7XG4gICAgICAgICAgICAgICAgICByZXF1ZXN0SG9sZGVyLmN0eC5SRVFVRVNULmhlYWRlcnNbaF0gPSBcIihUQUtFTiBGUk9NIFwiICsgdGVzdC5yZXF1ZXN0LmhlYWRlcnNbaF0ucGF0aCArIFwiKVwiO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICByZXF1ZXN0SG9sZGVyLmN0eC5SRVFVRVNULmhlYWRlcnNbaF0gPSB0eXBlb2YgaGVhZGVyc1toXSAhPSBcInVuZGVmaW5lZFwiICYmIGhlYWRlcnNbaF0udG9TdHJpbmcoKSB8fCBoZWFkZXJzW2hdO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAodGVzdC5yZXF1ZXN0Lmpzb24pIHtcbiAgICAgICAgICAgICAgbGV0IGRhdGEgPSBBVExIZWxwZXJzLmNsb25lT2JqZWN0VXNpbmdQb2ludGVycyh0ZXN0LnJlcXVlc3QuanNvbiwgdGhhdC5hc3Qub3B0aW9ucy52YXJpYWJsZXMpO1xuICAgICAgICAgICAgICByZXF1ZXN0SG9sZGVyLmN0eC5SRVFVRVNULmJvZHkgPSBkYXRhO1xuICAgICAgICAgICAgICByZXEuc2VuZChkYXRhKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKHRlc3QucmVxdWVzdC5hdHRhY2gpIHtcbiAgICAgICAgICAgICAgLyogaXN0YW5idWwgaWdub3JlIGlmICovXG4gICAgICAgICAgICAgIGlmICghdGhhdC5wYXRoKSB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZXIoQVRMSGVscGVycy5lcnJvcihcImF0dGFjaCBpcyBub3QgYWxsb3dlZCB1c2luZyBSQVcgZGVmaW5pdGlvbnNcIiwgcmVxdWVzdEhvbGRlci5jdHgpKTtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICBmb3IgKGxldCBpIGluIHRlc3QucmVxdWVzdC5hdHRhY2gpIHtcbiAgICAgICAgICAgICAgICBsZXQgY3VycmVudEF0dGFjaG1lbnQgPSB0ZXN0LnJlcXVlc3QuYXR0YWNoW2ldO1xuICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICByZXEuYXR0YWNoKGN1cnJlbnRBdHRhY2htZW50LmtleSwgcGF0aC5yZXNvbHZlKHRoYXQucGF0aCwgY3VycmVudEF0dGFjaG1lbnQudmFsdWUpKTtcbiAgICAgICAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICAgICAgICByZXNvbHZlcihlKTtcbiAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKHRlc3QucmVxdWVzdC5mb3JtKSB7XG4gICAgICAgICAgICAgIHJlcS50eXBlKCdmb3JtJyk7XG5cbiAgICAgICAgICAgICAgZm9yIChsZXQgaSBpbiB0ZXN0LnJlcXVlc3QuZm9ybSkge1xuICAgICAgICAgICAgICAgIGxldCBjdXJyZW50QXR0YWNobWVudCA9IEFUTEhlbHBlcnMuY2xvbmVPYmplY3RVc2luZ1BvaW50ZXJzKHRlc3QucmVxdWVzdC5mb3JtW2ldLCB0aGF0LmFzdC5vcHRpb25zLnZhcmlhYmxlcyk7XG4gICAgICAgICAgICAgICAgcmVxLmZpZWxkKGN1cnJlbnRBdHRhY2htZW50LmtleSwgY3VycmVudEF0dGFjaG1lbnQudmFsdWUpO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmICh0ZXN0LnJlcXVlc3QudXJsZW5jb2RlZCkge1xuICAgICAgICAgICAgICByZXEuc2VuZChBVExIZWxwZXJzLmNsb25lT2JqZWN0VXNpbmdQb2ludGVycyh0ZXN0LnJlcXVlc3QudXJsZW5jb2RlZCwgdGhhdC5hc3Qub3B0aW9ucy52YXJpYWJsZXMpKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG5cbiAgICAgICAgICByZXEuZW5kKGZ1bmN0aW9uIChlcnIsIHJlcykge1xuICAgICAgICAgICAgcmVxdWVzdEhvbGRlci5yZXMgPSByZXM7XG4gICAgICAgICAgICByZXF1ZXN0SG9sZGVyLmN0eC5SRVNQT05TRSA9IHJlcztcbiAgICAgICAgICAgIC8qIGlzdGFuYnVsIGlnbm9yZSBpZjogdW50ZXN0YWJsZSAqL1xuICAgICAgICAgICAgaWYgKGVyciAmJiBlcnIgaW5zdGFuY2VvZiBFcnJvcikge1xuICAgICAgICAgICAgICBlcnIgPSBBVExIZWxwZXJzLmVycm9yKGVyci5tZXNzYWdlLCByZXF1ZXN0SG9sZGVyLmN0eCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJlc29sdmVyKGVycik7XG5cbiAgICAgICAgICAgIGlmICghZXJyKSB7XG4gICAgICAgICAgICAgIHRoYXQucmVnaXN0ZXJUZXN0UmVzdWx0KHRlc3QsIHtcbiAgICAgICAgICAgICAgICByZXEsXG4gICAgICAgICAgICAgICAgcmVzLFxuICAgICAgICAgICAgICAgIHRlc3QsXG4gICAgICAgICAgICAgICAgdXJsOiByZXF1ZXN0SG9sZGVyLnVybFxuICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdGVzdC5yZXNvbHZlKHJlcywgZXJyKTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgIHJlc29sdmVyKGUpO1xuICAgICAgICB9XG4gICAgICB9KTtcblxuXG4gICAgICBleGVjRm4oXCJWYWxpZGF0ZSByZXNwb25zZVwiLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGlmICh0ZXN0LnJlc3BvbnNlKSB7XG4gICAgICAgICAgaWYgKHRlc3QucmVzcG9uc2Uuc3RhdHVzKSB7XG4gICAgICAgICAgICB0aGF0LmRlZmVyZWRJdChcInJlc3BvbnNlLnN0YXR1cyA9PSBcIiArIHRlc3QucmVzcG9uc2Uuc3RhdHVzLCB0ZXN0LnRpbWVvdXQpLnRoZW4ocmVzb2x2ZXIgPT4ge1xuICAgICAgICAgICAgICAvKiBpc3RhbmJ1bCBpZ25vcmUgZWxzZSAqL1xuICAgICAgICAgICAgICBpZiAocmVxdWVzdEhvbGRlci5yZXMuc3RhdHVzID09IHRlc3QucmVzcG9uc2Uuc3RhdHVzKVxuICAgICAgICAgICAgICAgIHJlc29sdmVyKCk7XG4gICAgICAgICAgICAgIGVsc2VcbiAgICAgICAgICAgICAgICByZXNvbHZlcihBVExIZWxwZXJzLmVycm9yKCdleHBlY3RlZCBzdGF0dXMgY29kZSAnICsgdGVzdC5yZXNwb25zZS5zdGF0dXMgKyAnIGdvdCAnICsgcmVxdWVzdEhvbGRlci5yZXMuc3RhdHVzLCByZXF1ZXN0SG9sZGVyLmN0eCkpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgaWYgKHRlc3QucmVzcG9uc2UuYm9keSkge1xuICAgICAgICAgICAgaWYgKCdpcycgaW4gdGVzdC5yZXNwb25zZS5ib2R5KSB7XG4gICAgICAgICAgICAgIHRoYXQuZGVmZXJlZEl0KFwicmVzcG9uc2UuYm9keVwiLCB0ZXN0LnRpbWVvdXQpLnRoZW4ocmVzb2x2ZXIgPT4ge1xuICAgICAgICAgICAgICAgIGxldCBib2R5RXF1YWxzID0gQVRMSGVscGVycy5jbG9uZU9iamVjdFVzaW5nUG9pbnRlcnModGVzdC5yZXNwb25zZS5ib2R5LmlzLCB0aGF0LmFzdC5vcHRpb25zLnZhcmlhYmxlcyk7XG5cbiAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgaWYgKHRlc3QucmVzcG9uc2UuYm9keS5pcyAmJiB0eXBlb2YgdGVzdC5yZXNwb25zZS5ib2R5LmlzID09IFwib2JqZWN0XCIgJiYgdGVzdC5yZXNwb25zZS5ib2R5LmlzIGluc3RhbmNlb2YgUmVnRXhwKSB7XG4gICAgICAgICAgICAgICAgICAgIC8qIGlzdGFuYnVsIGlnbm9yZSBpZiAqL1xuICAgICAgICAgICAgICAgICAgICBpZiAoIXRlc3QucmVzcG9uc2UuYm9keS5pcy50ZXN0KHJlcXVlc3RIb2xkZXIucmVzLnRleHQpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgbGV0IGEgPSB1dGlsLmluc3BlY3QoYm9keUVxdWFscyk7XG4gICAgICAgICAgICAgICAgICAgICAgbGV0IGIgPSB1dGlsLmluc3BlY3QodGVzdC5yZXNwb25zZS5ib2R5LmlzKTtcbiAgICAgICAgICAgICAgICAgICAgICByZXNvbHZlcihBVExIZWxwZXJzLmVycm9yKCdleHBlY3RlZCByZXNwb25zZS5ib2R5IHRvIG1hdGNoICcgKyBhICsgJyByZXNwb25zZSBib2R5LCBnb3QgJyArIGIsIHJlcXVlc3RIb2xkZXIuY3R4KSk7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZXIoKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgbGV0IHRha2VuQm9keTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHR5cGVvZiB0ZXN0LnJlc3BvbnNlLmJvZHkuaXMgPT0gXCJzdHJpbmdcIikge1xuICAgICAgICAgICAgICAgICAgICAgIHRha2VuQm9keSA9IHJlcXVlc3RIb2xkZXIucmVzLnRleHQ7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgdGFrZW5Cb2R5ID0gcmVxdWVzdEhvbGRlci5yZXMuYm9keTtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIC8qIGlzdGFuYnVsIGlnbm9yZSBpZiAqL1xuICAgICAgICAgICAgICAgICAgICBpZiAoIV8uaXNFcXVhbChib2R5RXF1YWxzLCB0YWtlbkJvZHkpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgbGV0IGEgPSB1dGlsLmluc3BlY3QoYm9keUVxdWFscyk7XG4gICAgICAgICAgICAgICAgICAgICAgbGV0IGIgPSB1dGlsLmluc3BlY3QodGFrZW5Cb2R5KTtcbiAgICAgICAgICAgICAgICAgICAgICByZXNvbHZlcihBVExIZWxwZXJzLmVycm9yRGlmZignZXhwZWN0ZWQgJyArIGEgKyAnIHJlc3BvbnNlIGJvZHksIGdvdCAnICsgYiwgYm9keUVxdWFscywgdGFrZW5Cb2R5LCByZXF1ZXN0SG9sZGVyLmN0eCkpO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgIHJlc29sdmVyKCk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICAgICAgICByZXNvbHZlcihlKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAodGVzdC5yZXNwb25zZS5ib2R5LnNjaGVtYSkge1xuICAgICAgICAgICAgICBsZXQgdiA9IHRoYXQub2J0YWluU2NoZW1hVmFsaWRhdG9yKHRlc3QucmVzcG9uc2UuYm9keS5zY2hlbWEpO1xuXG4gICAgICAgICAgICAgIHRoYXQuZGVmZXJlZEl0KFwicmVzcG9uc2UuYm9keSBzY2hlbWFcIiwgdGVzdC50aW1lb3V0KS50aGVuKHJlc29sdmVyID0+IHtcbiAgICAgICAgICAgICAgICBsZXQgdmFsaWRhdGlvblJlc3VsdCA9IHYocmVxdWVzdEhvbGRlci5yZXMuYm9keSk7XG4gICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgIGlmICh2YWxpZGF0aW9uUmVzdWx0LnZhbGlkKSB7XG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmVyKCk7XG4gICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBsZXQgZXJyb3JzID0gW1wiU2NoZW1hIGVycm9yOlwiXTtcbiAgICAgICAgICAgICAgICAgICAgdmFsaWRhdGlvblJlc3VsdC5lcnJvcnMgJiYgdmFsaWRhdGlvblJlc3VsdC5lcnJvcnMuZm9yRWFjaCh4ID0+IGVycm9ycy5wdXNoKFwiICBcIiArIHguc3RhY2spKTtcblxuICAgICAgICAgICAgICAgICAgICByZXNvbHZlcihBVExIZWxwZXJzLmVycm9yKGVycm9ycy5qb2luKCdcXG4nKSB8fCBcIkludmFsaWQgc2NoZW1hXCIsIHJlcXVlc3RIb2xkZXIuY3R4KSk7XG4gICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgICAgICAgcmVzb2x2ZXIoZSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKHRlc3QucmVzcG9uc2UuYm9keS5tYXRjaGVzKSB7XG4gICAgICAgICAgICAgIHRlc3QucmVzcG9uc2UuYm9keS5tYXRjaGVzLmZvckVhY2goa3ZvID0+IHtcbiAgICAgICAgICAgICAgICB0aGF0LmRlZmVyZWRJdChcInJlc3BvbnNlLmJvZHk6OlwiICsga3ZvLmtleSwgdGVzdC50aW1lb3V0KS50aGVuKHJlc29sdmVyID0+IHtcbiAgICAgICAgICAgICAgICAgIGxldCB2YWx1ZTogYW55ID0gQVRMSGVscGVycy5jbG9uZU9iamVjdFVzaW5nUG9pbnRlcnMoa3ZvLnZhbHVlLCB0aGF0LmFzdC5vcHRpb25zLnZhcmlhYmxlcyk7XG5cbiAgICAgICAgICAgICAgICAgIGxldCByZWFkZWQgPSBfLmdldChyZXF1ZXN0SG9sZGVyLnJlcy5ib2R5LCBrdm8ua2V5KTtcblxuICAgICAgICAgICAgICAgICAgLyogaXN0YW5idWwgaWdub3JlIGlmICovXG4gICAgICAgICAgICAgICAgICBpZiAoXG4gICAgICAgICAgICAgICAgICAgICghKHZhbHVlIGluc3RhbmNlb2YgUmVnRXhwKSAmJiAhXy5pc0VxdWFsKHJlYWRlZCwgdmFsdWUpKVxuICAgICAgICAgICAgICAgICAgICB8fFxuICAgICAgICAgICAgICAgICAgICAoKHZhbHVlIGluc3RhbmNlb2YgUmVnRXhwKSAmJiAhdmFsdWUudGVzdChyZWFkZWQpKVxuICAgICAgICAgICAgICAgICAgKSB7XG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmVyKEFUTEhlbHBlcnMuZXJyb3JEaWZmKCdleHBlY3RlZCByZXNwb25zZS5ib2R5OjonICsga3ZvLmtleSArICcgdG8gYmUgJyArIHV0aWwuaW5zcGVjdCh2YWx1ZSkgKyAnIGdvdCAnICsgdXRpbC5pbnNwZWN0KHJlYWRlZCksIHZhbHVlLCByZWFkZWQsIHJlcXVlc3RIb2xkZXIuY3R4KSk7XG4gICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICByZXNvbHZlcigpO1xuICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAodGVzdC5yZXNwb25zZS5ib2R5LnRha2UpIHtcbiAgICAgICAgICAgICAgbGV0IHRha2UgPSB0ZXN0LnJlc3BvbnNlLmJvZHkudGFrZTtcblxuICAgICAgICAgICAgICB0YWtlLmZvckVhY2goZnVuY3Rpb24gKHRha2VuRWxlbWVudCkge1xuICAgICAgICAgICAgICAgIHRoYXQuZGVmZXJlZEl0KFwicmVzcG9uc2UuYm9keTo6XCIgKyB0YWtlbkVsZW1lbnQua2V5ICsgXCIgPj4gISF2YXJpYWJsZXMgXCIgKyB0YWtlbkVsZW1lbnQudmFsdWUucGF0aCwgdGVzdC50aW1lb3V0KS50aGVuKHJlc29sdmVyID0+IHtcbiAgICAgICAgICAgICAgICAgIGxldCB0YWtlblZhbHVlID0gXy5nZXQocmVxdWVzdEhvbGRlci5yZXMuYm9keSwgdGFrZW5FbGVtZW50LmtleSk7XG4gICAgICAgICAgICAgICAgICB0YWtlbkVsZW1lbnQudmFsdWUuc2V0KHRoYXQuYXN0Lm9wdGlvbnMudmFyaWFibGVzLCB0YWtlblZhbHVlKTtcbiAgICAgICAgICAgICAgICAgIHJlc29sdmVyKCk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAodGVzdC5yZXNwb25zZS5ib2R5LmNvcHlUbyAmJiB0ZXN0LnJlc3BvbnNlLmJvZHkuY29weVRvIGluc3RhbmNlb2YgQVRMSGVscGVycy5wb2ludGVyTGliLlBvaW50ZXIpIHtcbiAgICAgICAgICAgICAgdGhhdC5kZWZlcmVkSXQoXCJyZXNwb25zZS5ib2R5ID4+ICEhdmFyaWFibGVzIFwiICsgdGVzdC5yZXNwb25zZS5ib2R5LmNvcHlUby5wYXRoLCB0ZXN0LnRpbWVvdXQpLnRoZW4ocmVzb2x2ZXIgPT4ge1xuICAgICAgICAgICAgICAgIHRlc3QucmVzcG9uc2UuYm9keS5jb3B5VG8uc2V0KHRoYXQuYXN0Lm9wdGlvbnMudmFyaWFibGVzLCByZXF1ZXN0SG9sZGVyLnJlcy5ib2R5KTtcbiAgICAgICAgICAgICAgICByZXNvbHZlcigpO1xuICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKHRlc3QucmVzcG9uc2UuaGVhZGVycykge1xuICAgICAgICAgICAgICBsZXQgaGVhZGVycyA9IEFUTEhlbHBlcnMuY2xvbmVPYmplY3RVc2luZ1BvaW50ZXJzKHRlc3QucmVzcG9uc2UuaGVhZGVycywgdGhhdC5vcHRpb25zLnZhcmlhYmxlcyk7XG5cbiAgICAgICAgICAgICAgZm9yIChsZXQgaCBpbiBoZWFkZXJzKSB7XG4gICAgICAgICAgICAgICAgaWYgKGggIT09ICdjb250ZW50LXR5cGUnKSB7XG4gICAgICAgICAgICAgICAgICBoZWFkZXJzW2hdID0gaGVhZGVyc1toXS50b1N0cmluZygpO1xuXG4gICAgICAgICAgICAgICAgICB0aGF0LmRlZmVyZWRJdChcInJlc3BvbnNlLmhlYWRlcjo6XCIgKyBoLCB0ZXN0LnRpbWVvdXQpLnRoZW4ocmVzb2x2ZSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGxldCB2YWx1ZSA9IHJlcXVlc3RIb2xkZXIucmVzLmdldChoLnRvTG93ZXJDYXNlKCkpO1xuXG4gICAgICAgICAgICAgICAgICAgIC8qIGlzdGFuYnVsIGlnbm9yZSBpZiAqL1xuICAgICAgICAgICAgICAgICAgICBpZiAoaGVhZGVyc1toXSAhPSB2YWx1ZSkge1xuICAgICAgICAgICAgICAgICAgICAgIGxldCBhID0gdXRpbC5pbnNwZWN0KGhlYWRlcnNbaF0pO1xuICAgICAgICAgICAgICAgICAgICAgIGxldCBiID0gdXRpbC5pbnNwZWN0KHZhbHVlKTtcbiAgICAgICAgICAgICAgICAgICAgICByZXNvbHZlKEFUTEhlbHBlcnMuZXJyb3JEaWZmKCdleHBlY3RlZCByZXNwb25zZS5oZWFkZXI6OicgKyBoICsgJyB0byBiZSAnICsgYSArICcgZ290ICcgKyBiLCBoZWFkZXJzW2hdLCB2YWx1ZSwgcmVxdWVzdEhvbGRlci5jdHgpKTtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICByZXNvbHZlKCk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgfVxuXG4gIGRlZmVyZWRJdChuYW1lOiBzdHJpbmcsIHRpbWVvdXQ/OiBudW1iZXIpOiBQcm9taXNlPChlcnI/KSA9PiB2b2lkPiB7XG4gICAgbGV0IGZpbGwgPSBudWxsO1xuXG4gICAgbGV0IHByb20gPSBBVExIZWxwZXJzLmZsYXRQcm9taXNlKCk7XG5cbiAgICB0aGlzLml0KG5hbWUsIGZ1bmN0aW9uIChkb25lKSB7XG4gICAgICBpZiAodGltZW91dClcbiAgICAgICAgdGhpcy50aW1lb3V0KHRpbWVvdXQpO1xuXG4gICAgICBwcm9tLnJlc29sdmVyLmNhbGwodGhpcywgZnVuY3Rpb24gKHJldCkge1xuICAgICAgICAvKiBpc3RhbmJ1bCBpZ25vcmUgaWYgKi9cbiAgICAgICAgaWYgKHJldCkge1xuICAgICAgICAgIGlmIChkb25lLmZhaWwpXG4gICAgICAgICAgICBkb25lLmZhaWwocmV0KTtcbiAgICAgICAgICBlbHNlXG4gICAgICAgICAgICBkb25lKHJldCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgZG9uZSgpO1xuICAgICAgICB9XG4gICAgICB9KTtcblxuICAgICAgcHJvbS5wcm9taXNlLmNhdGNoKGRvbmUpO1xuICAgIH0pO1xuXG4gICAgcmV0dXJuIHByb20ucHJvbWlzZTtcbiAgfVxuXG4gIGNvdmVyYWdlRGF0YTogQVRMSGVscGVycy5JRGljdGlvbmFyeTx7XG4gICAgc291cmNlOiBBcnJheTxudW1iZXIgfCB2b2lkPjtcbiAgfT4gPSB7fTtcblxuICB3cml0ZUNvdmVyYWdlKGNvdmVyRmlsZTogc3RyaW5nKSB7XG4gICAgbGV0IGN3ZCA9IHBhdGguZGlybmFtZShjb3ZlckZpbGUpO1xuXG4gICAgaWYgKHRoaXMuY292ZXJhZ2VEYXRhICYmIE9iamVjdC5rZXlzKHRoaXMuY292ZXJhZ2VEYXRhKS5sZW5ndGgpIHtcbiAgICAgIGNvbnNvbGUuaW5mbyhcIldyaXRpbmcgY292ZXJhZ2UgaW5mb3JtYXRpb246IFwiICsgY292ZXJGaWxlKTtcblxuICAgICAgbGV0IGNvdmVyYWdlID0gJyc7XG5cbiAgICAgIHRyeSB7XG4gICAgICAgIGZzLm1rZGlyU3luYyhjd2QpO1xuICAgICAgfSBjYXRjaCAoZSkgeyB9XG5cbiAgICAgIHRyeSB7XG4gICAgICAgIGNvdmVyYWdlID0gZnMucmVhZEZpbGVTeW5jKGNvdmVyRmlsZSkudG9TdHJpbmcoKTtcbiAgICAgIH0gY2F0Y2ggKGUpIHtcblxuICAgICAgfVxuXG4gICAgICBpZiAoY292ZXJhZ2UubGVuZ3RoKSBjb3ZlcmFnZSA9IGNvdmVyYWdlICsgJ1xcbic7XG5cbiAgICAgIGNvdmVyYWdlID1cbiAgICAgICAgY292ZXJhZ2UgKz0gT2JqZWN0LmtleXModGhpcy5jb3ZlcmFnZURhdGEpXG4gICAgICAgICAgLmZpbHRlcih4ID0+ICEheClcbiAgICAgICAgICAubWFwKChmaWxlKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gY292ZXJhZ2VUb1N0cmluZyhmaWxlLCB0aGlzLmNvdmVyYWdlRGF0YVtmaWxlXSBhcyBhbnkpO1xuICAgICAgICAgIH0pLmpvaW4oJ1xcbicpO1xuXG4gICAgICBmcy53cml0ZUZpbGVTeW5jKGNvdmVyRmlsZSwgY292ZXJhZ2UpO1xuXG4gICAgICBjb25zb2xlLmluZm8oXCJXcml0aW5nIGNvdmVyYWdlIGluZm9ybWF0aW9uLiBPSyFcIik7XG4gICAgfVxuICB9XG59XG5cbmZ1bmN0aW9uIGdlbmVyYXRlTW9jaGFUZXN0KHRlc3Q6IEFUTEhlbHBlcnMuQVRMVGVzdCkge1xuXG4gIGxldCBleGVjRm4gPSB0ZXN0LnNraXBcbiAgICA/IGRlc2NyaWJlLnNraXBcbiAgICA6IGRlc2NyaWJlO1xuXG4gIGV4ZWNGbih0ZXN0LmRlc2NyaXB0aW9uIHx8ICh0ZXN0Lm1ldGhvZC50b1VwcGVyQ2FzZSgpICsgJyAnICsgdGVzdC51cmkpLCBmdW5jdGlvbiAoKSB7XG4gICAgaXQodGVzdC5tZXRob2QudG9VcHBlckNhc2UoKSArICcgJyArIHRlc3QudXJpLCBmdW5jdGlvbiAoZG9uZSkge1xuICAgICAgdGVzdFxuICAgICAgICAucmVxdWVzdGVyXG4gICAgICAgIC5wcm9taXNlXG4gICAgICAgIC50aGVuKHJlc3BvbnNlID0+IHtcbiAgICAgICAgICBkb25lKCk7XG4gICAgICAgIH0pXG4gICAgICAgIC5jYXRjaChlcnIgPT4ge1xuICAgICAgICAgIGNvbnNvbGUuZXJyb3IodXRpbC5pbnNwZWN0KGVycikpO1xuICAgICAgICAgIGRvbmUoZXJyKTtcbiAgICAgICAgfSk7XG4gICAgfSk7XG5cblxuICAgIHRlc3QuYXNzZXJ0aW9ucy5mb3JFYWNoKHggPT4ge1xuICAgICAgaXQoeC5uYW1lLCBmdW5jdGlvbiAoZG9uZSkge1xuICAgICAgICB4LnByb21pc2VcbiAgICAgICAgICAudGhlbihlcnIgPT4ge1xuICAgICAgICAgICAgaWYgKGVycikge1xuICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKHV0aWwuaW5zcGVjdChlcnIpKTtcbiAgICAgICAgICAgICAgZG9uZShlcnIpO1xuICAgICAgICAgICAgfSBlbHNlXG4gICAgICAgICAgICAgIGRvbmUoKTtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC5jYXRjaChlcnIgPT4ge1xuICAgICAgICAgICAgY29uc29sZS5lcnJvcih1dGlsLmluc3BlY3QoZXJyKSk7XG4gICAgICAgICAgICBkb25lKGVycik7XG4gICAgICAgICAgfSk7XG4gICAgICB9KTtcbiAgICB9KTtcbiAgfSk7XG59Il19