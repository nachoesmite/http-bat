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
        if (suite.test) {
            this.runTest(suite.test);
        }
        var that = this;
        if (suite.suites && Object.keys(suite.suites).length) {
            execFn(suite.name, function () {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYmF0LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiYmF0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQSxPQUFPO0FBQ1AsSUFBTyxFQUFFLFdBQVcsSUFBSSxDQUFDLENBQUM7QUFDMUIsSUFBTyxJQUFJLFdBQVcsTUFBTSxDQUFDLENBQUM7QUFDOUIsSUFBTyxHQUFHLFdBQVcsS0FBSyxDQUFDLENBQUM7QUFDNUIsSUFBTyxJQUFJLFdBQVcsTUFBTSxDQUFDLENBQUM7QUFFOUIsTUFBTTtBQUNOLElBQU8sTUFBTSxXQUFXLFNBQVMsQ0FBQyxDQUFDO0FBQ25DLElBQU8sQ0FBQyxXQUFXLFFBQVEsQ0FBQyxDQUFDO0FBQzdCLElBQU8sT0FBTyxXQUFXLFdBQVcsQ0FBQyxDQUFDO0FBR3RDLElBQU0sVUFBVSxHQUFHLE9BQU8sQ0FBQyxZQUFZLENBQUMsQ0FBQztBQUN6QyxJQUFNLFNBQVMsR0FBRyxPQUFPLENBQUMsaUJBQWlCLENBQUMsQ0FBQztBQUU3QyxTQUFTO0FBQ1QsSUFBTyxHQUFHLFdBQVcsT0FBTyxDQUFDLENBQUM7QUFDOUIsSUFBTyxVQUFVLFdBQVcsY0FBYyxDQUFDLENBQUM7QUFDNUMsSUFBTyxRQUFRLFdBQVcsWUFBWSxDQUFDLENBQUM7QUFDeEMscUNBQW1ELDZCQUE2QixDQUFDLENBQUE7QUFXakY7SUFpQkUsYUFBbUIsT0FBeUI7UUFqQjlDLGlCQXVuQkM7UUF0bUJhLHVCQUFnQyxHQUFoQyxZQUFnQztRQUF6QixZQUFPLEdBQVAsT0FBTyxDQUFrQjtRQUw1QyxhQUFRLEdBQVEsUUFBUSxDQUFDO1FBQ3pCLE9BQUUsR0FBUSxFQUFFLENBQUM7UUFFYixxQkFBZ0IsR0FBZ0MsRUFBRSxDQUFDO1FBb2tCbkQsaUJBQVksR0FFUCxFQUFFLENBQUM7UUFua0JOLElBQUksQ0FBQyxHQUFHLEdBQUcsSUFBSSxHQUFHLENBQUMsR0FBRyxFQUFFLENBQUM7UUFFekIsSUFBSSxNQUFNLEdBQUcsVUFBVSxDQUFDLFdBQVcsRUFB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QUUzRCxJQUFJLFFBQVEsR0FBRyxFQUFFLENBQUM7WUFFbEIsSUFBSSxDQUFDO2dCQUNILEVBQUUsQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLENBQUM7WUFDcEIsQ0FBRTtZQUFBLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBRWYsSUFBSSxDQUFDO2dCQUNILFFBQVEsR0FBRyxFQUFFLENBQUMsWUFBWSxDQUFDLFNBQVMsQ0FBQyxDQUFDLFFBQVEsRUFBRSxDQUFDO1lBQ25ELENBQUU7WUFBQSxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBRWIsQ0FBQztZQUVELEVBQUUsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUM7Z0JBQUMsUUFBUSxHQUFHLFFBQVEsR0FBRyxJQUFJLENBQUM7WUFFaEQsUUFBUTtnQkFDTixRQUFRLElBQUksTUFBTSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDO3FCQUN2QyxNQUFNLENBQUMsVUFBQSxDQUFDLElBQUksT0FBQSxDQUFDLENBQUMsQ0FBQyxFQUFILENBQUcsQ0FBQztxQkFDaEIsR0FBRyxDQUFDLFVBQUMsSUFBSTtvQkFDUixNQUFNLENBQUMscUNBQWdCLENBQUMsSUFBSSxFQUFFLEtBQUksQ0FBQyxZQUFZLENBQUMsSUFBSSxDQUFRLENBQUMsQ0FBQztnQkFDaEUsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO1lBRWxCLEVBQUUsQ0FBQyxhQUFhLENBQUMsU0FBUyxFQUFFLFFBQVEsQ0FBQyxDQUFDO1lBRXRDLE9BQU8sQ0FBQyxJQUFJLENBQUMsbUNBQW1DLENBQUMsQ0FBQztRQUNwRCxDQUFDO0lBQ0gsQ0FBQztJQUNILFVBQUM7QUFBRCxDQUFDLEFBdm5CRCxJQXVuQkM7QUF2bkJZLFdBQUcsTUF1bkJmLENBQUEiLCJzb3VyY2VzQ29udGVudCI6WyIvLyBOb2RlXG5pbXBvcnQgZnMgPSByZXF1aXJlKCdmcycpO1xuaW1wb3J0IHBhdGggPSByZXF1aXJlKCdwYXRoJyk7XG5pbXBvcnQgdXJsID0gcmVxdWlyZSgndXJsJyk7XG5pbXBvcnQgdXRpbCA9IHJlcXVpcmUoJ3V0aWwnKTtcblxuLy8gTlBNXG5pbXBvcnQganNZYW1sID0gcmVxdWlyZSgnanMteWFtbCcpO1xuaW1wb3J0IF8gPSByZXF1aXJlKCdsb2Rhc2gnKTtcbmltcG9ydCByZXF1ZXN0ID0gcmVxdWlyZSgnc3VwZXJ0ZXN0Jyk7XG5pbXBvcnQgZXhwZWN0ID0gcmVxdWlyZSgnZXhwZWN0Jyk7XG5pbXBvcnQgUkFNTCA9IHJlcXVpcmUoJ3JhbWwtMS1wYXJzZXInKTtcbmNvbnN0IGpzb25zY2hlbWEgPSByZXF1aXJlKCdqc29uc2NoZW1hJyk7XG5jb25zdCBwYXRoTWF0Y2ggPSByZXF1aXJlKCdyYW1sLXBhdGgtbWF0Y2gnKTtcblxuLy8gTG9jYWxzXG5pbXBvcnQgQVRMID0gcmVxdWlyZSgnLi9BVEwnKTtcbmltcG9ydCBBVExIZWxwZXJzID0gcmVxdWlyZSgnLi9BVExIZWxwZXJzJyk7XG5pbXBvcnQgQ292ZXJhZ2UgPSByZXF1aXJlKCcuL0NvdmVyYWdlJyk7XG5pbXBvcnQgeyBnZW5lcmF0ZVN0cmluZyBhcyBjb3ZlcmFnZVRvU3RyaW5nIH0gZnJvbSAnLi4vbGliL1JBTUxDb3ZlcmFnZVJlcG9ydGVyJztcblxuXG5cbmV4cG9ydCBpbnRlcmZhY2UgSUJhdE9wdGlvbnMge1xuICBiYXNlVXJpPzogc3RyaW5nO1xuICB2YXJpYWJsZXM/OiBBVExIZWxwZXJzLklEaWN0aW9uYXJ5PGFueT47XG4gIGZpbGU/OiBzdHJpbmc7XG4gIHJhdz86IHN0cmluZztcbn1cblxuZXhwb3J0IGNsYXNzIEJhdCB7XG4gIHBhdGg6IHN0cmluZztcbiAgZmlsZTogc3RyaW5nO1xuXG4gIGFzdDogQVRMLkFUTDtcblxuICBhZ2VudDogcmVxdWVzdC5TdXBlclRlc3Q7XG5cbiAgcHJpdmF0ZSBfbG9hZGVkOiBGdW5jdGlvbjtcbiAgcHJpdmF0ZSBfbG9hZGVkRmFpbGVkOiBGdW5jdGlvbjtcbiAgbG9hZGVyU2VtYXBob3JlOiBQcm9taXNlPGFueT47XG5cbiAgZGVzY3JpYmU6IGFueSA9IGRlc2NyaWJlO1xuICBpdDogYW55ID0gaXQ7XG5cbiAgY292ZXJhZ2VFbGVtZW50czogQ292ZXJhZ2UuQ292ZXJhZ2VSZXNvdXJjZVtdID0gW107XG5cbiAgY29uc3RydWN0b3IocHVibGljIG9wdGlvbnM6IElCYXRPcHRpb25zID0ge30pIHtcbiAgICB0aGlzLmFzdCA9IG5ldyBBVEwuQVRMKCk7XG5cbiAgICBsZXQgZ290QVNUID0gQVRMSGVscGVycy5mbGF0UHJvbWlzZSgpO1xuXG4gICAgdGhpcy5sb2FkZXJTZW1hcGhvcmUgPSBnb3RBU1QucHJvbWlzZTtcbiAgICB0aGlzLl9sb2FkZWQgPSBnb3RBU1QucmVzb2x2ZXI7XG4gICAgdGhpcy5fbG9hZGVkRmFpbGVkID0gZ290QVNULnJlamVjdGVyO1xuXG4gICAgaWYgKG9wdGlvbnMucmF3KSB7XG4gICAgICB0aGlzLnJhdyhvcHRpb25zLnJhdyk7XG4gICAgfSBlbHNlIGlmICh0aGlzLm9wdGlvbnMuZmlsZSkge1xuICAgICAgdGhpcy5sb2FkKG9wdGlvbnMuZmlsZSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMuY2hlY2tNb2NoYUNvbnRleHQoKVxuICAgICAgICAudGhlbigoKSA9PiB0aGlzLnJ1bigpKTtcbiAgICB9XG4gIH1cblxuICBjaGVja01vY2hhQ29udGV4dCgpIHtcblxuICAgIGxldCBnb3RDb250ZXh0ID0gQVRMSGVscGVycy5mbGF0UHJvbWlzZSgpO1xuXG4gICAgdGhpcy5kZXNjcmliZSgnQ2hlY2tpbmcgbW9jaGEgY29udGV4dCcsIGZ1bmN0aW9uICgpIHtcbiAgICAgIGdvdENvbnRleHQucmVzb2x2ZXIodGhpcy5jdHgpO1xuICAgIH0pO1xuXG4gICAgLy8gY2hlY2sgZm9yIGNvbnRleHQgY29uZmlndXJhdGlvbnNcbiAgICByZXR1cm4gZ290Q29udGV4dC5wcm9taXNlLnRoZW4oY3R4ID0+IHtcbiAgICAgIGlmIChjdHgpIHtcbiAgICAgICAgY3R4ID0gY3R4LmNvbmZpZyB8fCBjdHg7XG5cbiAgICAgICAgaWYgKGN0eC5iYXRGaWxlKSB7XG4gICAgICAgICAgdGhpcy5sb2FkKGN0eC5iYXRGaWxlKTtcbiAgICAgICAgfSBlbHNlIGlmIChjdHgucmF3QmF0KSB7XG4gICAgICAgICAgdGhpcy5yYXcoY3R4LnJhd0JhdCk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoY3R4LmJhc2VVcmkpIHtcbiAgICAgICAgICB0aGlzLm9wdGlvbnMuYmFzZVVyaSA9IGN0eC5iYXNlVXJpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGN0eC52YXJpYWJsZXMpIHtcbiAgICAgICAgICB0aGlzLm9wdGlvbnMudmFyaWFibGVzID0gdGhpcy5vcHRpb25zLnZhcmlhYmxlcyB8fCB7fTtcbiAgICAgICAgICBfLm1lcmdlKHRoaXMub3B0aW9ucy52YXJpYWJsZXMsIGN0eC52YXJpYWJsZXMpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfSk7XG4gIH1cblxuICBwcml2YXRlIHVwZGF0ZVN0YXRlKCkge1xuICAgIGlmICh0aGlzLm9wdGlvbnMudmFyaWFibGVzKSB7XG4gICAgICBfLm1lcmdlKHRoaXMuYXN0Lm9wdGlvbnMudmFyaWFibGVzLCB0aGlzLm9wdGlvbnMudmFyaWFibGVzKTtcbiAgICB9XG5cbiAgICBpZiAodGhpcy5vcHRpb25zLmJhc2VVcmkgJiYgdGhpcy5vcHRpb25zLmJhc2VVcmkgIT0gJ2RlZmF1bHQnKSB7XG4gICAgICB0aGlzLmFzdC5vcHRpb25zLmJhc2VVcmkgPSB0aGlzLm9wdGlvbnMuYmFzZVVyaTtcbiAgICB9XG4gIH1cblxuICBsb2FkKGZpbGU6IHN0cmluZykge1xuICAgIHRoaXMucGF0aCA9IHBhdGguZGlybmFtZShmaWxlKTtcbiAgICBwcm9jZXNzLmNoZGlyKHRoaXMucGF0aCk7XG4gICAgdGhpcy5maWxlID0gZmlsZTtcblxuICAgIHRoaXMucmF3KGZzLnJlYWRGaWxlU3luYyh0aGlzLmZpbGUsICd1dGY4JykpO1xuICB9XG5cbiAgcmF3KGNvbnRlbnQ6IHN0cmluZykge1xuICAgIGxldCBwYXJzZWQgPSBqc1lhbWwubG9hZChjb250ZW50LCB7XG4gICAgICBzY2hlbWE6IEFUTEhlbHBlcnMucG9pbnRlckxpYi5jcmVhdGVTY2hlbWEoKVxuICAgIH0pO1xuXG4gICAgdGhpcy5hc3QuZnJvbU9iamVjdChwYXJzZWQpO1xuXG4gICAgdGhpcy51cGRhdGVTdGF0ZSgpO1xuXG4gICAgdGhpcy5fbG9hZGVkKCk7XG4gIH1cblxuICBydW4oYXBwPykge1xuICAgIHRoaXMuZGVzY3JpYmUodGhpcy5maWxlIHx8ICdodHRwLWJhdCcsICgpID0+IHtcbiAgICAgIGlmICh0aGlzLmFzdC5vcHRpb25zLnNlbGZTaWduZWRDZXJ0KSB7XG4gICAgICAgIHRoaXMuaXQoJ0FsbG93aW5nIHNlbGYgc2lnbmVkIHNlcnZlciBjZXJ0aWZpY2F0ZXMnLCBkb25lID0+IHtcbiAgICAgICAgICBwcm9jZXNzLmVudi5OT0RFX1RMU19SRUpFQ1RfVU5BVVRIT1JJWkVEID0gXCIwXCI7XG4gICAgICAgICAgZG9uZSgpO1xuICAgICAgICB9KTtcbiAgICAgIH1cblxuICAgICAgdGhpcy5pdCgnRW5zdXJlIGJhc2VVcmknLCBkb25lID0+IHtcbiAgICAgICAgaWYgKHRoaXMub3B0aW9ucy5iYXNlVXJpID09ICdkZWZhdWx0JylcbiAgICAgICAgICBkZWxldGUgdGhpcy5vcHRpb25zLmJhc2VVcmk7XG5cbiAgICAgICAgaWYgKCFhcHAgfHwgYXBwID09PSBcImRlZmF1bHRcIiB8fCBhcHAgPT09ICcnKSB7XG4gICAgICAgICAgYXBwID0gdGhpcy5vcHRpb25zLmJhc2VVcmkgfHwgdGhpcy5hc3Qub3B0aW9ucy5iYXNlVXJpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCFhcHApIHtcbiAgICAgICAgICBkb25lKG5ldyBFcnJvcihcImJhc2VVcmkgbm90IHNwZWNpZmllZFwiKSk7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHR5cGVvZiBhcHAgPT09ICdzdHJpbmcnICYmIGFwcC5zdWJzdHIoLTEpID09PSAnLycpIHtcbiAgICAgICAgICBhcHAgPSBhcHAuc3Vic3RyKDAsIGFwcC5sZW5ndGggLSAxKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuYWdlbnQgPSByZXF1ZXN0LmFnZW50KGFwcCk7XG5cbiAgICAgICAgZG9uZSgpO1xuICAgICAgfSk7XG5cbiAgICAgIC8vIFBhcnNlIHRoZSByYW1sIGZvciBjb3ZlcmFnZVxuICAgICAgaWYgKHRoaXMuYXN0LnJhbWwpIHtcbiAgICAgICAgbGV0IHJlc291cmNlcyA9IHRoaXMuYXN0LnJhbWwucmVzb3VyY2VzKCk7XG5cbiAgICAgICAgZm9yIChsZXQgciBpbiByZXNvdXJjZXMpIHtcbiAgICAgICAgICB0aGlzLnBlZWtSZXNvdXJjZShyZXNvdXJjZXNbcl0pO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIC8vIFJ1biBzdWl0ZXNcbiAgICAgIGZvciAobGV0IGsgaW4gdGhpcy5hc3Quc3VpdGVzKSB7XG4gICAgICAgIGxldCBzdWl0ZSA9IHRoaXMuYXN0LnN1aXRlc1trXTtcblxuICAgICAgICB0aGlzLnJ1blN1aXRlKHN1aXRlKTtcbiAgICAgIH1cblxuICAgICAgdGhpcy5lbnN1cmVSYW1sQ292ZXJhZ2UoKTtcbiAgICB9KTtcbiAgfVxuXG4gIHByaXZhdGUgZW5zdXJlUmFtbENvdmVyYWdlKCkge1xuICAgIGlmICh0aGlzLmFzdC5yYW1sKSB7XG4gICAgICB0aGlzLmRlc2NyaWJlKFwiUkFNTCBDb3ZlcmFnZVwiLCAoKSA9PiB7XG4gICAgICAgIHRoaXMuaXQoJ1dhaXQgdGhlIHJlc3VsdHMgYmVmb3JlIHN0YXJ0JywgZG9uZSA9PiB7XG4gICAgICAgICAgUHJvbWlzZS5hbGwodGhpcy5jb3ZlcmFnZUVsZW1lbnRzLm1hcChpdGVtID0+IGl0ZW0ucnVuKCkpKVxuICAgICAgICAgICAgLnRoZW4oKCkgPT4gZG9uZSgpKVxuICAgICAgICAgICAgLmNhdGNoKGVyciA9PiBkb25lKGVycikpO1xuICAgICAgICB9KTtcblxuICAgICAgICBpZiAodGhpcy5hc3Qub3B0aW9ucy5yYW1sLmNvdmVyYWdlKSB7XG4gICAgICAgICAgdGhpcy5jb3ZlcmFnZUVsZW1lbnRzLmZvckVhY2goeCA9PiB4LmluamVjdE1vY2hhVGVzdHMoKSk7XG4gICAgICAgIH1cblxuICAgICAgICBpdCgnUHJpbnQgY292ZXJhZ2UnLCAoZG9uZSkgPT4ge1xuICAgICAgICAgIFByb21pc2UuYWxsKHRoaXMuY292ZXJhZ2VFbGVtZW50cy5tYXAoeCA9PiB4LmdldENvdmVyYWdlKCkpKVxuICAgICAgICAgICAgLnRoZW4oeCA9PiB7XG4gICAgICAgICAgICAgIGxldCB0b3RhbCA9IHgucmVkdWNlKChwcmV2LCBhY3R1YWwpID0+IHtcbiAgICAgICAgICAgICAgICBwcmV2LmVycm9yZWQgKz0gYWN0dWFsLmVycm9yZWQ7XG4gICAgICAgICAgICAgICAgcHJldi50b3RhbCArPSBhY3R1YWwudG90YWw7XG4gICAgICAgICAgICAgICAgcHJldi5ub3RDb3ZlcmVkICs9IGFjdHVhbC5ub3RDb3ZlcmVkO1xuICAgICAgICAgICAgICAgIHJldHVybiBwcmV2O1xuICAgICAgICAgICAgICB9LCB7IHRvdGFsOiAwLCBlcnJvcmVkOiAwLCBub3RDb3ZlcmVkOiAwIH0pO1xuICAgICAgICAgICAgICBjb25zb2xlLmxvZyh1dGlsLmluc3BlY3QodG90YWwsIGZhbHNlLCAyLCB0cnVlKSk7XG4gICAgICAgICAgICAgIGRvbmUoKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICAgIH0pO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgcGVla1Jlc291cmNlKHJlc291cmNlOiBSQU1MLmFwaTA4LlJlc291cmNlIHwgUkFNTC5hcGkxMC5SZXNvdXJjZSwgcGFyZW50Pzogc3RyaW5nKSB7XG4gICAgbGV0IHRoaXNVcmwgPSAocGFyZW50IHx8IFwiXCIpICsgcmVzb3VyY2UucmVsYXRpdmVVcmkoKS52YWx1ZSgpO1xuXG4gICAgdGhpcy5jb3ZlcmFnZUVsZW1lbnRzLnB1c2gobmV3IENvdmVyYWdlLkNvdmVyYWdlUmVzb3VyY2UocmVzb3VyY2UgYXMgYW55LCB0aGlzKSk7XG5cbiAgICBsZXQgcmVzb3VyY2VzID0gcmVzb3VyY2UucmVzb3VyY2VzKCk7XG5cbiAgICBmb3IgKGxldCByIGluIHJlc291cmNlcykge1xuICAgICAgdGhpcy5wZWVrUmVzb3VyY2UocmVzb3VyY2VzW3JdLCB0aGlzVXJsKTtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIHJlZ2lzdGVyVGVzdFJlc3VsdCh0ZXN0OiBBVExIZWxwZXJzLkFUTFRlc3QsIGN0eDoge1xuICAgIHJlcTogcmVxdWVzdC5UZXN0O1xuICAgIHJlczogcmVxdWVzdC5SZXNwb25zZTtcbiAgICB0ZXN0OiBBVExIZWxwZXJzLkFUTFRlc3Q7XG4gICAgdXJsOiBzdHJpbmc7XG4gIH0pIHtcbiAgICBsZXQga2V5ID0gQVRMSGVscGVycy5tYXRjaFVybCh0ZXN0LnVyaSk7XG5cbiAgICB0aGlzLmNvdmVyYWdlRWxlbWVudHMuZm9yRWFjaChjb3ZlcmFnZUVsZW1lbnQgPT4ge1xuICAgICAgaWYgKGNvdmVyYWdlRWxlbWVudC5tYXRjaGVzKGN0eC51cmwpKSB7XG4gICAgICAgIGNvdmVyYWdlRWxlbWVudC5yZXNvbHZlKGN0eC50ZXN0LCBjdHgucmVzKTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfVxuXG5cbiAgcHJpdmF0ZSBydW5TdWl0ZShzdWl0ZTogQVRMSGVscGVycy5BVExTdWl0ZSkge1xuICAgIGxldCBleGVjRm4gPSBzdWl0ZS5za2lwID8gdGhpcy5kZXNjcmliZS5za2lwIDogdGhpcy5kZXNjcmliZTtcblxuICAgIGlmIChzdWl0ZS50ZXN0KSB7XG4gICAgICB0aGlzLnJ1blRlc3Qoc3VpdGUudGVzdCk7XG4gICAgfVxuXG4gICAgbGV0IHRoYXQgPSB0aGlzO1xuXG4gICAgaWYgKHN1aXRlLnN1aXRlcyAmJiBPYmplY3Qua2V5cyhzdWl0ZS5zdWl0ZXMpLmxlbmd0aCkge1xuICAgICAgZXhlY0ZuKHN1aXRlLm5hbWUsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgZm9yIChsZXQgayBpbiBzdWl0ZS5zdWl0ZXMpIHtcbiAgICAgICAgICBsZXQgcyA9IHN1aXRlLnN1aXRlc1trXTtcbiAgICAgICAgICB0aGF0LnJ1blN1aXRlKHMpO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9XG4gIH1cblxuICBvYnRhaW5TY2hlbWFWYWxpZGF0b3Ioc2NoZW1hOiBhbnkpIHtcbiAgICBsZXQgdiA9IG5ldyBqc29uc2NoZW1hLlZhbGlkYXRvcigpO1xuXG4gICAgaWYgKHR5cGVvZiBzY2hlbWEgPT0gXCJzdHJpbmdcIikge1xuICAgICAgaWYgKHNjaGVtYSBpbiB0aGlzLmFzdC5zY2hlbWFzKSB7XG4gICAgICAgIHYuYWRkU2NoZW1hKHRoaXMuYXN0LnNjaGVtYXNbc2NoZW1hXSwgc2NoZW1hKTtcbiAgICAgICAgc2NoZW1hID0gdGhpcy5hc3Quc2NoZW1hc1tzY2hlbWFdO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBzY2hlbWEgPSBKU09OLnBhcnNlKHNjaGVtYSk7XG4gICAgICAgICAgdi5hZGRTY2hlbWEoc2NoZW1hKTtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBzY2hlbWEgPT0gXCJvYmplY3RcIikge1xuICAgICAgdi5hZGRTY2hlbWEoc2NoZW1hKTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIHNjaGVtYSAnICsgdXRpbC5pbnNwZWN0KHNjaGVtYSkpO1xuICAgIH1cblxuICAgIGlmICh2LnVucmVzb2x2ZWRSZWZzICYmIHYudW5yZXNvbHZlZFJlZnMubGVuZ3RoKSB7XG4gICAgICB0aGlzLmRlc2NyaWJlKFwiTG9hZCByZWZlcmVuY2VkIHNjaGVtYXNcIiwgZnVuY3Rpb24gKCkge1xuICAgICAgICB3aGlsZSAodi51bnJlc29sdmVkUmVmcyAmJiB2LnVucmVzb2x2ZWRSZWZzLmxlbmd0aCkge1xuICAgICAgICAgIGxldCBuZXh0U2NoZW1hID0gdi51bnJlc29sdmVkUmVmcy5zaGlmdCgpO1xuICAgICAgICAgIHRoaXMuaXQoXCJsb2FkIHNjaGVtYSBcIiArIG5leHRTY2hlbWEsICgpID0+IHtcbiAgICAgICAgICAgIGxldCB0aGVTY2hlbWEgPSB0aGlzLmFzdC5zY2hlbWFzW25leHRTY2hlbWFdO1xuXG4gICAgICAgICAgICBpZiAoIXRoZVNjaGVtYSlcbiAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwic2NoZW1hIFwiICsgbmV4dFNjaGVtYSArIFwiIG5vdCBmb3VuZFwiKTtcblxuICAgICAgICAgICAgdi5hZGRTY2hlbWEodGhlU2NoZW1hLCBuZXh0U2NoZW1hKTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfVxuXG4gICAgcmV0dXJuIChjb250ZW50KSA9PiB7XG4gICAgICByZXR1cm4gdi52YWxpZGF0ZShjb250ZW50LCBzY2hlbWEpO1xuICAgIH07XG4gIH1cblxuICBwcml2YXRlIHJ1blRlc3QodGVzdDogQVRMSGVscGVycy5BVExUZXN0KSB7XG4gICAgbGV0IGV4ZWNGbiA9IHRlc3Quc2tpcFxuICAgICAgPyB0aGlzLmRlc2NyaWJlLnNraXBcbiAgICAgIDogdGhpcy5kZXNjcmliZTtcblxuICAgIGxldCB0aGF0ID0gdGhpcztcblxuICAgIGxldCByZXF1ZXN0SG9sZGVyID0ge1xuICAgICAgcmVxOiBudWxsIGFzIHJlcXVlc3QuVGVzdCxcbiAgICAgIHJlczogbnVsbCBhcyByZXF1ZXN0LlJlc3BvbnNlLFxuICAgICAgdXJsOiB0ZXN0LnVyaSxcbiAgICAgIGN0eDoge1xuICAgICAgICBSRVFVRVNUOiB7fSBhcyBhbnksXG4gICAgICAgIFJFU1BPTlNFOiB7fSBhcyBhbnlcbiAgICAgIH1cbiAgICB9O1xuXG4gICAgZXhlY0ZuKHRlc3QuZGVzY3JpcHRpb24gfHwgKHRlc3QubWV0aG9kLnRvVXBwZXJDYXNlKCkgKyAnICcgKyB0ZXN0LnVyaSksIGZ1bmN0aW9uICgpIHtcblxuICAgICAgaWYgKHRlc3QudXJpUGFyYW1ldGVycykge1xuICAgICAgICB0aGF0LmRlZmVyZWRJdCgnRW5zdXJlIHVyaVBhcmFtZXRlcnMnKS50aGVuKGZ1bmN0aW9uIChyZXNvbHZlcikge1xuICAgICAgICAgIGZvciAobGV0IGkgaW4gdGVzdC51cmlQYXJhbWV0ZXJzKSB7XG4gICAgICAgICAgICBsZXQgdmFsdWUgPSBudWxsO1xuXG4gICAgICAgICAgICBpZiAodGVzdC51cmlQYXJhbWV0ZXJzW2ldIGluc3RhbmNlb2YgQVRMSGVscGVycy5wb2ludGVyTGliLlBvaW50ZXIpIHtcbiAgICAgICAgICAgICAgdmFsdWUgPSB0ZXN0LnVyaVBhcmFtZXRlcnNbaV0uZ2V0KHRoYXQuYXN0Lm9wdGlvbnMudmFyaWFibGVzKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIHZhbHVlID0gdGVzdC51cmlQYXJhbWV0ZXJzW2ldO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBsZXQgdHlwZU9mVmFsdWUgPSB0eXBlb2YgdmFsdWU7XG5cbiAgICAgICAgICAgIC8qIGlzdGFuYnVsIGlnbm9yZSBpZiAqL1xuICAgICAgICAgICAgaWYgKHR5cGVPZlZhbHVlICE9ICdzdHJpbmcnICYmIHR5cGVPZlZhbHVlICE9ICdudW1iZXInKSB7XG4gICAgICAgICAgICAgIHJlc29sdmVyKFwiT25seSBzdHJpbmdzIGFuZCBudW1iZXJzIGFyZSBhbGxvd2VkIG9uIHVyaVBhcmFtZXRlcnMuIFwiICsgaSArIFwiPVwiICsgdXRpbC5pbnNwZWN0KHZhbHVlKSk7XG4gICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmVxdWVzdEhvbGRlci51cmwgPSByZXF1ZXN0SG9sZGVyLnVybC5yZXBsYWNlKG5ldyBSZWdFeHAoXCJ7XCIgKyBpICsgXCJ9XCIsIFwiZ1wiKSwgZnVuY3Rpb24gKGZ1bGx0ZXh0LCBtYXRjaCkge1xuICAgICAgICAgICAgICByZXR1cm4gZW5jb2RlVVJJQ29tcG9uZW50KHZhbHVlKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXNvbHZlcigpO1xuICAgICAgICB9KTtcbiAgICAgIH1cblxuXG5cbiAgICAgIGxldCBwYXJzZWRVcmwgPSB1cmwucGFyc2UocmVxdWVzdEhvbGRlci51cmwsIHRydWUpO1xuXG4gICAgICBwYXJzZWRVcmwucXVlcnkgPSBwYXJzZWRVcmwucXVlcnkgfHwge307XG5cbiAgICAgIGxldCBuZXdRcyA9IHBhcnNlZFVybC5xdWVyeTtcblxuICAgICAgaWYgKHRlc3QucmVxdWVzdC5xdWVyeVBhcmFtZXRlcnMpIHtcbiAgICAgICAgdGhhdC5kZWZlcmVkSXQoJ0Vuc3VyZSBxdWVyeVBhcmFtZXRlcnMnKS50aGVuKGZ1bmN0aW9uIChyZXNvbHZlcikge1xuICAgICAgICAgIGlmICgnc2VhcmNoJyBpbiBwYXJzZWRVcmwpXG4gICAgICAgICAgICBkZWxldGUgcGFyc2VkVXJsLnNlYXJjaDtcblxuICAgICAgICAgIGxldCBxc1BhcmFtcyA9IEFUTEhlbHBlcnMuY2xvbmVPYmplY3RVc2luZ1BvaW50ZXJzKHRlc3QucmVxdWVzdC5xdWVyeVBhcmFtZXRlcnMsIHRoYXQuYXN0Lm9wdGlvbnMudmFyaWFibGVzKTtcblxuICAgICAgICAgIGZvciAobGV0IGkgaW4gcXNQYXJhbXMpIHtcbiAgICAgICAgICAgIG5ld1FzW2ldID0gcXNQYXJhbXNbaV07XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgcmVxdWVzdEhvbGRlci5jdHguUkVRVUVTVC5xdWVyeVBhcmFtZXRlcnMgPSBxc1BhcmFtcztcblxuICAgICAgICAgIHJlcXVlc3RIb2xkZXIudXJsID0gdXJsLmZvcm1hdChwYXJzZWRVcmwpO1xuXG4gICAgICAgICAgcmVzb2x2ZXIoKTtcbiAgICAgICAgfSk7XG4gICAgICB9XG5cbiAgICAgIHRoYXQuZGVmZXJlZEl0KHRlc3QubWV0aG9kLnRvVXBwZXJDYXNlKCkgKyAnICcgKyByZXF1ZXN0SG9sZGVyLnVybCwgdGVzdC50aW1lb3V0KS50aGVuKGZ1bmN0aW9uIChyZXNvbHZlcikge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIGxldCByZXEgPSByZXF1ZXN0SG9sZGVyLnJlcSA9IHRoYXQuYWdlbnRbdGVzdC5tZXRob2QudG9Mb3dlckNhc2UoKV0ocmVxdWVzdEhvbGRlci51cmwpO1xuXG4gICAgICAgICAgcmVxdWVzdEhvbGRlci5jdHguUkVRVUVTVC5tZXRob2QgPSB0ZXN0Lm1ldGhvZDtcbiAgICAgICAgICByZXF1ZXN0SG9sZGVyLmN0eC5SRVFVRVNULnVybCA9IHJlcXVlc3RIb2xkZXIudXJsO1xuXG4gICAgICAgICAgLy8gd2UgbXVzdCBzZW5kIHNvbWUgZGF0YS4uXG4gICAgICAgICAgaWYgKHRlc3QucmVxdWVzdCkge1xuICAgICAgICAgICAgaWYgKHRlc3QucmVxdWVzdC5oZWFkZXJzKSB7XG4gICAgICAgICAgICAgIHJlcXVlc3RIb2xkZXIuY3R4LlJFUVVFU1QuaGVhZGVycyA9IHt9O1xuICAgICAgICAgICAgICBsZXQgaGVhZGVycyA9IEFUTEhlbHBlcnMuY2xvbmVPYmplY3RVc2luZ1BvaW50ZXJzKHRlc3QucmVxdWVzdC5oZWFkZXJzLCB0aGF0LmFzdC5vcHRpb25zLnZhcmlhYmxlcyk7XG4gICAgICAgICAgICAgIGZvciAobGV0IGggaW4gaGVhZGVycykge1xuXG4gICAgICAgICAgICAgICAgcmVxLnNldChoLCBoZWFkZXJzW2hdID09IHVuZGVmaW5lZCA/ICcnIDogaGVhZGVyc1toXS50b1N0cmluZygpKTtcbiAgICAgICAgICAgICAgICBpZiAodHlwZW9mIHRlc3QucmVxdWVzdC5oZWFkZXJzW2hdID09IFwib2JqZWN0XCIgJiYgdGVzdC5yZXF1ZXN0LmhlYWRlcnNbaF0gaW5zdGFuY2VvZiBBVExIZWxwZXJzLnBvaW50ZXJMaWIuUG9pbnRlciAmJiB0ZXN0LnJlcXVlc3QuaGVhZGVyc1toXS5wYXRoLmluZGV4T2YoXCJFTlZcIikgPT0gMCkge1xuICAgICAgICAgICAgICAgICAgcmVxdWVzdEhvbGRlci5jdHguUkVRVUVTVC5oZWFkZXJzW2hdID0gXCIoVEFLRU4gRlJPTSBcIiArIHRlc3QucmVxdWVzdC5oZWFkZXJzW2hdLnBhdGggKyBcIilcIjtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgcmVxdWVzdEhvbGRlci5jdHguUkVRVUVTVC5oZWFkZXJzW2hdID0gdHlwZW9mIGhlYWRlcnNbaF0gIT0gXCJ1bmRlZmluZWRcIiAmJiBoZWFkZXJzW2hdLnRvU3RyaW5nKCkgfHwgaGVhZGVyc1toXTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKHRlc3QucmVxdWVzdC5qc29uKSB7XG4gICAgICAgICAgICAgIGxldCBkYXRhID0gQVRMSGVscGVycy5jbG9uZU9iamVjdFVzaW5nUG9pbnRlcnModGVzdC5yZXF1ZXN0Lmpzb24sIHRoYXQuYXN0Lm9wdGlvbnMudmFyaWFibGVzKTtcbiAgICAgICAgICAgICAgcmVxdWVzdEhvbGRlci5jdHguUkVRVUVTVC5ib2R5ID0gZGF0YTtcbiAgICAgICAgICAgICAgcmVxLnNlbmQoZGF0YSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmICh0ZXN0LnJlcXVlc3QuYXR0YWNoKSB7XG4gICAgICAgICAgICAgIC8qIGlzdGFuYnVsIGlnbm9yZSBpZiAqL1xuICAgICAgICAgICAgICBpZiAoIXRoYXQucGF0aCkge1xuICAgICAgICAgICAgICAgIHJlc29sdmVyKEFUTEhlbHBlcnMuZXJyb3IoXCJhdHRhY2ggaXMgbm90IGFsbG93ZWQgdXNpbmcgUkFXIGRlZmluaXRpb25zXCIsIHJlcXVlc3RIb2xkZXIuY3R4KSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgZm9yIChsZXQgaSBpbiB0ZXN0LnJlcXVlc3QuYXR0YWNoKSB7XG4gICAgICAgICAgICAgICAgbGV0IGN1cnJlbnRBdHRhY2htZW50ID0gdGVzdC5yZXF1ZXN0LmF0dGFjaFtpXTtcbiAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgcmVxLmF0dGFjaChjdXJyZW50QXR0YWNobWVudC5rZXksIHBhdGgucmVzb2x2ZSh0aGF0LnBhdGgsIGN1cnJlbnRBdHRhY2htZW50LnZhbHVlKSk7XG4gICAgICAgICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgICAgICAgcmVzb2x2ZXIoZSk7XG4gICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmICh0ZXN0LnJlcXVlc3QuZm9ybSkge1xuICAgICAgICAgICAgICByZXEudHlwZSgnZm9ybScpO1xuXG4gICAgICAgICAgICAgIGZvciAobGV0IGkgaW4gdGVzdC5yZXF1ZXN0LmZvcm0pIHtcbiAgICAgICAgICAgICAgICBsZXQgY3VycmVudEF0dGFjaG1lbnQgPSBBVExIZWxwZXJzLmNsb25lT2JqZWN0VXNpbmdQb2ludGVycyh0ZXN0LnJlcXVlc3QuZm9ybVtpXSwgdGhhdC5hc3Qub3B0aW9ucy52YXJpYWJsZXMpO1xuICAgICAgICAgICAgICAgIHJlcS5maWVsZChjdXJyZW50QXR0YWNobWVudC5rZXksIGN1cnJlbnRBdHRhY2htZW50LnZhbHVlKTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAodGVzdC5yZXF1ZXN0LnVybGVuY29kZWQpIHtcbiAgICAgICAgICAgICAgcmVxLnNlbmQoQVRMSGVscGVycy5jbG9uZU9iamVjdFVzaW5nUG9pbnRlcnModGVzdC5yZXF1ZXN0LnVybGVuY29kZWQsIHRoYXQuYXN0Lm9wdGlvbnMudmFyaWFibGVzKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgcmVxLmVuZChmdW5jdGlvbiAoZXJyLCByZXMpIHtcbiAgICAgICAgICAgIHJlcXVlc3RIb2xkZXIucmVzID0gcmVzO1xuICAgICAgICAgICAgcmVxdWVzdEhvbGRlci5jdHguUkVTUE9OU0UgPSByZXM7XG4gICAgICAgICAgICAvKiBpc3RhbmJ1bCBpZ25vcmUgaWY6IHVudGVzdGFibGUgKi9cbiAgICAgICAgICAgIGlmIChlcnIgJiYgZXJyIGluc3RhbmNlb2YgRXJyb3IpIHtcbiAgICAgICAgICAgICAgZXJyID0gQVRMSGVscGVycy5lcnJvcihlcnIubWVzc2FnZSwgcmVxdWVzdEhvbGRlci5jdHgpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXNvbHZlcihlcnIpO1xuXG4gICAgICAgICAgICBpZiAoIWVycikge1xuICAgICAgICAgICAgICB0aGF0LnJlZ2lzdGVyVGVzdFJlc3VsdCh0ZXN0LCB7XG4gICAgICAgICAgICAgICAgcmVxLFxuICAgICAgICAgICAgICAgIHJlcyxcbiAgICAgICAgICAgICAgICB0ZXN0LFxuICAgICAgICAgICAgICAgIHVybDogcmVxdWVzdEhvbGRlci51cmxcbiAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHRlc3QucmVzb2x2ZShyZXMsIGVycik7XG4gICAgICAgICAgfSk7XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICByZXNvbHZlcihlKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG5cblxuICAgICAgZXhlY0ZuKFwiVmFsaWRhdGUgcmVzcG9uc2VcIiwgZnVuY3Rpb24gKCkge1xuICAgICAgICBpZiAodGVzdC5yZXNwb25zZSkge1xuICAgICAgICAgIGlmICh0ZXN0LnJlc3BvbnNlLnN0YXR1cykge1xuICAgICAgICAgICAgdGhhdC5kZWZlcmVkSXQoXCJyZXNwb25zZS5zdGF0dXMgPT0gXCIgKyB0ZXN0LnJlc3BvbnNlLnN0YXR1cywgdGVzdC50aW1lb3V0KS50aGVuKHJlc29sdmVyID0+IHtcbiAgICAgICAgICAgICAgLyogaXN0YW5idWwgaWdub3JlIGVsc2UgKi9cbiAgICAgICAgICAgICAgaWYgKHJlcXVlc3RIb2xkZXIucmVzLnN0YXR1cyA9PSB0ZXN0LnJlc3BvbnNlLnN0YXR1cylcbiAgICAgICAgICAgICAgICByZXNvbHZlcigpO1xuICAgICAgICAgICAgICBlbHNlXG4gICAgICAgICAgICAgICAgcmVzb2x2ZXIoQVRMSGVscGVycy5lcnJvcignZXhwZWN0ZWQgc3RhdHVzIGNvZGUgJyArIHRlc3QucmVzcG9uc2Uuc3RhdHVzICsgJyBnb3QgJyArIHJlcXVlc3RIb2xkZXIucmVzLnN0YXR1cywgcmVxdWVzdEhvbGRlci5jdHgpKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGlmICh0ZXN0LnJlc3BvbnNlLmJvZHkpIHtcbiAgICAgICAgICAgIGlmICgnaXMnIGluIHRlc3QucmVzcG9uc2UuYm9keSkge1xuICAgICAgICAgICAgICB0aGF0LmRlZmVyZWRJdChcInJlc3BvbnNlLmJvZHlcIiwgdGVzdC50aW1lb3V0KS50aGVuKHJlc29sdmVyID0+IHtcbiAgICAgICAgICAgICAgICBsZXQgYm9keUVxdWFscyA9IEFUTEhlbHBlcnMuY2xvbmVPYmplY3RVc2luZ1BvaW50ZXJzKHRlc3QucmVzcG9uc2UuYm9keS5pcywgdGhhdC5hc3Qub3B0aW9ucy52YXJpYWJsZXMpO1xuXG4gICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgIGlmICh0ZXN0LnJlc3BvbnNlLmJvZHkuaXMgJiYgdHlwZW9mIHRlc3QucmVzcG9uc2UuYm9keS5pcyA9PSBcIm9iamVjdFwiICYmIHRlc3QucmVzcG9uc2UuYm9keS5pcyBpbnN0YW5jZW9mIFJlZ0V4cCkge1xuICAgICAgICAgICAgICAgICAgICAvKiBpc3RhbmJ1bCBpZ25vcmUgaWYgKi9cbiAgICAgICAgICAgICAgICAgICAgaWYgKCF0ZXN0LnJlc3BvbnNlLmJvZHkuaXMudGVzdChyZXF1ZXN0SG9sZGVyLnJlcy50ZXh0KSkge1xuICAgICAgICAgICAgICAgICAgICAgIGxldCBhID0gdXRpbC5pbnNwZWN0KGJvZHlFcXVhbHMpO1xuICAgICAgICAgICAgICAgICAgICAgIGxldCBiID0gdXRpbC5pbnNwZWN0KHRlc3QucmVzcG9uc2UuYm9keS5pcyk7XG4gICAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZXIoQVRMSGVscGVycy5lcnJvcignZXhwZWN0ZWQgcmVzcG9uc2UuYm9keSB0byBtYXRjaCAnICsgYSArICcgcmVzcG9uc2UgYm9keSwgZ290ICcgKyBiLCByZXF1ZXN0SG9sZGVyLmN0eCkpO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgIHJlc29sdmVyKCk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIGxldCB0YWtlbkJvZHk7XG4gICAgICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgdGVzdC5yZXNwb25zZS5ib2R5LmlzID09IFwic3RyaW5nXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgICB0YWtlbkJvZHkgPSByZXF1ZXN0SG9sZGVyLnJlcy50ZXh0O1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgIHRha2VuQm9keSA9IHJlcXVlc3RIb2xkZXIucmVzLmJvZHk7XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAvKiBpc3RhbmJ1bCBpZ25vcmUgaWYgKi9cbiAgICAgICAgICAgICAgICAgICAgaWYgKCFfLmlzRXF1YWwoYm9keUVxdWFscywgdGFrZW5Cb2R5KSkge1xuICAgICAgICAgICAgICAgICAgICAgIGxldCBhID0gdXRpbC5pbnNwZWN0KGJvZHlFcXVhbHMpO1xuICAgICAgICAgICAgICAgICAgICAgIGxldCBiID0gdXRpbC5pbnNwZWN0KHRha2VuQm9keSk7XG4gICAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZXIoQVRMSGVscGVycy5lcnJvckRpZmYoJ2V4cGVjdGVkICcgKyBhICsgJyByZXNwb25zZSBib2R5LCBnb3QgJyArIGIsIGJvZHlFcXVhbHMsIHRha2VuQm9keSwgcmVxdWVzdEhvbGRlci5jdHgpKTtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICByZXNvbHZlcigpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgICAgICAgcmVzb2x2ZXIoZSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKHRlc3QucmVzcG9uc2UuYm9keS5zY2hlbWEpIHtcbiAgICAgICAgICAgICAgbGV0IHYgPSB0aGF0Lm9idGFpblNjaGVtYVZhbGlkYXRvcih0ZXN0LnJlc3BvbnNlLmJvZHkuc2NoZW1hKTtcblxuICAgICAgICAgICAgICB0aGF0LmRlZmVyZWRJdChcInJlc3BvbnNlLmJvZHkgc2NoZW1hXCIsIHRlc3QudGltZW91dCkudGhlbihyZXNvbHZlciA9PiB7XG4gICAgICAgICAgICAgICAgbGV0IHZhbGlkYXRpb25SZXN1bHQgPSB2KHJlcXVlc3RIb2xkZXIucmVzLmJvZHkpO1xuICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICBpZiAodmFsaWRhdGlvblJlc3VsdC52YWxpZCkge1xuICAgICAgICAgICAgICAgICAgICByZXNvbHZlcigpO1xuICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgbGV0IGVycm9ycyA9IFtcIlNjaGVtYSBlcnJvcjpcIl07XG4gICAgICAgICAgICAgICAgICAgIHZhbGlkYXRpb25SZXN1bHQuZXJyb3JzICYmIHZhbGlkYXRpb25SZXN1bHQuZXJyb3JzLmZvckVhY2goeCA9PiBlcnJvcnMucHVzaChcIiAgXCIgKyB4LnN0YWNrKSk7XG5cbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZXIoQVRMSGVscGVycy5lcnJvcihlcnJvcnMuam9pbignXFxuJykgfHwgXCJJbnZhbGlkIHNjaGVtYVwiLCByZXF1ZXN0SG9sZGVyLmN0eCkpO1xuICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgICAgICAgIHJlc29sdmVyKGUpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmICh0ZXN0LnJlc3BvbnNlLmJvZHkubWF0Y2hlcykge1xuICAgICAgICAgICAgICB0ZXN0LnJlc3BvbnNlLmJvZHkubWF0Y2hlcy5mb3JFYWNoKGt2byA9PiB7XG4gICAgICAgICAgICAgICAgdGhhdC5kZWZlcmVkSXQoXCJyZXNwb25zZS5ib2R5OjpcIiArIGt2by5rZXksIHRlc3QudGltZW91dCkudGhlbihyZXNvbHZlciA9PiB7XG4gICAgICAgICAgICAgICAgICBsZXQgdmFsdWU6IGFueSA9IEFUTEhlbHBlcnMuY2xvbmVPYmplY3RVc2luZ1BvaW50ZXJzKGt2by52YWx1ZSwgdGhhdC5hc3Qub3B0aW9ucy52YXJpYWJsZXMpO1xuXG4gICAgICAgICAgICAgICAgICBsZXQgcmVhZGVkID0gXy5nZXQocmVxdWVzdEhvbGRlci5yZXMuYm9keSwga3ZvLmtleSk7XG5cbiAgICAgICAgICAgICAgICAgIC8qIGlzdGFuYnVsIGlnbm9yZSBpZiAqL1xuICAgICAgICAgICAgICAgICAgaWYgKFxuICAgICAgICAgICAgICAgICAgICAoISh2YWx1ZSBpbnN0YW5jZW9mIFJlZ0V4cCkgJiYgIV8uaXNFcXVhbChyZWFkZWQsIHZhbHVlKSlcbiAgICAgICAgICAgICAgICAgICAgfHxcbiAgICAgICAgICAgICAgICAgICAgKCh2YWx1ZSBpbnN0YW5jZW9mIFJlZ0V4cCkgJiYgIXZhbHVlLnRlc3QocmVhZGVkKSlcbiAgICAgICAgICAgICAgICAgICkge1xuICAgICAgICAgICAgICAgICAgICByZXNvbHZlcihBVExIZWxwZXJzLmVycm9yRGlmZignZXhwZWN0ZWQgcmVzcG9uc2UuYm9keTo6JyArIGt2by5rZXkgKyAnIHRvIGJlICcgKyB1dGlsLmluc3BlY3QodmFsdWUpICsgJyBnb3QgJyArIHV0aWwuaW5zcGVjdChyZWFkZWQpLCB2YWx1ZSwgcmVhZGVkLCByZXF1ZXN0SG9sZGVyLmN0eCkpO1xuICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZXIoKTtcbiAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKHRlc3QucmVzcG9uc2UuYm9keS50YWtlKSB7XG4gICAgICAgICAgICAgIGxldCB0YWtlID0gdGVzdC5yZXNwb25zZS5ib2R5LnRha2U7XG5cbiAgICAgICAgICAgICAgdGFrZS5mb3JFYWNoKGZ1bmN0aW9uICh0YWtlbkVsZW1lbnQpIHtcbiAgICAgICAgICAgICAgICB0aGF0LmRlZmVyZWRJdChcInJlc3BvbnNlLmJvZHk6OlwiICsgdGFrZW5FbGVtZW50LmtleSArIFwiID4+ICEhdmFyaWFibGVzIFwiICsgdGFrZW5FbGVtZW50LnZhbHVlLnBhdGgsIHRlc3QudGltZW91dCkudGhlbihyZXNvbHZlciA9PiB7XG4gICAgICAgICAgICAgICAgICBsZXQgdGFrZW5WYWx1ZSA9IF8uZ2V0KHJlcXVlc3RIb2xkZXIucmVzLmJvZHksIHRha2VuRWxlbWVudC5rZXkpO1xuICAgICAgICAgICAgICAgICAgdGFrZW5FbGVtZW50LnZhbHVlLnNldCh0aGF0LmFzdC5vcHRpb25zLnZhcmlhYmxlcywgdGFrZW5WYWx1ZSk7XG4gICAgICAgICAgICAgICAgICByZXNvbHZlcigpO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKHRlc3QucmVzcG9uc2UuYm9keS5jb3B5VG8gJiYgdGVzdC5yZXNwb25zZS5ib2R5LmNvcHlUbyBpbnN0YW5jZW9mIEFUTEhlbHBlcnMucG9pbnRlckxpYi5Qb2ludGVyKSB7XG4gICAgICAgICAgICAgIHRoYXQuZGVmZXJlZEl0KFwicmVzcG9uc2UuYm9keSA+PiAhIXZhcmlhYmxlcyBcIiArIHRlc3QucmVzcG9uc2UuYm9keS5jb3B5VG8ucGF0aCwgdGVzdC50aW1lb3V0KS50aGVuKHJlc29sdmVyID0+IHtcbiAgICAgICAgICAgICAgICB0ZXN0LnJlc3BvbnNlLmJvZHkuY29weVRvLnNldCh0aGF0LmFzdC5vcHRpb25zLnZhcmlhYmxlcywgcmVxdWVzdEhvbGRlci5yZXMuYm9keSk7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZXIoKTtcbiAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmICh0ZXN0LnJlc3BvbnNlLmhlYWRlcnMpIHtcbiAgICAgICAgICAgICAgbGV0IGhlYWRlcnMgPSBBVExIZWxwZXJzLmNsb25lT2JqZWN0VXNpbmdQb2ludGVycyh0ZXN0LnJlc3BvbnNlLmhlYWRlcnMsIHRoYXQub3B0aW9ucy52YXJpYWJsZXMpO1xuXG4gICAgICAgICAgICAgIGZvciAobGV0IGggaW4gaGVhZGVycykge1xuICAgICAgICAgICAgICAgIGlmIChoICE9PSAnY29udGVudC10eXBlJykge1xuICAgICAgICAgICAgICAgICAgaGVhZGVyc1toXSA9IGhlYWRlcnNbaF0udG9TdHJpbmcoKTtcblxuICAgICAgICAgICAgICAgICAgdGhhdC5kZWZlcmVkSXQoXCJyZXNwb25zZS5oZWFkZXI6OlwiICsgaCwgdGVzdC50aW1lb3V0KS50aGVuKHJlc29sdmUgPT4ge1xuICAgICAgICAgICAgICAgICAgICBsZXQgdmFsdWUgPSByZXF1ZXN0SG9sZGVyLnJlcy5nZXQoaC50b0xvd2VyQ2FzZSgpKTtcblxuICAgICAgICAgICAgICAgICAgICAvKiBpc3RhbmJ1bCBpZ25vcmUgaWYgKi9cbiAgICAgICAgICAgICAgICAgICAgaWYgKGhlYWRlcnNbaF0gIT0gdmFsdWUpIHtcbiAgICAgICAgICAgICAgICAgICAgICBsZXQgYSA9IHV0aWwuaW5zcGVjdChoZWFkZXJzW2hdKTtcbiAgICAgICAgICAgICAgICAgICAgICBsZXQgYiA9IHV0aWwuaW5zcGVjdCh2YWx1ZSk7XG4gICAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZShBVExIZWxwZXJzLmVycm9yRGlmZignZXhwZWN0ZWQgcmVzcG9uc2UuaGVhZGVyOjonICsgaCArICcgdG8gYmUgJyArIGEgKyAnIGdvdCAnICsgYiwgaGVhZGVyc1toXSwgdmFsdWUsIHJlcXVlc3RIb2xkZXIuY3R4KSk7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZSgpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gIH1cblxuICBkZWZlcmVkSXQobmFtZTogc3RyaW5nLCB0aW1lb3V0PzogbnVtYmVyKTogUHJvbWlzZTwoZXJyPykgPT4gdm9pZD4ge1xuICAgIGxldCBmaWxsID0gbnVsbDtcblxuICAgIGxldCBwcm9tID0gQVRMSGVscGVycy5mbGF0UHJvbWlzZSgpO1xuXG4gICAgdGhpcy5pdChuYW1lLCBmdW5jdGlvbiAoZG9uZSkge1xuICAgICAgaWYgKHRpbWVvdXQpXG4gICAgICAgIHRoaXMudGltZW91dCh0aW1lb3V0KTtcblxuICAgICAgcHJvbS5yZXNvbHZlci5jYWxsKHRoaXMsIGZ1bmN0aW9uIChyZXQpIHtcbiAgICAgICAgLyogaXN0YW5idWwgaWdub3JlIGlmICovXG4gICAgICAgIGlmIChyZXQpIHtcbiAgICAgICAgICBpZiAoZG9uZS5mYWlsKVxuICAgICAgICAgICAgZG9uZS5mYWlsKHJldCk7XG4gICAgICAgICAgZWxzZVxuICAgICAgICAgICAgZG9uZShyZXQpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGRvbmUoKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG5cbiAgICAgIHByb20ucHJvbWlzZS5jYXRjaChkb25lKTtcbiAgICB9KTtcblxuICAgIHJldHVybiBwcm9tLnByb21pc2U7XG4gIH1cblxuICBjb3ZlcmFnZURhdGE6IEFUTEhlbHBlcnMuSURpY3Rpb25hcnk8e1xuICAgIHNvdXJjZTogQXJyYXk8bnVtYmVyIHwgdm9pZD47XG4gIH0+ID0ge307XG5cbiAgd3JpdGVDb3ZlcmFnZShjb3ZlckZpbGU6IHN0cmluZykge1xuICAgIGxldCBjd2QgPSBwYXRoLmRpcm5hbWUoY292ZXJGaWxlKTtcblxuICAgIGlmICh0aGlzLmNvdmVyYWdlRGF0YSAmJiBPYmplY3Qua2V5cyh0aGlzLmNvdmVyYWdlRGF0YSkubGVuZ3RoKSB7XG4gICAgICBjb25zb2xlLmluZm8oXCJXcml0aW5nIGNvdmVyYWdlIGluZm9ybWF0aW9uOiBcIiArIGNvdmVyRmlsZSk7XG5cbiAgICAgIGxldCBjb3ZlcmFnZSA9ICcnO1xuXG4gICAgICB0cnkge1xuICAgICAgICBmcy5ta2RpclN5bmMoY3dkKTtcbiAgICAgIH0gY2F0Y2ggKGUpIHsgfVxuXG4gICAgICB0cnkge1xuICAgICAgICBjb3ZlcmFnZSA9IGZzLnJlYWRGaWxlU3luYyhjb3ZlckZpbGUpLnRvU3RyaW5nKCk7XG4gICAgICB9IGNhdGNoIChlKSB7XG5cbiAgICAgIH1cblxuICAgICAgaWYgKGNvdmVyYWdlLmxlbmd0aCkgY292ZXJhZ2UgPSBjb3ZlcmFnZSArICdcXG4nO1xuXG4gICAgICBjb3ZlcmFnZSA9XG4gICAgICAgIGNvdmVyYWdlICs9IE9iamVjdC5rZXlzKHRoaXMuY292ZXJhZ2VEYXRhKVxuICAgICAgICAgIC5maWx0ZXIoeCA9PiAhIXgpXG4gICAgICAgICAgLm1hcCgoZmlsZSkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIGNvdmVyYWdlVG9TdHJpbmcoZmlsZSwgdGhpcy5jb3ZlcmFnZURhdGFbZmlsZV0gYXMgYW55KTtcbiAgICAgICAgICB9KS5qb2luKCdcXG4nKTtcblxuICAgICAgZnMud3JpdGVGaWxlU3luYyhjb3ZlckZpbGUsIGNvdmVyYWdlKTtcblxuICAgICAgY29uc29sZS5pbmZvKFwiV3JpdGluZyBjb3ZlcmFnZSBpbmZvcm1hdGlvbi4gT0shXCIpO1xuICAgIH1cbiAgfVxufVxuXG4iXX0=