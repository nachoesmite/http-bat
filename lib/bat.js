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
        var parsed = jsYaml.load(content, {
            schema: ATLHelpers.pointerLib.createSchema()
        });
        this.ast.fromObject(parsed);
        this.updateState();
        this._loaded();
    };
    Bat.prototype.run = function (app) {
        var _this = this;
        this.describe(this.file || 'http-bat', function () {
            if (_this.ast.options.selfSignedCert) {
                _this.it('Allowing self signed server certificates', function (done) {
                    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
                    done();
                });
            }
            _this.it('Ensure baseUri', function (done) {
                if (_this.options.baseUri == 'default')
                    delete _this.options.baseUri;
                if (!app || app === "default" || app === '') {
                    app = _this.options.baseUri || _this.ast.options.baseUri;
                }
                if (!app) {
                    done(new Error("baseUri not specified"));
                    return;
                }
                if (typeof app === 'string' && app.substr(-1) === '/') {
                    app = app.substr(0, app.length - 1);
                }
                _this.agent = request.agent(app);
                done();
            });
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
        });
    };
    Bat.prototype.ensureRamlCoverage = function () {
        var _this = this;
        if (this.ast.raml) {
            this.describe("RAML Coverage", function (done) {
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
        if (suite.test) {
            this.runTest(suite.test);
        }
        var that = this;
        if (suite.suites && Object.keys(suite.suites).length) {
            execFn(suite.name, function (mochaSuite) {
                for (var k in suite.suites) {
                    var s = suite.suites[k];
                    that.runSuite(s);
                }
            });
        }
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
                    var req_1 = requestHolder.req = that.agent[test.method.toLowerCase()](requestHolder.url);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYmF0LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiYmF0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQSxPQUFPO0FBQ1AsSUFBTyxFQUFFLFdBQVcsSUFBSSxDQUFDLENBQUM7QUFDMUIsSUFBTyxJQUFJLFdBQVcsTUFBTSxDQUFDLENBQUM7QUFDOUIsSUFBTyxHQUFHLFdBQVcsS0FBSyxDQUFDLENBQUM7QUFDNUIsSUFBTyxJQUFJLFdBQVcsTUFBTSxDQUFDLENBQUM7QUFFOUIsTUFBTTtBQUNOLElBQU8sTUFBTSxXQUFXLFNBQVMsQ0FBQyxDQUFDO0FBQ25DLElBQU8sQ0FBQyxXQUFXLFFBQVEsQ0FBQyxDQUFDO0FBQzdCLElBQU8sT0FBTyxXQUFXLFdBQVcsQ0FBQyxDQUFDO0FBR3RDLElBQU0sVUFBVSxHQUFHLE9BQU8sQ0FBQyxZQUFZLENBQUMsQ0FBQztBQUN6QyxJQUFNLFNBQVMsR0FBRyxPQUFPLENBQUMsaUJBQWlCLENBQUMsQ0FBQztBQUU3QyxTQUFTO0FBQ1QsSUFBTyxHQUFHLFdBQVcsT0FBTyxDQUFDLENBQUM7QUFDOUIsSUFBTyxVQUFVLFdBQVcsY0FBYyxDQUFDLENBQUM7QUFDNUMsSUFBTyxRQUFRLFdBQVcsWUFBWSxDQUFDLENBQUM7QUFDeEMscUNBQW1ELDZCQUE2QixDQUFDLENBQUE7QUFXakY7SUFpQkUsYUFBbUIsT0FBeUI7UUFqQjlDLGlCQW9uQkM7UUFubUJhLHVCQUFnQyxHQUFoQyxZQUFnQztRQUF6QixZQUFPLEdBQVAsT0FBTyxDQUFrQjtRQUw1QyxhQUFRLEdBQVEsUUFBUSxDQUFDO1FBQ3pCLE9BQUUsR0FBUSxFQUFFLENBQUM7UUFFYixxQkFBZ0IsR0FBZ0MsRUFBRSxDQUFDO1FBaWtCbkQsaUJBQVksR0FFUCxFQUFFLENBQUM7UUFoa0JOLElBQUksQ0FBQyxHQUFHLEdBQUcsSUFBSSxHQUFHLENBQUMsR0FBRyxFQUFFLENBQUM7UUFFekIsSUFBSSxNQUFNLEdBQUcsVUFBVSxDQUFDLFdBQVcsRUFB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QUcsQ0FBQyxDQUFDO1lBQ3BCLENBQUU7WUFBQSxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUVmLElBQUksQ0FBQztnQkFDSCxRQUFRLEdBQUcsRUFBRSxDQUFDLFlBQVksQ0FBQyxTQUFTLENBQUMsQ0FBQyxRQUFRLEVBQUUsQ0FBQztZQUNuRCxDQUFFO1lBQUEsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUViLENBQUM7WUFFRCxFQUFFLENBQUMsQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDO2dCQUFDLFFBQVEsR0FBRyxRQUFRLEdBQUcsSUFBSSxDQUFDO1lBRWhELFFBQVE7Z0JBQ04sUUFBUSxJQUFJLE1BQU0sQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQztxQkFDdkMsTUFBTSxDQUFDLFVBQUEsQ0FBQyxJQUFJLE9BQUEsQ0FBQyxDQUFDLENBQUMsRUFBSCxDQUFHLENBQUM7cUJBQ2hCLEdBQUcsQ0FBQyxVQUFDLElBQUk7b0JBQ1IsTUFBTSxDQUFDLHFDQUFnQixDQUFDLElBQUksRUFBRSxLQUFJLENBQUMsWUFBWSxDQUFDLElBQUksQ0FBUSxDQUFDLENBQUM7Z0JBQ2hFLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUVsQixFQUFFLENBQUMsYUFBYSxDQUFDLFNBQVMsRUFBRSxRQUFRLENBQUMsQ0FBQztZQUV0QyxPQUFPLENBQUMsSUFBSSxDQUFDLG1DQUFtQyxDQUFDLENBQUM7UUFDcEQsQ0FBQztJQUNILENBQUM7SUFDSCxVQUFDO0FBQUQsQ0FBQyxBQXBuQkQsSUFvbkJDO0FBcG5CWSxXQUFHLE1Bb25CZixDQUFBIiwic291cmNlc0NvbnRlbnQiOlsiLy8gTm9kZVxuaW1wb3J0IGZzID0gcmVxdWlyZSgnZnMnKTtcbmltcG9ydCBwYXRoID0gcmVxdWlyZSgncGF0aCcpO1xuaW1wb3J0IHVybCA9IHJlcXVpcmUoJ3VybCcpO1xuaW1wb3J0IHV0aWwgPSByZXF1aXJlKCd1dGlsJyk7XG5cbi8vIE5QTVxuaW1wb3J0IGpzWWFtbCA9IHJlcXVpcmUoJ2pzLXlhbWwnKTtcbmltcG9ydCBfID0gcmVxdWlyZSgnbG9kYXNoJyk7XG5pbXBvcnQgcmVxdWVzdCA9IHJlcXVpcmUoJ3N1cGVydGVzdCcpO1xuaW1wb3J0IGV4cGVjdCA9IHJlcXVpcmUoJ2V4cGVjdCcpO1xuaW1wb3J0IFJBTUwgPSByZXF1aXJlKCdyYW1sLTEtcGFyc2VyJyk7XG5jb25zdCBqc29uc2NoZW1hID0gcmVxdWlyZSgnanNvbnNjaGVtYScpO1xuY29uc3QgcGF0aE1hdGNoID0gcmVxdWlyZSgncmFtbC1wYXRoLW1hdGNoJyk7XG5cbi8vIExvY2Fsc1xuaW1wb3J0IEFUTCA9IHJlcXVpcmUoJy4vQVRMJyk7XG5pbXBvcnQgQVRMSGVscGVycyA9IHJlcXVpcmUoJy4vQVRMSGVscGVycycpO1xuaW1wb3J0IENvdmVyYWdlID0gcmVxdWlyZSgnLi9Db3ZlcmFnZScpO1xuaW1wb3J0IHsgZ2VuZXJhdGVTdHJpbmcgYXMgY292ZXJhZ2VUb1N0cmluZyB9IGZyb20gJy4uL2xpYi9SQU1MQ292ZXJhZ2VSZXBvcnRlcic7XG5cblxuXG5leHBvcnQgaW50ZXJmYWNlIElCYXRPcHRpb25zIHtcbiAgYmFzZVVyaT86IHN0cmluZztcbiAgdmFyaWFibGVzPzogQVRMSGVscGVycy5JRGljdGlvbmFyeTxhbnk+O1xuICBmaWxlPzogc3RyaW5nO1xuICByYXc/OiBzdHJpbmc7XG59XG5cbmV4cG9ydCBjbGFzcyBCYXQge1xuICBwYXRoOiBzdHJpbmc7XG4gIGZpbGU6IHN0cmluZztcblxuICBhc3Q6IEFUTC5BVEw7XG5cbiAgYWdlbnQ6IHJlcXVlc3QuU3VwZXJUZXN0O1xuXG4gIHByaXZhdGUgX2xvYWRlZDogRnVuY3Rpb247XG4gIHByaXZhdGUgX2xvYWRlZEZhaWxlZDogRnVuY3Rpb247XG4gIGxvYWRlclNlbWFwaG9yZTogUHJvbWlzZTxhbnk+O1xuXG4gIGRlc2NyaWJlOiBhbnkgPSBkZXNjcmliZTtcbiAgaXQ6IGFueSA9IGl0O1xuXG4gIGNvdmVyYWdlRWxlbWVudHM6IENvdmVyYWdlLkNvdmVyYWdlUmVzb3VyY2VbXSA9IFtdO1xuXG4gIGNvbnN0cnVjdG9yKHB1YmxpYyBvcHRpb25zOiBJQmF0T3B0aW9ucyA9IHt9KSB7XG4gICAgdGhpcy5hc3QgPSBuZXcgQVRMLkFUTCgpO1xuXG4gICAgbGV0IGdvdEFTVCA9IEFUTEhlbHBlcnMuZmxhdFByb21pc2UoKTtcblxuICAgIHRoaXMubG9hZGVyU2VtYXBob3JlID0gZ290QVNULnByb21pc2U7XG4gICAgdGhpcy5fbG9hZGVkID0gZ290QVNULnJlc29sdmVyO1xuICAgIHRoaXMuX2xvYWRlZEZhaWxlZCA9IGdvdEFTVC5yZWplY3RlcjtcblxuICAgIGlmIChvcHRpb25zLnJhdykge1xuICAgICAgdGhpcy5yYXcob3B0aW9ucy5yYXcpO1xuICAgIH0gZWxzZSBpZiAodGhpcy5vcHRpb25zLmZpbGUpIHtcbiAgICAgIHRoaXMubG9hZChvcHRpb25zLmZpbGUpO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aGlzLmNoZWNrTW9jaGFDb250ZXh0KClcbiAgICAgICAgLnRoZW4oKCkgPT4gdGhpcy5ydW4oKSk7XG4gICAgfVxuICB9XG5cbiAgY2hlY2tNb2NoYUNvbnRleHQoKSB7XG5cbiAgICBsZXQgZ290Q29udGV4dCA9IEFUTEhlbHBlcnMuZmxhdFByb21pc2UoKTtcblxuICAgIHRoaXMuZGVzY3JpYmUoJ0NoZWNraW5nIG1vY2hhIGNvbnRleHQnLCBmdW5jdGlvbiAoKSB7XG4gICAgICBnb3RDb250ZXh0LnJlc29sdmVyKHRoaXMuY3R4KTtcbiAgICB9KTtcblxuICAgIC8vIGNoZWNrIGZvciBjb250ZXh0IGNvbmZpZ3VyYXRpb25zXG4gICAgcmV0dXJuIGdvdENvbnRleHQucHJvbWlzZS50aGVuKGN0eCA9PiB7XG4gICAgICBpZiAoY3R4KSB7XG4gICAgICAgIGN0eCA9IGN0eC5jb25maWcgfHwgY3R4O1xuXG4gICAgICAgIGlmIChjdHguYmF0RmlsZSkge1xuICAgICAgICAgIHRoaXMubG9hZChjdHguYmF0RmlsZSk7XG4gICAgICAgIH0gZWxzZSBpZiAoY3R4LnJhd0JhdCkge1xuICAgICAgICAgIHRoaXMucmF3KGN0eC5yYXdCYXQpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGN0eC5iYXNlVXJpKSB7XG4gICAgICAgICAgdGhpcy5vcHRpb25zLmJhc2VVcmkgPSBjdHguYmFzZVVyaTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChjdHgudmFyaWFibGVzKSB7XG4gICAgICAgICAgdGhpcy5vcHRpb25zLnZhcmlhYmxlcyA9IHRoaXMub3B0aW9ucy52YXJpYWJsZXMgfHwge307XG4gICAgICAgICAgXy5tZXJnZSh0aGlzLm9wdGlvbnMudmFyaWFibGVzLCBjdHgudmFyaWFibGVzKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0pO1xuICB9XG5cbiAgcHJpdmF0ZSB1cGRhdGVTdGF0ZSgpIHtcbiAgICBpZiAodGhpcy5vcHRpb25zLnZhcmlhYmxlcykge1xuICAgICAgXy5tZXJnZSh0aGlzLmFzdC5vcHRpb25zLnZhcmlhYmxlcywgdGhpcy5vcHRpb25zLnZhcmlhYmxlcyk7XG4gICAgfVxuXG4gICAgaWYgKHRoaXMub3B0aW9ucy5iYXNlVXJpICYmIHRoaXMub3B0aW9ucy5iYXNlVXJpICE9ICdkZWZhdWx0Jykge1xuICAgICAgdGhpcy5hc3Qub3B0aW9ucy5iYXNlVXJpID0gdGhpcy5vcHRpb25zLmJhc2VVcmk7XG4gICAgfVxuICB9XG5cbiAgbG9hZChmaWxlOiBzdHJpbmcpIHtcbiAgICB0aGlzLnBhdGggPSBwYXRoLmRpcm5hbWUoZmlsZSk7XG4gICAgcHJvY2Vzcy5jaGRpcih0aGlzLnBhdGgpO1xuICAgIHRoaXMuZmlsZSA9IGZpbGU7XG5cbiAgICB0aGlzLnJhdyhmcy5yZWFkRmlsZVN5bmModGhpcy5maWxlLCAndXRmOCcpKTtcbiAgfVxuXG4gIHJhdyhjb250ZW50OiBzdHJpbmcpIHtcbiAgICBsZXQgcGFyc2VkID0ganNZYW1sLmxvYWQoY29udGVudCwge1xuICAgICAgc2NoZW1hOiBBVExIZWxwZXJzLnBvaW50ZXJMaWIuY3JlYXRlU2NoZW1hKClcbiAgICB9KTtcblxuICAgIHRoaXMuYXN0LmZyb21PYmplY3QocGFyc2VkKTtcblxuICAgIHRoaXMudXBkYXRlU3RhdGUoKTtcblxuICAgIHRoaXMuX2xvYWRlZCgpO1xuICB9XG5cbiAgcnVuKGFwcD8pIHtcbiAgICB0aGlzLmRlc2NyaWJlKHRoaXMuZmlsZSB8fCAnaHR0cC1iYXQnLCAoKSA9PiB7XG4gICAgICBpZiAodGhpcy5hc3Qub3B0aW9ucy5zZWxmU2lnbmVkQ2VydCkge1xuICAgICAgICB0aGlzLml0KCdBbGxvd2luZyBzZWxmIHNpZ25lZCBzZXJ2ZXIgY2VydGlmaWNhdGVzJywgZG9uZSA9PiB7XG4gICAgICAgICAgcHJvY2Vzcy5lbnYuTk9ERV9UTFNfUkVKRUNUX1VOQVVUSE9SSVpFRCA9IFwiMFwiO1xuICAgICAgICAgIGRvbmUoKTtcbiAgICAgICAgfSk7XG4gICAgICB9XG5cbiAgICAgIHRoaXMuaXQoJ0Vuc3VyZSBiYXNlVXJpJywgZG9uZSA9PiB7XG4gICAgICAgIGlmICh0aGlzLm9wdGlvbnMuYmFzZVVyaSA9PSAnZGVmYXVsdCcpXG4gICAgICAgICAgZGVsZXRlIHRoaXMub3B0aW9ucy5iYXNlVXJpO1xuXG4gICAgICAgIGlmICghYXBwIHx8IGFwcCA9PT0gXCJkZWZhdWx0XCIgfHwgYXBwID09PSAnJykge1xuICAgICAgICAgIGFwcCA9IHRoaXMub3B0aW9ucy5iYXNlVXJpIHx8IHRoaXMuYXN0Lm9wdGlvbnMuYmFzZVVyaTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICghYXBwKSB7XG4gICAgICAgICAgZG9uZShuZXcgRXJyb3IoXCJiYXNlVXJpIG5vdCBzcGVjaWZpZWRcIikpO1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh0eXBlb2YgYXBwID09PSAnc3RyaW5nJyAmJiBhcHAuc3Vic3RyKC0xKSA9PT0gJy8nKSB7XG4gICAgICAgICAgYXBwID0gYXBwLnN1YnN0cigwLCBhcHAubGVuZ3RoIC0gMSk7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLmFnZW50ID0gcmVxdWVzdC5hZ2VudChhcHApO1xuXG4gICAgICAgIGRvbmUoKTtcbiAgICAgIH0pO1xuXG4gICAgICAvLyBQYXJzZSB0aGUgcmFtbCBmb3IgY292ZXJhZ2VcbiAgICAgIGlmICh0aGlzLmFzdC5yYW1sKSB7XG4gICAgICAgIGxldCByZXNvdXJjZXMgPSB0aGlzLmFzdC5yYW1sLnJlc291cmNlcygpO1xuXG4gICAgICAgIGZvciAobGV0IHIgaW4gcmVzb3VyY2VzKSB7XG4gICAgICAgICAgdGhpcy5wZWVrUmVzb3VyY2UocmVzb3VyY2VzW3JdKTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICAvLyBSdW4gc3VpdGVzXG4gICAgICBmb3IgKGxldCBrIGluIHRoaXMuYXN0LnN1aXRlcykge1xuICAgICAgICBsZXQgc3VpdGUgPSB0aGlzLmFzdC5zdWl0ZXNba107XG5cbiAgICAgICAgdGhpcy5ydW5TdWl0ZShzdWl0ZSk7XG4gICAgICB9XG5cbiAgICAgIHRoaXMuZW5zdXJlUmFtbENvdmVyYWdlKCk7XG4gICAgfSk7XG4gIH1cblxuICBwcml2YXRlIGVuc3VyZVJhbWxDb3ZlcmFnZSgpIHtcbiAgICBpZiAodGhpcy5hc3QucmFtbCkge1xuICAgICAgdGhpcy5kZXNjcmliZShcIlJBTUwgQ292ZXJhZ2VcIiwgKGRvbmUpID0+IHtcbiAgICAgICAgdGhpcy5pdCgnV2FpdCB0aGUgcmVzdWx0cyBiZWZvcmUgc3RhcnQnLCBkb25lID0+IHtcbiAgICAgICAgICBQcm9taXNlLmFsbCh0aGlzLmNvdmVyYWdlRWxlbWVudHMubWFwKGl0ZW0gPT4gaXRlbS5ydW4oKSkpXG4gICAgICAgICAgICAudGhlbigoKSA9PiBkb25lKCkpXG4gICAgICAgICAgICAuY2F0Y2goZXJyID0+IGRvbmUoZXJyKSk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIGlmICh0aGlzLmFzdC5vcHRpb25zLnJhbWwuY292ZXJhZ2UpIHtcbiAgICAgICAgICB0aGlzLmNvdmVyYWdlRWxlbWVudHMuZm9yRWFjaCh4ID0+IHguaW5qZWN0TW9jaGFUZXN0cygpKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGl0KCdQcmludCBjb3ZlcmFnZScsIChkb25lKSA9PiB7XG4gICAgICAgICAgUHJvbWlzZS5hbGwodGhpcy5jb3ZlcmFnZUVsZW1lbnRzLm1hcCh4ID0+IHguZ2V0Q292ZXJhZ2UoKSkpXG4gICAgICAgICAgICAudGhlbih4ID0+IHtcbiAgICAgICAgICAgICAgbGV0IHRvdGFsID0geC5yZWR1Y2UoKHByZXYsIGFjdHVhbCkgPT4ge1xuICAgICAgICAgICAgICAgIHByZXYuZXJyb3JlZCArPSBhY3R1YWwuZXJyb3JlZDtcbiAgICAgICAgICAgICAgICBwcmV2LnRvdGFsICs9IGFjdHVhbC50b3RhbDtcbiAgICAgICAgICAgICAgICBwcmV2Lm5vdENvdmVyZWQgKz0gYWN0dWFsLm5vdENvdmVyZWQ7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHByZXY7XG4gICAgICAgICAgICAgIH0sIHsgdG90YWw6IDAsIGVycm9yZWQ6IDAsIG5vdENvdmVyZWQ6IDAgfSk7XG4gICAgICAgICAgICAgIGNvbnNvbGUubG9nKHV0aWwuaW5zcGVjdCh0b3RhbCwgZmFsc2UsIDIsIHRydWUpKTtcbiAgICAgICAgICAgICAgZG9uZSgpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgICAgfSk7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBwZWVrUmVzb3VyY2UocmVzb3VyY2U6IFJBTUwuYXBpMDguUmVzb3VyY2UgfCBSQU1MLmFwaTEwLlJlc291cmNlLCBwYXJlbnQ/OiBzdHJpbmcpIHtcbiAgICBsZXQgdGhpc1VybCA9IChwYXJlbnQgfHwgXCJcIikgKyByZXNvdXJjZS5yZWxhdGl2ZVVyaSgpLnZhbHVlKCk7XG5cbiAgICB0aGlzLmNvdmVyYWdlRWxlbWVudHMucHVzaChuZXcgQ292ZXJhZ2UuQ292ZXJhZ2VSZXNvdXJjZShyZXNvdXJjZSBhcyBhbnksIHRoaXMpKTtcblxuICAgIGxldCByZXNvdXJjZXMgPSByZXNvdXJjZS5yZXNvdXJjZXMoKTtcblxuICAgIGZvciAobGV0IHIgaW4gcmVzb3VyY2VzKSB7XG4gICAgICB0aGlzLnBlZWtSZXNvdXJjZShyZXNvdXJjZXNbcl0sIHRoaXNVcmwpO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgcmVnaXN0ZXJUZXN0UmVzdWx0KHRlc3Q6IEFUTEhlbHBlcnMuQVRMVGVzdCwgY3R4OiB7XG4gICAgcmVxOiByZXF1ZXN0LlRlc3Q7XG4gICAgcmVzOiByZXF1ZXN0LlJlc3BvbnNlO1xuICAgIHRlc3Q6IEFUTEhlbHBlcnMuQVRMVGVzdDtcbiAgICB1cmw6IHN0cmluZztcbiAgfSkge1xuICAgIGxldCBrZXkgPSBBVExIZWxwZXJzLm1hdGNoVXJsKHRlc3QudXJpKTtcblxuICAgIHRoaXMuY292ZXJhZ2VFbGVtZW50cy5mb3JFYWNoKGNvdmVyYWdlRWxlbWVudCA9PiB7XG4gICAgICBpZiAoY292ZXJhZ2VFbGVtZW50Lm1hdGNoZXMoY3R4LnVybCkpIHtcbiAgICAgICAgY292ZXJhZ2VFbGVtZW50LnJlc29sdmUoY3R4LnRlc3QsIGN0eC5yZXMpO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG5cblxuICBwcml2YXRlIHJ1blN1aXRlKHN1aXRlOiBBVExIZWxwZXJzLkFUTFN1aXRlKSB7XG4gICAgbGV0IGV4ZWNGbiA9IHN1aXRlLnNraXAgPyB0aGlzLmRlc2NyaWJlLnNraXAgOiB0aGlzLmRlc2NyaWJlO1xuXG4gICAgaWYgKHN1aXRlLnRlc3QpIHtcbiAgICAgIHRoaXMucnVuVGVzdChzdWl0ZS50ZXN0KTtcbiAgICB9XG5cbiAgICBsZXQgdGhhdCA9IHRoaXM7XG5cbiAgICBpZiAoc3VpdGUuc3VpdGVzICYmIE9iamVjdC5rZXlzKHN1aXRlLnN1aXRlcykubGVuZ3RoKSB7XG4gICAgICBleGVjRm4oc3VpdGUubmFtZSwgZnVuY3Rpb24gKG1vY2hhU3VpdGUpIHtcbiAgICAgICAgZm9yIChsZXQgayBpbiBzdWl0ZS5zdWl0ZXMpIHtcbiAgICAgICAgICBsZXQgcyA9IHN1aXRlLnN1aXRlc1trXTtcbiAgICAgICAgICB0aGF0LnJ1blN1aXRlKHMpO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9XG4gIH1cblxuICBvYnRhaW5TY2hlbWFWYWxpZGF0b3Ioc2NoZW1hOiBhbnkpIHtcbiAgICBsZXQgdiA9IG5ldyBqc29uc2NoZW1hLlZhbGlkYXRvcigpO1xuXG4gICAgaWYgKHR5cGVvZiBzY2hlbWEgPT0gXCJzdHJpbmdcIikge1xuICAgICAgaWYgKHNjaGVtYSBpbiB0aGlzLmFzdC5zY2hlbWFzKSB7XG4gICAgICAgIHYuYWRkU2NoZW1hKHRoaXMuYXN0LnNjaGVtYXNbc2NoZW1hXSwgc2NoZW1hKTtcbiAgICAgICAgc2NoZW1hID0gdGhpcy5hc3Quc2NoZW1hc1tzY2hlbWFdO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBzY2hlbWEgPSBKU09OLnBhcnNlKHNjaGVtYSk7XG4gICAgICAgICAgdi5hZGRTY2hlbWEoc2NoZW1hKTtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBzY2hlbWEgPT0gXCJvYmplY3RcIikge1xuICAgICAgdi5hZGRTY2hlbWEoc2NoZW1hKTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIHNjaGVtYSAnICsgdXRpbC5pbnNwZWN0KHNjaGVtYSkpO1xuICAgIH1cblxuICAgIGlmICh2LnVucmVzb2x2ZWRSZWZzICYmIHYudW5yZXNvbHZlZFJlZnMubGVuZ3RoKSB7XG4gICAgICB0aGlzLmRlc2NyaWJlKFwiTG9hZCByZWZlcmVuY2VkIHNjaGVtYXNcIiwgZnVuY3Rpb24gKCkge1xuICAgICAgICB3aGlsZSAodi51bnJlc29sdmVkUmVmcyAmJiB2LnVucmVzb2x2ZWRSZWZzLmxlbmd0aCkge1xuICAgICAgICAgIGxldCBuZXh0U2NoZW1hID0gdi51bnJlc29sdmVkUmVmcy5zaGlmdCgpO1xuICAgICAgICAgIHRoaXMuaXQoXCJsb2FkIHNjaGVtYSBcIiArIG5leHRTY2hlbWEsICgpID0+IHtcbiAgICAgICAgICAgIGxldCB0aGVTY2hlbWEgPSB0aGlzLmFzdC5zY2hlbWFzW25leHRTY2hlbWFdO1xuXG4gICAgICAgICAgICBpZiAoIXRoZVNjaGVtYSlcbiAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwic2NoZW1hIFwiICsgbmV4dFNjaGVtYSArIFwiIG5vdCBmb3VuZFwiKTtcblxuICAgICAgICAgICAgdi5hZGRTY2hlbWEodGhlU2NoZW1hLCBuZXh0U2NoZW1hKTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfVxuXG4gICAgcmV0dXJuIChjb250ZW50KSA9PiB7XG4gICAgICByZXR1cm4gdi52YWxpZGF0ZShjb250ZW50LCBzY2hlbWEpO1xuICAgIH07XG4gIH1cblxuICBwcml2YXRlIHJ1blRlc3QodGVzdDogQVRMSGVscGVycy5BVExUZXN0KSB7XG4gICAgbGV0IGV4ZWNGbiA9IHRlc3Quc2tpcFxuICAgICAgPyB0aGlzLmRlc2NyaWJlLnNraXBcbiAgICAgIDogdGhpcy5kZXNjcmliZTtcblxuICAgIGxldCB0aGF0ID0gdGhpcztcblxuICAgIGxldCByZXF1ZXN0SG9sZGVyID0ge1xuICAgICAgcmVxOiBudWxsIGFzIHJlcXVlc3QuVGVzdCxcbiAgICAgIHJlczogbnVsbCBhcyByZXF1ZXN0LlJlc3BvbnNlLFxuICAgICAgdXJsOiB0ZXN0LnVyaSxcbiAgICAgIGN0eDoge1xuICAgICAgICBSRVFVRVNUOiB7fSBhcyBhbnksXG4gICAgICAgIFJFU1BPTlNFOiB7fSBhcyBhbnlcbiAgICAgIH1cbiAgICB9O1xuXG4gICAgZXhlY0ZuKHRlc3QuZGVzY3JpcHRpb24gfHwgKHRlc3QubWV0aG9kLnRvVXBwZXJDYXNlKCkgKyAnICcgKyB0ZXN0LnVyaSksIGZ1bmN0aW9uICgpIHtcblxuICAgICAgaWYgKHRlc3QudXJpUGFyYW1ldGVycykge1xuICAgICAgICB0aGF0LmRlZmVyZWRJdCgnRW5zdXJlIHVyaVBhcmFtZXRlcnMnKS50aGVuKGZ1bmN0aW9uIChyZXNvbHZlcikge1xuICAgICAgICAgIGZvciAobGV0IGkgaW4gdGVzdC51cmlQYXJhbWV0ZXJzKSB7XG4gICAgICAgICAgICBsZXQgdmFsdWUgPSBudWxsO1xuXG4gICAgICAgICAgICBpZiAodGVzdC51cmlQYXJhbWV0ZXJzW2ldIGluc3RhbmNlb2YgQVRMSGVscGVycy5wb2ludGVyTGliLlBvaW50ZXIpIHtcbiAgICAgICAgICAgICAgdmFsdWUgPSB0ZXN0LnVyaVBhcmFtZXRlcnNbaV0uZ2V0KHRoYXQuYXN0Lm9wdGlvbnMudmFyaWFibGVzKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIHZhbHVlID0gdGVzdC51cmlQYXJhbWV0ZXJzW2ldO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBsZXQgdHlwZU9mVmFsdWUgPSB0eXBlb2YgdmFsdWU7XG5cbiAgICAgICAgICAgIC8qIGlzdGFuYnVsIGlnbm9yZSBpZiAqL1xuICAgICAgICAgICAgaWYgKHR5cGVPZlZhbHVlICE9ICdzdHJpbmcnICYmIHR5cGVPZlZhbHVlICE9ICdudW1iZXInKSB7XG4gICAgICAgICAgICAgIHJlc29sdmVyKFwiT25seSBzdHJpbmdzIGFuZCBudW1iZXJzIGFyZSBhbGxvd2VkIG9uIHVyaVBhcmFtZXRlcnMuIFwiICsgaSArIFwiPVwiICsgdXRpbC5pbnNwZWN0KHZhbHVlKSk7XG4gICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmVxdWVzdEhvbGRlci51cmwgPSByZXF1ZXN0SG9sZGVyLnVybC5yZXBsYWNlKG5ldyBSZWdFeHAoXCJ7XCIgKyBpICsgXCJ9XCIsIFwiZ1wiKSwgZnVuY3Rpb24gKGZ1bGx0ZXh0LCBtYXRjaCkge1xuICAgICAgICAgICAgICByZXR1cm4gZW5jb2RlVVJJQ29tcG9uZW50KHZhbHVlKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXNvbHZlcigpO1xuICAgICAgICB9KTtcbiAgICAgIH1cblxuXG5cbiAgICAgIGxldCBwYXJzZWRVcmwgPSB1cmwucGFyc2UocmVxdWVzdEhvbGRlci51cmwsIHRydWUpO1xuXG4gICAgICBwYXJzZWRVcmwucXVlcnkgPSBwYXJzZWRVcmwucXVlcnkgfHwge307XG5cbiAgICAgIGxldCBuZXdRcyA9IHBhcnNlZFVybC5xdWVyeTtcblxuICAgICAgaWYgKHRlc3QucmVxdWVzdC5xdWVyeVBhcmFtZXRlcnMpIHtcbiAgICAgICAgdGhhdC5kZWZlcmVkSXQoJ0Vuc3VyZSBxdWVyeVBhcmFtZXRlcnMnKS50aGVuKGZ1bmN0aW9uIChyZXNvbHZlcikge1xuICAgICAgICAgIGlmICgnc2VhcmNoJyBpbiBwYXJzZWRVcmwpXG4gICAgICAgICAgICBkZWxldGUgcGFyc2VkVXJsLnNlYXJjaDtcblxuICAgICAgICAgIGxldCBxc1BhcmFtcyA9IEFUTEhlbHBlcnMuY2xvbmVPYmplY3RVc2luZ1BvaW50ZXJzKHRlc3QucmVxdWVzdC5xdWVyeVBhcmFtZXRlcnMsIHRoYXQuYXN0Lm9wdGlvbnMudmFyaWFibGVzKTtcblxuICAgICAgICAgIGZvciAobGV0IGkgaW4gcXNQYXJhbXMpIHtcbiAgICAgICAgICAgIG5ld1FzW2ldID0gcXNQYXJhbXNbaV07XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgcmVxdWVzdEhvbGRlci5jdHguUkVRVUVTVC5xdWVyeVBhcmFtZXRlcnMgPSBxc1BhcmFtcztcblxuICAgICAgICAgIHJlcXVlc3RIb2xkZXIudXJsID0gdXJsLmZvcm1hdChwYXJzZWRVcmwpO1xuXG4gICAgICAgICAgcmVzb2x2ZXIoKTtcbiAgICAgICAgfSk7XG4gICAgICB9XG5cbiAgICAgIHRoYXQuZGVmZXJlZEl0KHRlc3QubWV0aG9kLnRvVXBwZXJDYXNlKCkgKyAnICcgKyByZXF1ZXN0SG9sZGVyLnVybCwgdGVzdC50aW1lb3V0KS50aGVuKGZ1bmN0aW9uIChyZXNvbHZlcikge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIGxldCByZXEgPSByZXF1ZXN0SG9sZGVyLnJlcSA9IHRoYXQuYWdlbnRbdGVzdC5tZXRob2QudG9Mb3dlckNhc2UoKV0ocmVxdWVzdEhvbGRlci51cmwpO1xuXG4gICAgICAgICAgcmVxdWVzdEhvbGRlci5jdHguUkVRVUVTVC5tZXRob2QgPSB0ZXN0Lm1ldGhvZDtcbiAgICAgICAgICByZXF1ZXN0SG9sZGVyLmN0eC5SRVFVRVNULnVybCA9IHJlcXVlc3RIb2xkZXIudXJsO1xuXG4gICAgICAgICAgLy8gd2UgbXVzdCBzZW5kIHNvbWUgZGF0YS4uXG4gICAgICAgICAgaWYgKHRlc3QucmVxdWVzdCkge1xuICAgICAgICAgICAgaWYgKHRlc3QucmVxdWVzdC5oZWFkZXJzKSB7XG4gICAgICAgICAgICAgIHJlcXVlc3RIb2xkZXIuY3R4LlJFUVVFU1QuaGVhZGVycyA9IHt9O1xuICAgICAgICAgICAgICBsZXQgaGVhZGVycyA9IEFUTEhlbHBlcnMuY2xvbmVPYmplY3RVc2luZ1BvaW50ZXJzKHRlc3QucmVxdWVzdC5oZWFkZXJzLCB0aGF0LmFzdC5vcHRpb25zLnZhcmlhYmxlcyk7XG4gICAgICAgICAgICAgIGZvciAobGV0IGggaW4gaGVhZGVycykge1xuXG4gICAgICAgICAgICAgICAgcmVxLnNldChoLCBoZWFkZXJzW2hdID09IHVuZGVmaW5lZCA/ICcnIDogaGVhZGVyc1toXS50b1N0cmluZygpKTtcbiAgICAgICAgICAgICAgICBpZiAodHlwZW9mIHRlc3QucmVxdWVzdC5oZWFkZXJzW2hdID09IFwib2JqZWN0XCIgJiYgdGVzdC5yZXF1ZXN0LmhlYWRlcnNbaF0gaW5zdGFuY2VvZiBBVExIZWxwZXJzLnBvaW50ZXJMaWIuUG9pbnRlciAmJiB0ZXN0LnJlcXVlc3QuaGVhZGVyc1toXS5wYXRoLmluZGV4T2YoXCJFTlZcIikgPT0gMCkge1xuICAgICAgICAgICAgICAgICAgcmVxdWVzdEhvbGRlci5jdHguUkVRVUVTVC5oZWFkZXJzW2hdID0gXCIoVEFLRU4gRlJPTSBcIiArIHRlc3QucmVxdWVzdC5oZWFkZXJzW2hdLnBhdGggKyBcIilcIjtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgcmVxdWVzdEhvbGRlci5jdHguUkVRVUVTVC5oZWFkZXJzW2hdID0gdHlwZW9mIGhlYWRlcnNbaF0gIT0gXCJ1bmRlZmluZWRcIiAmJiBoZWFkZXJzW2hdLnRvU3RyaW5nKCkgfHwgaGVhZGVyc1toXTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKHRlc3QucmVxdWVzdC5qc29uKSB7XG4gICAgICAgICAgICAgIGxldCBkYXRhID0gQVRMSGVscGVycy5jbG9uZU9iamVjdFVzaW5nUG9pbnRlcnModGVzdC5yZXF1ZXN0Lmpzb24sIHRoYXQuYXN0Lm9wdGlvbnMudmFyaWFibGVzKTtcbiAgICAgICAgICAgICAgcmVxdWVzdEhvbGRlci5jdHguUkVRVUVTVC5ib2R5ID0gZGF0YTtcbiAgICAgICAgICAgICAgcmVxLnNlbmQoZGF0YSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmICh0ZXN0LnJlcXVlc3QuYXR0YWNoKSB7XG4gICAgICAgICAgICAgIC8qIGlzdGFuYnVsIGlnbm9yZSBpZiAqL1xuICAgICAgICAgICAgICBpZiAoIXRoYXQucGF0aCkge1xuICAgICAgICAgICAgICAgIHJlc29sdmVyKEFUTEhlbHBlcnMuZXJyb3IoXCJhdHRhY2ggaXMgbm90IGFsbG93ZWQgdXNpbmcgUkFXIGRlZmluaXRpb25zXCIsIHJlcXVlc3RIb2xkZXIuY3R4KSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgZm9yIChsZXQgaSBpbiB0ZXN0LnJlcXVlc3QuYXR0YWNoKSB7XG4gICAgICAgICAgICAgICAgbGV0IGN1cnJlbnRBdHRhY2htZW50ID0gdGVzdC5yZXF1ZXN0LmF0dGFjaFtpXTtcbiAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgcmVxLmF0dGFjaChjdXJyZW50QXR0YWNobWVudC5rZXksIHBhdGgucmVzb2x2ZSh0aGF0LnBhdGgsIGN1cnJlbnRBdHRhY2htZW50LnZhbHVlKSk7XG4gICAgICAgICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgICAgICAgcmVzb2x2ZXIoZSk7XG4gICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmICh0ZXN0LnJlcXVlc3QuZm9ybSkge1xuICAgICAgICAgICAgICByZXEudHlwZSgnZm9ybScpO1xuXG4gICAgICAgICAgICAgIGZvciAobGV0IGkgaW4gdGVzdC5yZXF1ZXN0LmZvcm0pIHtcbiAgICAgICAgICAgICAgICBsZXQgY3VycmVudEF0dGFjaG1lbnQgPSBBVExIZWxwZXJzLmNsb25lT2JqZWN0VXNpbmdQb2ludGVycyh0ZXN0LnJlcXVlc3QuZm9ybVtpXSwgdGhhdC5hc3Qub3B0aW9ucy52YXJpYWJsZXMpO1xuICAgICAgICAgICAgICAgIHJlcS5maWVsZChjdXJyZW50QXR0YWNobWVudC5rZXksIGN1cnJlbnRBdHRhY2htZW50LnZhbHVlKTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAodGVzdC5yZXF1ZXN0LnVybGVuY29kZWQpIHtcbiAgICAgICAgICAgICAgcmVxLnNlbmQoQVRMSGVscGVycy5jbG9uZU9iamVjdFVzaW5nUG9pbnRlcnModGVzdC5yZXF1ZXN0LnVybGVuY29kZWQsIHRoYXQuYXN0Lm9wdGlvbnMudmFyaWFibGVzKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgcmVxLmVuZChmdW5jdGlvbiAoZXJyLCByZXMpIHtcbiAgICAgICAgICAgIHJlcXVlc3RIb2xkZXIucmVzID0gcmVzO1xuICAgICAgICAgICAgcmVxdWVzdEhvbGRlci5jdHguUkVTUE9OU0UgPSByZXM7XG4gICAgICAgICAgICAvKiBpc3RhbmJ1bCBpZ25vcmUgaWY6IHVudGVzdGFibGUgKi9cbiAgICAgICAgICAgIGlmIChlcnIgJiYgZXJyIGluc3RhbmNlb2YgRXJyb3IpIHtcbiAgICAgICAgICAgICAgZXJyID0gQVRMSGVscGVycy5lcnJvcihlcnIubWVzc2FnZSwgcmVxdWVzdEhvbGRlci5jdHgpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXNvbHZlcihlcnIpO1xuXG4gICAgICAgICAgICBpZiAoIWVycikge1xuICAgICAgICAgICAgICB0aGF0LnJlZ2lzdGVyVGVzdFJlc3VsdCh0ZXN0LCB7XG4gICAgICAgICAgICAgICAgcmVxLFxuICAgICAgICAgICAgICAgIHJlcyxcbiAgICAgICAgICAgICAgICB0ZXN0LFxuICAgICAgICAgICAgICAgIHVybDogcmVxdWVzdEhvbGRlci51cmxcbiAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHRlc3QucmVzb2x2ZShyZXMsIGVycik7XG4gICAgICAgICAgfSk7XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICByZXNvbHZlcihlKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG5cblxuICAgICAgZXhlY0ZuKFwiVmFsaWRhdGUgcmVzcG9uc2VcIiwgZnVuY3Rpb24gKCkge1xuICAgICAgICBpZiAodGVzdC5yZXNwb25zZSkge1xuICAgICAgICAgIGlmICh0ZXN0LnJlc3BvbnNlLnN0YXR1cykge1xuICAgICAgICAgICAgdGhhdC5kZWZlcmVkSXQoXCJyZXNwb25zZS5zdGF0dXMgPT0gXCIgKyB0ZXN0LnJlc3BvbnNlLnN0YXR1cywgdGVzdC50aW1lb3V0KS50aGVuKHJlc29sdmVyID0+IHtcbiAgICAgICAgICAgICAgLyogaXN0YW5idWwgaWdub3JlIGVsc2UgKi9cbiAgICAgICAgICAgICAgaWYgKHJlcXVlc3RIb2xkZXIucmVzLnN0YXR1cyA9PSB0ZXN0LnJlc3BvbnNlLnN0YXR1cylcbiAgICAgICAgICAgICAgICByZXNvbHZlcigpO1xuICAgICAgICAgICAgICBlbHNlXG4gICAgICAgICAgICAgICAgcmVzb2x2ZXIoQVRMSGVscGVycy5lcnJvcignZXhwZWN0ZWQgc3RhdHVzIGNvZGUgJyArIHRlc3QucmVzcG9uc2Uuc3RhdHVzICsgJyBnb3QgJyArIHJlcXVlc3RIb2xkZXIucmVzLnN0YXR1cywgcmVxdWVzdEhvbGRlci5jdHgpKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGlmICh0ZXN0LnJlc3BvbnNlLmJvZHkpIHtcbiAgICAgICAgICAgIGlmICgnaXMnIGluIHRlc3QucmVzcG9uc2UuYm9keSkge1xuICAgICAgICAgICAgICB0aGF0LmRlZmVyZWRJdChcInJlc3BvbnNlLmJvZHlcIiwgdGVzdC50aW1lb3V0KS50aGVuKHJlc29sdmVyID0+IHtcbiAgICAgICAgICAgICAgICBsZXQgYm9keUVxdWFscyA9IEFUTEhlbHBlcnMuY2xvbmVPYmplY3RVc2luZ1BvaW50ZXJzKHRlc3QucmVzcG9uc2UuYm9keS5pcywgdGhhdC5hc3Qub3B0aW9ucy52YXJpYWJsZXMpO1xuXG4gICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgIGlmICh0ZXN0LnJlc3BvbnNlLmJvZHkuaXMgJiYgdHlwZW9mIHRlc3QucmVzcG9uc2UuYm9keS5pcyA9PSBcIm9iamVjdFwiICYmIHRlc3QucmVzcG9uc2UuYm9keS5pcyBpbnN0YW5jZW9mIFJlZ0V4cCkge1xuICAgICAgICAgICAgICAgICAgICAvKiBpc3RhbmJ1bCBpZ25vcmUgaWYgKi9cbiAgICAgICAgICAgICAgICAgICAgaWYgKCF0ZXN0LnJlc3BvbnNlLmJvZHkuaXMudGVzdChyZXF1ZXN0SG9sZGVyLnJlcy50ZXh0KSkge1xuICAgICAgICAgICAgICAgICAgICAgIGxldCBhID0gdXRpbC5pbnNwZWN0KGJvZHlFcXVhbHMpO1xuICAgICAgICAgICAgICAgICAgICAgIGxldCBiID0gdXRpbC5pbnNwZWN0KHRlc3QucmVzcG9uc2UuYm9keS5pcyk7XG4gICAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZXIoQVRMSGVscGVycy5lcnJvcignZXhwZWN0ZWQgcmVzcG9uc2UuYm9keSB0byBtYXRjaCAnICsgYSArICcgcmVzcG9uc2UgYm9keSwgZ290ICcgKyBiLCByZXF1ZXN0SG9sZGVyLmN0eCkpO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgIHJlc29sdmVyKCk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIGxldCB0YWtlbkJvZHk7XG4gICAgICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgdGVzdC5yZXNwb25zZS5ib2R5LmlzID09IFwic3RyaW5nXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgICB0YWtlbkJvZHkgPSByZXF1ZXN0SG9sZGVyLnJlcy50ZXh0O1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgIHRha2VuQm9keSA9IHJlcXVlc3RIb2xkZXIucmVzLmJvZHk7XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAvKiBpc3RhbmJ1bCBpZ25vcmUgaWYgKi9cbiAgICAgICAgICAgICAgICAgICAgaWYgKCFfLmlzRXF1YWwoYm9keUVxdWFscywgdGFrZW5Cb2R5KSkge1xuICAgICAgICAgICAgICAgICAgICAgIGxldCBhID0gdXRpbC5pbnNwZWN0KGJvZHlFcXVhbHMpO1xuICAgICAgICAgICAgICAgICAgICAgIGxldCBiID0gdXRpbC5pbnNwZWN0KHRha2VuQm9keSk7XG4gICAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZXIoQVRMSGVscGVycy5lcnJvckRpZmYoJ2V4cGVjdGVkICcgKyBhICsgJyByZXNwb25zZSBib2R5LCBnb3QgJyArIGIsIGJvZHlFcXVhbHMsIHRha2VuQm9keSwgcmVxdWVzdEhvbGRlci5jdHgpKTtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICByZXNvbHZlcigpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgICAgICAgcmVzb2x2ZXIoZSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKHRlc3QucmVzcG9uc2UuYm9keS5zY2hlbWEpIHtcbiAgICAgICAgICAgICAgbGV0IHYgPSB0aGF0Lm9idGFpblNjaGVtYVZhbGlkYXRvcih0ZXN0LnJlc3BvbnNlLmJvZHkuc2NoZW1hKTtcblxuICAgICAgICAgICAgICB0aGF0LmRlZmVyZWRJdChcInJlc3BvbnNlLmJvZHkgc2NoZW1hXCIsIHRlc3QudGltZW91dCkudGhlbihyZXNvbHZlciA9PiB7XG4gICAgICAgICAgICAgICAgbGV0IHZhbGlkYXRpb25SZXN1bHQgPSB2KHJlcXVlc3RIb2xkZXIucmVzLmJvZHkpO1xuICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICBpZiAodmFsaWRhdGlvblJlc3VsdC52YWxpZCkge1xuICAgICAgICAgICAgICAgICAgICByZXNvbHZlcigpO1xuICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgbGV0IGVycm9ycyA9IFtcIlNjaGVtYSBlcnJvcjpcIl07XG4gICAgICAgICAgICAgICAgICAgIHZhbGlkYXRpb25SZXN1bHQuZXJyb3JzICYmIHZhbGlkYXRpb25SZXN1bHQuZXJyb3JzLmZvckVhY2goeCA9PiBlcnJvcnMucHVzaChcIiAgXCIgKyB4LnN0YWNrKSk7XG5cbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZXIoQVRMSGVscGVycy5lcnJvcihlcnJvcnMuam9pbignXFxuJykgfHwgXCJJbnZhbGlkIHNjaGVtYVwiLCByZXF1ZXN0SG9sZGVyLmN0eCkpO1xuICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgICAgICAgIHJlc29sdmVyKGUpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmICh0ZXN0LnJlc3BvbnNlLmJvZHkubWF0Y2hlcykge1xuICAgICAgICAgICAgICB0ZXN0LnJlc3BvbnNlLmJvZHkubWF0Y2hlcy5mb3JFYWNoKGt2byA9PiB7XG4gICAgICAgICAgICAgICAgdGhhdC5kZWZlcmVkSXQoXCJyZXNwb25zZS5ib2R5OjpcIiArIGt2by5rZXksIHRlc3QudGltZW91dCkudGhlbihyZXNvbHZlciA9PiB7XG4gICAgICAgICAgICAgICAgICBsZXQgdmFsdWU6IGFueSA9IEFUTEhlbHBlcnMuY2xvbmVPYmplY3RVc2luZ1BvaW50ZXJzKGt2by52YWx1ZSwgdGhhdC5hc3Qub3B0aW9ucy52YXJpYWJsZXMpO1xuXG4gICAgICAgICAgICAgICAgICBsZXQgcmVhZGVkID0gXy5nZXQocmVxdWVzdEhvbGRlci5yZXMuYm9keSwga3ZvLmtleSk7XG5cbiAgICAgICAgICAgICAgICAgIC8qIGlzdGFuYnVsIGlnbm9yZSBpZiAqL1xuICAgICAgICAgICAgICAgICAgaWYgKFxuICAgICAgICAgICAgICAgICAgICAoISh2YWx1ZSBpbnN0YW5jZW9mIFJlZ0V4cCkgJiYgIV8uaXNFcXVhbChyZWFkZWQsIHZhbHVlKSlcbiAgICAgICAgICAgICAgICAgICAgfHxcbiAgICAgICAgICAgICAgICAgICAgKCh2YWx1ZSBpbnN0YW5jZW9mIFJlZ0V4cCkgJiYgIXZhbHVlLnRlc3QocmVhZGVkKSlcbiAgICAgICAgICAgICAgICAgICkge1xuICAgICAgICAgICAgICAgICAgICByZXNvbHZlcihBVExIZWxwZXJzLmVycm9yRGlmZignZXhwZWN0ZWQgcmVzcG9uc2UuYm9keTo6JyArIGt2by5rZXkgKyAnIHRvIGJlICcgKyB1dGlsLmluc3BlY3QodmFsdWUpICsgJyBnb3QgJyArIHV0aWwuaW5zcGVjdChyZWFkZWQpLCB2YWx1ZSwgcmVhZGVkLCByZXF1ZXN0SG9sZGVyLmN0eCkpO1xuICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZXIoKTtcbiAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKHRlc3QucmVzcG9uc2UuYm9keS50YWtlKSB7XG4gICAgICAgICAgICAgIGxldCB0YWtlID0gdGVzdC5yZXNwb25zZS5ib2R5LnRha2U7XG5cbiAgICAgICAgICAgICAgdGFrZS5mb3JFYWNoKGZ1bmN0aW9uICh0YWtlbkVsZW1lbnQpIHtcbiAgICAgICAgICAgICAgICB0aGF0LmRlZmVyZWRJdChcInJlc3BvbnNlLmJvZHk6OlwiICsgdGFrZW5FbGVtZW50LmtleSArIFwiID4+ICEhdmFyaWFibGVzIFwiICsgdGFrZW5FbGVtZW50LnZhbHVlLnBhdGgsIHRlc3QudGltZW91dCkudGhlbihyZXNvbHZlciA9PiB7XG4gICAgICAgICAgICAgICAgICBsZXQgdGFrZW5WYWx1ZSA9IF8uZ2V0KHJlcXVlc3RIb2xkZXIucmVzLmJvZHksIHRha2VuRWxlbWVudC5rZXkpO1xuICAgICAgICAgICAgICAgICAgdGFrZW5FbGVtZW50LnZhbHVlLnNldCh0aGF0LmFzdC5vcHRpb25zLnZhcmlhYmxlcywgdGFrZW5WYWx1ZSk7XG4gICAgICAgICAgICAgICAgICByZXNvbHZlcigpO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKHRlc3QucmVzcG9uc2UuYm9keS5jb3B5VG8gJiYgdGVzdC5yZXNwb25zZS5ib2R5LmNvcHlUbyBpbnN0YW5jZW9mIEFUTEhlbHBlcnMucG9pbnRlckxpYi5Qb2ludGVyKSB7XG4gICAgICAgICAgICAgIHRoYXQuZGVmZXJlZEl0KFwicmVzcG9uc2UuYm9keSA+PiAhIXZhcmlhYmxlcyBcIiArIHRlc3QucmVzcG9uc2UuYm9keS5jb3B5VG8ucGF0aCwgdGVzdC50aW1lb3V0KS50aGVuKHJlc29sdmVyID0+IHtcbiAgICAgICAgICAgICAgICB0ZXN0LnJlc3BvbnNlLmJvZHkuY29weVRvLnNldCh0aGF0LmFzdC5vcHRpb25zLnZhcmlhYmxlcywgcmVxdWVzdEhvbGRlci5yZXMuYm9keSk7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZXIoKTtcbiAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmICh0ZXN0LnJlc3BvbnNlLmhlYWRlcnMpIHtcbiAgICAgICAgICAgICAgbGV0IGhlYWRlcnMgPSBBVExIZWxwZXJzLmNsb25lT2JqZWN0VXNpbmdQb2ludGVycyh0ZXN0LnJlc3BvbnNlLmhlYWRlcnMsIHRoYXQub3B0aW9ucy52YXJpYWJsZXMpO1xuXG4gICAgICAgICAgICAgIGZvciAobGV0IGggaW4gaGVhZGVycykge1xuICAgICAgICAgICAgICAgIGlmIChoICE9PSAnY29udGVudC10eXBlJykge1xuICAgICAgICAgICAgICAgICAgaGVhZGVyc1toXSA9IGhlYWRlcnNbaF0udG9TdHJpbmcoKTtcblxuICAgICAgICAgICAgICAgICAgdGhhdC5kZWZlcmVkSXQoXCJyZXNwb25zZS5oZWFkZXI6OlwiICsgaCwgdGVzdC50aW1lb3V0KS50aGVuKHJlc29sdmUgPT4ge1xuICAgICAgICAgICAgICAgICAgICBsZXQgdmFsdWUgPSByZXF1ZXN0SG9sZGVyLnJlcy5nZXQoaC50b0xvd2VyQ2FzZSgpKTtcblxuICAgICAgICAgICAgICAgICAgICAvKiBpc3RhbmJ1bCBpZ25vcmUgaWYgKi9cbiAgICAgICAgICAgICAgICAgICAgaWYgKGhlYWRlcnNbaF0gIT0gdmFsdWUpIHtcbiAgICAgICAgICAgICAgICAgICAgICBsZXQgYSA9IHV0aWwuaW5zcGVjdChoZWFkZXJzW2hdKTtcbiAgICAgICAgICAgICAgICAgICAgICBsZXQgYiA9IHV0aWwuaW5zcGVjdCh2YWx1ZSk7XG4gICAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZShBVExIZWxwZXJzLmVycm9yRGlmZignZXhwZWN0ZWQgcmVzcG9uc2UuaGVhZGVyOjonICsgaCArICcgdG8gYmUgJyArIGEgKyAnIGdvdCAnICsgYiwgaGVhZGVyc1toXSwgdmFsdWUsIHJlcXVlc3RIb2xkZXIuY3R4KSk7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZSgpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gIH1cblxuICBkZWZlcmVkSXQobmFtZTogc3RyaW5nLCB0aW1lb3V0PzogbnVtYmVyKTogUHJvbWlzZTwoZXJyPykgPT4gdm9pZD4ge1xuICAgIGxldCBmaWxsID0gbnVsbDtcblxuICAgIGxldCBwcm9tID0gQVRMSGVscGVycy5mbGF0UHJvbWlzZSgpO1xuXG4gICAgdGhpcy5pdChuYW1lLCBmdW5jdGlvbiAoZG9uZSkge1xuICAgICAgaWYgKHRpbWVvdXQpXG4gICAgICAgIHRoaXMudGltZW91dCh0aW1lb3V0KTtcblxuICAgICAgcHJvbS5yZXNvbHZlci5jYWxsKHRoaXMsIGZ1bmN0aW9uIChyZXQpIHtcbiAgICAgICAgLyogaXN0YW5idWwgaWdub3JlIGlmICovXG4gICAgICAgIGlmIChyZXQpIHtcbiAgICAgICAgICBkb25lKHJldCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgZG9uZSgpO1xuICAgICAgICB9XG4gICAgICB9KTtcblxuICAgICAgcHJvbS5wcm9taXNlLmNhdGNoKGRvbmUpO1xuICAgIH0pO1xuXG4gICAgcmV0dXJuIHByb20ucHJvbWlzZTtcbiAgfVxuXG4gIGNvdmVyYWdlRGF0YTogQVRMSGVscGVycy5JRGljdGlvbmFyeTx7XG4gICAgc291cmNlOiBBcnJheTxudW1iZXIgfCB2b2lkPjtcbiAgfT4gPSB7fTtcblxuICB3cml0ZUNvdmVyYWdlKGNvdmVyRmlsZTogc3RyaW5nKSB7XG4gICAgbGV0IGN3ZCA9IHBhdGguZGlybmFtZShjb3ZlckZpbGUpO1xuXG4gICAgaWYgKHRoaXMuY292ZXJhZ2VEYXRhICYmIE9iamVjdC5rZXlzKHRoaXMuY292ZXJhZ2VEYXRhKS5sZW5ndGgpIHtcbiAgICAgIGNvbnNvbGUuaW5mbyhcIldyaXRpbmcgY292ZXJhZ2UgaW5mb3JtYXRpb246IFwiICsgY292ZXJGaWxlKTtcblxuICAgICAgbGV0IGNvdmVyYWdlID0gJyc7XG5cbiAgICAgIHRyeSB7XG4gICAgICAgIGZzLm1rZGlyU3luYyhjd2QpO1xuICAgICAgfSBjYXRjaCAoZSkgeyB9XG5cbiAgICAgIHRyeSB7XG4gICAgICAgIGNvdmVyYWdlID0gZnMucmVhZEZpbGVTeW5jKGNvdmVyRmlsZSkudG9TdHJpbmcoKTtcbiAgICAgIH0gY2F0Y2ggKGUpIHtcblxuICAgICAgfVxuXG4gICAgICBpZiAoY292ZXJhZ2UubGVuZ3RoKSBjb3ZlcmFnZSA9IGNvdmVyYWdlICsgJ1xcbic7XG5cbiAgICAgIGNvdmVyYWdlID1cbiAgICAgICAgY292ZXJhZ2UgKz0gT2JqZWN0LmtleXModGhpcy5jb3ZlcmFnZURhdGEpXG4gICAgICAgICAgLmZpbHRlcih4ID0+ICEheClcbiAgICAgICAgICAubWFwKChmaWxlKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gY292ZXJhZ2VUb1N0cmluZyhmaWxlLCB0aGlzLmNvdmVyYWdlRGF0YVtmaWxlXSBhcyBhbnkpO1xuICAgICAgICAgIH0pLmpvaW4oJ1xcbicpO1xuXG4gICAgICBmcy53cml0ZUZpbGVTeW5jKGNvdmVyRmlsZSwgY292ZXJhZ2UpO1xuXG4gICAgICBjb25zb2xlLmluZm8oXCJXcml0aW5nIGNvdmVyYWdlIGluZm9ybWF0aW9uLiBPSyFcIik7XG4gICAgfVxuICB9XG59XG5cbiJdfQ==