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
        if (suite.test) {
            this.runTest(suite.test);
        }
        var that = this;
        if (suite.suites && Object.keys(suite.suites).length) {
            execFn(suite.name, function () {
                this.bail && this.bail(true);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYmF0LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiYmF0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQSxPQUFPO0FBQ1AsSUFBTyxFQUFFLFdBQVcsSUFBSSxDQUFDLENBQUM7QUFDMUIsSUFBTyxJQUFJLFdBQVcsTUFBTSxDQUFDLENBQUM7QUFDOUIsSUFBTyxHQUFHLFdBQVcsS0FBSyxDQUFDLENBQUM7QUFDNUIsSUFBTyxJQUFJLFdBQVcsTUFBTSxDQUFDLENBQUM7QUFFOUIsTUFBTTtBQUNOLElBQU8sTUFBTSxXQUFXLFNBQVMsQ0FBQyxDQUFDO0FBQ25DLElBQU8sQ0FBQyxXQUFXLFFBQVEsQ0FBQyxDQUFDO0FBQzdCLElBQU8sT0FBTyxXQUFXLFdBQVcsQ0FBQyxDQUFDO0FBR3RDLElBQU0sVUFBVSxHQUFHLE9BQU8sQ0FBQyxZQUFZLENBQUMsQ0FBQztBQUN6QyxJQUFNLFNBQVMsR0FBRyxPQUFPLENBQUMsaUJBQWlCLENBQUMsQ0FBQztBQUU3QyxTQUFTO0FBQ1QsSUFBTyxHQUFHLFdBQVcsT0FBTyxDQUFDLENBQUM7QUFDOUIsSUFBTyxVQUFVLFdBQVcsY0FBYyxDQUFDLENBQUM7QUFDNUMsSUFBTyxRQUFRLFdBQVcsWUFBWSxDQUFDLENBQUM7QUFDeEMscUNBQW1ELDZCQUE2QixDQUFDLENBQUE7QUFXakY7SUFpQkUsYUFBbUIsT0FBeUI7UUFqQjlDLGlCQXlvQkM7UUF4bkJhLHVCQUFnQyxHQUFoQyxZQUFnQztRQUF6QixZQUFPLEdBQVAsT0FBTyxDQUFrQjtRQUw1QyxhQUFRLEdBQVEsUUFBUSxDQUFDO1FBQ3pCLE9BQUUsR0FBUSxFQUFFLENBQUM7UUFFYixxQkFBZ0IsR0FBZ0MsRUFBRSxDQUFDO1FBc2xCbkQsaUJBQVksR0FFUCxFQUFFLENBQUM7UUFybEJOLElBQUksQ0FBQyxHQUFHLEdBQUcsSUFBSSxHQUFHLENBQUMsR0FBRyxFQUFFLENBQUM7UUFFekIsSUFBSSxNQUFNLEdBQUcsVUFBVSxDQUFDLFdBQVcsRUFB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USxJQUFJLE1BQU0sQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQztxQkFDdkMsTUFBTSxDQUFDLFVBQUEsQ0FBQyxJQUFJLE9BQUEsQ0FBQyxDQUFDLENBQUMsRUFBSCxDQUFHLENBQUM7cUJBQ2hCLEdBQUcsQ0FBQyxVQUFDLElBQUk7b0JBQ1IsTUFBTSxDQUFDLHFDQUFnQixDQUFDLElBQUksRUFBRSxLQUFJLENBQUMsWUFBWSxDQUFDLElBQUksQ0FBUSxDQUFDLENBQUM7Z0JBQ2hFLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUVsQixFQUFFLENBQUMsYUFBYSxDQUFDLFNBQVMsRUFBRSxRQUFRLENBQUMsQ0FBQztZQUV0QyxPQUFPLENBQUMsSUFBSSxDQUFDLG1DQUFtQyxDQUFDLENBQUM7UUFDcEQsQ0FBQztJQUNILENBQUM7SUFDSCxVQUFDO0FBQUQsQ0FBQyxBQXpvQkQsSUF5b0JDO0FBem9CWSxXQUFHLE1BeW9CZixDQUFBIiwic291cmNlc0NvbnRlbnQiOlsiLy8gTm9kZVxuaW1wb3J0IGZzID0gcmVxdWlyZSgnZnMnKTtcbmltcG9ydCBwYXRoID0gcmVxdWlyZSgncGF0aCcpO1xuaW1wb3J0IHVybCA9IHJlcXVpcmUoJ3VybCcpO1xuaW1wb3J0IHV0aWwgPSByZXF1aXJlKCd1dGlsJyk7XG5cbi8vIE5QTVxuaW1wb3J0IGpzWWFtbCA9IHJlcXVpcmUoJ2pzLXlhbWwnKTtcbmltcG9ydCBfID0gcmVxdWlyZSgnbG9kYXNoJyk7XG5pbXBvcnQgcmVxdWVzdCA9IHJlcXVpcmUoJ3N1cGVydGVzdCcpO1xuaW1wb3J0IGV4cGVjdCA9IHJlcXVpcmUoJ2V4cGVjdCcpO1xuaW1wb3J0IFJBTUwgPSByZXF1aXJlKCdyYW1sLTEtcGFyc2VyJyk7XG5jb25zdCBqc29uc2NoZW1hID0gcmVxdWlyZSgnanNvbnNjaGVtYScpO1xuY29uc3QgcGF0aE1hdGNoID0gcmVxdWlyZSgncmFtbC1wYXRoLW1hdGNoJyk7XG5cbi8vIExvY2Fsc1xuaW1wb3J0IEFUTCA9IHJlcXVpcmUoJy4vQVRMJyk7XG5pbXBvcnQgQVRMSGVscGVycyA9IHJlcXVpcmUoJy4vQVRMSGVscGVycycpO1xuaW1wb3J0IENvdmVyYWdlID0gcmVxdWlyZSgnLi9Db3ZlcmFnZScpO1xuaW1wb3J0IHsgZ2VuZXJhdGVTdHJpbmcgYXMgY292ZXJhZ2VUb1N0cmluZyB9IGZyb20gJy4uL2xpYi9SQU1MQ292ZXJhZ2VSZXBvcnRlcic7XG5cblxuXG5leHBvcnQgaW50ZXJmYWNlIElCYXRPcHRpb25zIHtcbiAgYmFzZVVyaT86IHN0cmluZztcbiAgdmFyaWFibGVzPzogQVRMSGVscGVycy5JRGljdGlvbmFyeTxhbnk+O1xuICBmaWxlPzogc3RyaW5nO1xuICByYXc/OiBzdHJpbmc7XG59XG5cbmV4cG9ydCBjbGFzcyBCYXQge1xuICBwYXRoOiBzdHJpbmc7XG4gIGZpbGU6IHN0cmluZztcblxuICBhc3Q6IEFUTC5BVEw7XG5cbiAgYWdlbnQ6IHJlcXVlc3QuU3VwZXJUZXN0O1xuXG4gIHByaXZhdGUgX2xvYWRlZDogRnVuY3Rpb247XG4gIHByaXZhdGUgX2xvYWRlZEZhaWxlZDogRnVuY3Rpb247XG4gIGxvYWRlclNlbWFwaG9yZTogUHJvbWlzZTxhbnk+O1xuXG4gIGRlc2NyaWJlOiBhbnkgPSBkZXNjcmliZTtcbiAgaXQ6IGFueSA9IGl0O1xuXG4gIGNvdmVyYWdlRWxlbWVudHM6IENvdmVyYWdlLkNvdmVyYWdlUmVzb3VyY2VbXSA9IFtdO1xuXG4gIGNvbnN0cnVjdG9yKHB1YmxpYyBvcHRpb25zOiBJQmF0T3B0aW9ucyA9IHt9KSB7XG4gICAgdGhpcy5hc3QgPSBuZXcgQVRMLkFUTCgpO1xuXG4gICAgbGV0IGdvdEFTVCA9IEFUTEhlbHBlcnMuZmxhdFByb21pc2UoKTtcblxuICAgIHRoaXMubG9hZGVyU2VtYXBob3JlID0gZ290QVNULnByb21pc2U7XG4gICAgdGhpcy5fbG9hZGVkID0gZ290QVNULnJlc29sdmVyO1xuICAgIHRoaXMuX2xvYWRlZEZhaWxlZCA9IGdvdEFTVC5yZWplY3RlcjtcblxuICAgIGlmIChvcHRpb25zLnJhdykge1xuICAgICAgdGhpcy5yYXcob3B0aW9ucy5yYXcpO1xuICAgIH0gZWxzZSBpZiAodGhpcy5vcHRpb25zLmZpbGUpIHtcbiAgICAgIHRoaXMubG9hZChvcHRpb25zLmZpbGUpO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aGlzLmNoZWNrTW9jaGFDb250ZXh0KClcbiAgICAgICAgLnRoZW4oKCkgPT4gdGhpcy5ydW4oKSk7XG4gICAgfVxuICB9XG5cbiAgY2hlY2tNb2NoYUNvbnRleHQoKSB7XG5cbiAgICBsZXQgZ290Q29udGV4dCA9IEFUTEhlbHBlcnMuZmxhdFByb21pc2UoKTtcblxuICAgIHRoaXMuZGVzY3JpYmUoJ0NoZWNraW5nIG1vY2hhIGNvbnRleHQnLCBmdW5jdGlvbiAoKSB7XG4gICAgICBnb3RDb250ZXh0LnJlc29sdmVyKHRoaXMuY3R4KTtcbiAgICB9KTtcblxuICAgIC8vIGNoZWNrIGZvciBjb250ZXh0IGNvbmZpZ3VyYXRpb25zXG4gICAgcmV0dXJuIGdvdENvbnRleHQucHJvbWlzZS50aGVuKGN0eCA9PiB7XG4gICAgICBpZiAoY3R4KSB7XG4gICAgICAgIGN0eCA9IGN0eC5jb25maWcgfHwgY3R4O1xuXG4gICAgICAgIGlmIChjdHguYmF0RmlsZSkge1xuICAgICAgICAgIHRoaXMubG9hZChjdHguYmF0RmlsZSk7XG4gICAgICAgIH0gZWxzZSBpZiAoY3R4LnJhd0JhdCkge1xuICAgICAgICAgIHRoaXMucmF3KGN0eC5yYXdCYXQpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGN0eC5iYXNlVXJpKSB7XG4gICAgICAgICAgdGhpcy5vcHRpb25zLmJhc2VVcmkgPSBjdHguYmFzZVVyaTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChjdHgudmFyaWFibGVzKSB7XG4gICAgICAgICAgdGhpcy5vcHRpb25zLnZhcmlhYmxlcyA9IHRoaXMub3B0aW9ucy52YXJpYWJsZXMgfHwge307XG4gICAgICAgICAgXy5tZXJnZSh0aGlzLm9wdGlvbnMudmFyaWFibGVzLCBjdHgudmFyaWFibGVzKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0pO1xuICB9XG5cbiAgcHJpdmF0ZSB1cGRhdGVTdGF0ZSgpIHtcbiAgICBpZiAodGhpcy5vcHRpb25zLnZhcmlhYmxlcykge1xuICAgICAgXy5tZXJnZSh0aGlzLmFzdC5vcHRpb25zLnZhcmlhYmxlcywgdGhpcy5vcHRpb25zLnZhcmlhYmxlcyk7XG4gICAgfVxuXG4gICAgaWYgKHRoaXMub3B0aW9ucy5iYXNlVXJpICYmIHRoaXMub3B0aW9ucy5iYXNlVXJpICE9ICdkZWZhdWx0Jykge1xuICAgICAgdGhpcy5hc3Qub3B0aW9ucy5iYXNlVXJpID0gdGhpcy5vcHRpb25zLmJhc2VVcmk7XG4gICAgfVxuICB9XG5cbiAgbG9hZChmaWxlOiBzdHJpbmcpIHtcbiAgICB0aGlzLnBhdGggPSBwYXRoLmRpcm5hbWUoZmlsZSk7XG4gICAgcHJvY2Vzcy5jaGRpcih0aGlzLnBhdGgpO1xuICAgIHRoaXMuZmlsZSA9IGZpbGU7XG5cbiAgICB0aGlzLnJhdyhmcy5yZWFkRmlsZVN5bmModGhpcy5maWxlLCAndXRmOCcpKTtcbiAgfVxuXG4gIHJhdyhjb250ZW50OiBzdHJpbmcpIHtcbiAgICB0cnkge1xuICAgICAgbGV0IHBhcnNlZCA9IGpzWWFtbC5sb2FkKGNvbnRlbnQsIHtcbiAgICAgICAgc2NoZW1hOiBBVExIZWxwZXJzLnBvaW50ZXJMaWIuY3JlYXRlU2NoZW1hKClcbiAgICAgIH0pO1xuXG4gICAgICB0aGlzLmFzdC5mcm9tT2JqZWN0KHBhcnNlZCk7XG5cbiAgICAgIHRoaXMudXBkYXRlU3RhdGUoKTtcblxuICAgICAgdGhpcy5fbG9hZGVkKCk7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgaWYgKHRoaXMub3B0aW9ucy5maWxlKVxuICAgICAgICBlLm1lc3NhZ2UgPSB0aGlzLm9wdGlvbnMuZmlsZSArICdcXG4nICsgZS5tZXNzYWdlO1xuXG4gICAgICB0aHJvdyBlO1xuICAgIH1cbiAgfVxuXG4gIHJ1bihhcHA/KTogUHJvbWlzZTxCYXQ+IHtcbiAgICBsZXQgcHJvbSA9IEFUTEhlbHBlcnMuZmxhdFByb21pc2UoKTtcblxuICAgIHRoaXMuZGVzY3JpYmUodGhpcy5maWxlIHx8ICdodHRwLWJhdCcsICgpID0+IHtcbiAgICAgIGlmICh0aGlzLmFzdC5vcHRpb25zLnNlbGZTaWduZWRDZXJ0KSB7XG4gICAgICAgIHRoaXMuaXQoJ0FsbG93aW5nIHNlbGYgc2lnbmVkIHNlcnZlciBjZXJ0aWZpY2F0ZXMnLCBkb25lID0+IHtcbiAgICAgICAgICBwcm9jZXNzLmVudi5OT0RFX1RMU19SRUpFQ1RfVU5BVVRIT1JJWkVEID0gXCIwXCI7XG4gICAgICAgICAgZG9uZSgpO1xuICAgICAgICB9KTtcbiAgICAgIH1cblxuICAgICAgdGhpcy5pdCgnRW5zdXJlIGJhc2VVcmknLCBkb25lID0+IHtcbiAgICAgICAgaWYgKHRoaXMub3B0aW9ucy5iYXNlVXJpID09ICdkZWZhdWx0JylcbiAgICAgICAgICBkZWxldGUgdGhpcy5vcHRpb25zLmJhc2VVcmk7XG5cbiAgICAgICAgaWYgKCFhcHAgfHwgYXBwID09PSBcImRlZmF1bHRcIiB8fCBhcHAgPT09ICcnKSB7XG4gICAgICAgICAgYXBwID0gdGhpcy5vcHRpb25zLmJhc2VVcmkgfHwgdGhpcy5hc3Qub3B0aW9ucy5iYXNlVXJpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCFhcHApIHtcbiAgICAgICAgICBkb25lKG5ldyBFcnJvcihcImJhc2VVcmkgbm90IHNwZWNpZmllZFwiKSk7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHR5cGVvZiBhcHAgPT09ICdzdHJpbmcnICYmIGFwcC5zdWJzdHIoLTEpID09PSAnLycpIHtcbiAgICAgICAgICBhcHAgPSBhcHAuc3Vic3RyKDAsIGFwcC5sZW5ndGggLSAxKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuYWdlbnQgPSByZXF1ZXN0LmFnZW50KGFwcCk7XG5cbiAgICAgICAgZG9uZSgpO1xuICAgICAgfSk7XG5cbiAgICAgIC8vIFBhcnNlIHRoZSByYW1sIGZvciBjb3ZlcmFnZVxuICAgICAgaWYgKHRoaXMuYXN0LnJhbWwpIHtcbiAgICAgICAgbGV0IHJlc291cmNlcyA9IHRoaXMuYXN0LnJhbWwucmVzb3VyY2VzKCk7XG5cbiAgICAgICAgZm9yIChsZXQgciBpbiByZXNvdXJjZXMpIHtcbiAgICAgICAgICB0aGlzLnBlZWtSZXNvdXJjZShyZXNvdXJjZXNbcl0pO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIC8vIFJ1biBzdWl0ZXNcbiAgICAgIGZvciAobGV0IGsgaW4gdGhpcy5hc3Quc3VpdGVzKSB7XG4gICAgICAgIGxldCBzdWl0ZSA9IHRoaXMuYXN0LnN1aXRlc1trXTtcblxuICAgICAgICB0aGlzLnJ1blN1aXRlKHN1aXRlKTtcbiAgICAgIH1cblxuICAgICAgdGhpcy5lbnN1cmVSYW1sQ292ZXJhZ2UoKTtcblxuICAgICAgdGhpcy5kZWZlcmVkSXQoJ0ZpbmFsaXplIEFUTCBEb2N1bWVudCcpLnRoZW4oZG9uZSA9PiB7XG4gICAgICAgIHByb20ucmVzb2x2ZXIoKTtcblxuICAgICAgICBkb25lKCk7XG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIHJldHVybiBwcm9tLnByb21pc2U7XG4gIH1cblxuICBwcml2YXRlIGVuc3VyZVJhbWxDb3ZlcmFnZSgpIHtcbiAgICBpZiAodGhpcy5hc3QucmFtbCkge1xuICAgICAgdGhpcy5kZXNjcmliZShcIlJBTUwgQ292ZXJhZ2VcIiwgKCkgPT4ge1xuICAgICAgICB0aGlzLml0KCdXYWl0IHRoZSByZXN1bHRzIGJlZm9yZSBzdGFydCcsIGRvbmUgPT4ge1xuICAgICAgICAgIFByb21pc2UuYWxsKHRoaXMuY292ZXJhZ2VFbGVtZW50cy5tYXAoaXRlbSA9PiBpdGVtLnJ1bigpKSlcbiAgICAgICAgICAgIC50aGVuKCgpID0+IGRvbmUoKSlcbiAgICAgICAgICAgIC5jYXRjaChlcnIgPT4gZG9uZShlcnIpKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgaWYgKHRoaXMuYXN0Lm9wdGlvbnMucmFtbC5jb3ZlcmFnZSkge1xuICAgICAgICAgIHRoaXMuY292ZXJhZ2VFbGVtZW50cy5mb3JFYWNoKHggPT4geC5pbmplY3RNb2NoYVRlc3RzKCkpO1xuICAgICAgICB9XG5cbiAgICAgICAgaXQoJ1ByaW50IGNvdmVyYWdlJywgKGRvbmUpID0+IHtcbiAgICAgICAgICBQcm9taXNlLmFsbCh0aGlzLmNvdmVyYWdlRWxlbWVudHMubWFwKHggPT4geC5nZXRDb3ZlcmFnZSgpKSlcbiAgICAgICAgICAgIC50aGVuKHggPT4ge1xuICAgICAgICAgICAgICBsZXQgdG90YWwgPSB4LnJlZHVjZSgocHJldiwgYWN0dWFsKSA9PiB7XG4gICAgICAgICAgICAgICAgcHJldi5lcnJvcmVkICs9IGFjdHVhbC5lcnJvcmVkO1xuICAgICAgICAgICAgICAgIHByZXYudG90YWwgKz0gYWN0dWFsLnRvdGFsO1xuICAgICAgICAgICAgICAgIHByZXYubm90Q292ZXJlZCArPSBhY3R1YWwubm90Q292ZXJlZDtcbiAgICAgICAgICAgICAgICByZXR1cm4gcHJldjtcbiAgICAgICAgICAgICAgfSwgeyB0b3RhbDogMCwgZXJyb3JlZDogMCwgbm90Q292ZXJlZDogMCB9KTtcbiAgICAgICAgICAgICAgY29uc29sZS5sb2codXRpbC5pbnNwZWN0KHRvdGFsLCBmYWxzZSwgMiwgdHJ1ZSkpO1xuICAgICAgICAgICAgICBkb25lKCk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgICB9KTtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIHBlZWtSZXNvdXJjZShyZXNvdXJjZTogUkFNTC5hcGkwOC5SZXNvdXJjZSB8IFJBTUwuYXBpMTAuUmVzb3VyY2UsIHBhcmVudD86IHN0cmluZykge1xuICAgIGxldCB0aGlzVXJsID0gKHBhcmVudCB8fCBcIlwiKSArIHJlc291cmNlLnJlbGF0aXZlVXJpKCkudmFsdWUoKTtcblxuICAgIHRoaXMuY292ZXJhZ2VFbGVtZW50cy5wdXNoKG5ldyBDb3ZlcmFnZS5Db3ZlcmFnZVJlc291cmNlKHJlc291cmNlIGFzIGFueSwgdGhpcykpO1xuXG4gICAgbGV0IHJlc291cmNlcyA9IHJlc291cmNlLnJlc291cmNlcygpO1xuXG4gICAgZm9yIChsZXQgciBpbiByZXNvdXJjZXMpIHtcbiAgICAgIHRoaXMucGVla1Jlc291cmNlKHJlc291cmNlc1tyXSwgdGhpc1VybCk7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSByZWdpc3RlclRlc3RSZXN1bHQodGVzdDogQVRMSGVscGVycy5BVExUZXN0LCBjdHg6IHtcbiAgICByZXE6IHJlcXVlc3QuVGVzdDtcbiAgICByZXM6IHJlcXVlc3QuUmVzcG9uc2U7XG4gICAgdGVzdDogQVRMSGVscGVycy5BVExUZXN0O1xuICAgIHVybDogc3RyaW5nO1xuICB9KSB7XG4gICAgbGV0IGtleSA9IEFUTEhlbHBlcnMubWF0Y2hVcmwodGVzdC51cmkpO1xuXG4gICAgdGhpcy5jb3ZlcmFnZUVsZW1lbnRzLmZvckVhY2goY292ZXJhZ2VFbGVtZW50ID0+IHtcbiAgICAgIGlmIChjb3ZlcmFnZUVsZW1lbnQubWF0Y2hlcyhjdHgudXJsKSkge1xuICAgICAgICBjb3ZlcmFnZUVsZW1lbnQucmVzb2x2ZShjdHgudGVzdCwgY3R4LnJlcyk7XG4gICAgICB9XG4gICAgfSk7XG4gIH1cblxuXG4gIHByaXZhdGUgcnVuU3VpdGUoc3VpdGU6IEFUTEhlbHBlcnMuQVRMU3VpdGUpIHtcbiAgICBsZXQgZXhlY0ZuID0gc3VpdGUuc2tpcCA/IHRoaXMuZGVzY3JpYmUuc2tpcCA6IHRoaXMuZGVzY3JpYmU7XG5cbiAgICBpZiAoc3VpdGUudGVzdCkge1xuICAgICAgdGhpcy5ydW5UZXN0KHN1aXRlLnRlc3QpO1xuICAgIH1cblxuICAgIGxldCB0aGF0ID0gdGhpcztcblxuICAgIGlmIChzdWl0ZS5zdWl0ZXMgJiYgT2JqZWN0LmtleXMoc3VpdGUuc3VpdGVzKS5sZW5ndGgpIHtcbiAgICAgIGV4ZWNGbihzdWl0ZS5uYW1lLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHRoaXMuYmFpbCAmJiB0aGlzLmJhaWwodHJ1ZSk7XG4gICAgICAgIGZvciAobGV0IGsgaW4gc3VpdGUuc3VpdGVzKSB7XG4gICAgICAgICAgbGV0IHMgPSBzdWl0ZS5zdWl0ZXNba107XG4gICAgICAgICAgdGhhdC5ydW5TdWl0ZShzKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfVxuICB9XG5cbiAgb2J0YWluU2NoZW1hVmFsaWRhdG9yKHNjaGVtYTogYW55KSB7XG4gICAgbGV0IHYgPSBuZXcganNvbnNjaGVtYS5WYWxpZGF0b3IoKTtcblxuICAgIGlmICh0eXBlb2Ygc2NoZW1hID09IFwic3RyaW5nXCIpIHtcbiAgICAgIGlmIChzY2hlbWEgaW4gdGhpcy5hc3Quc2NoZW1hcykge1xuICAgICAgICB2LmFkZFNjaGVtYSh0aGlzLmFzdC5zY2hlbWFzW3NjaGVtYV0sIHNjaGVtYSk7XG4gICAgICAgIHNjaGVtYSA9IHRoaXMuYXN0LnNjaGVtYXNbc2NoZW1hXTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgc2NoZW1hID0gSlNPTi5wYXJzZShzY2hlbWEpO1xuICAgICAgICAgIHYuYWRkU2NoZW1hKHNjaGVtYSk7XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcblxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSBlbHNlIGlmICh0eXBlb2Ygc2NoZW1hID09IFwib2JqZWN0XCIpIHtcbiAgICAgIHYuYWRkU2NoZW1hKHNjaGVtYSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignSW52YWxpZCBzY2hlbWEgJyArIHV0aWwuaW5zcGVjdChzY2hlbWEpKTtcbiAgICB9XG5cbiAgICBpZiAodi51bnJlc29sdmVkUmVmcyAmJiB2LnVucmVzb2x2ZWRSZWZzLmxlbmd0aCkge1xuICAgICAgdGhpcy5kZXNjcmliZShcIkxvYWQgcmVmZXJlbmNlZCBzY2hlbWFzXCIsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgd2hpbGUgKHYudW5yZXNvbHZlZFJlZnMgJiYgdi51bnJlc29sdmVkUmVmcy5sZW5ndGgpIHtcbiAgICAgICAgICBsZXQgbmV4dFNjaGVtYSA9IHYudW5yZXNvbHZlZFJlZnMuc2hpZnQoKTtcbiAgICAgICAgICB0aGlzLml0KFwibG9hZCBzY2hlbWEgXCIgKyBuZXh0U2NoZW1hLCAoKSA9PiB7XG4gICAgICAgICAgICBsZXQgdGhlU2NoZW1hID0gdGhpcy5hc3Quc2NoZW1hc1tuZXh0U2NoZW1hXTtcblxuICAgICAgICAgICAgaWYgKCF0aGVTY2hlbWEpXG4gICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcInNjaGVtYSBcIiArIG5leHRTY2hlbWEgKyBcIiBub3QgZm91bmRcIik7XG5cbiAgICAgICAgICAgIHYuYWRkU2NoZW1hKHRoZVNjaGVtYSwgbmV4dFNjaGVtYSk7XG4gICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH1cblxuICAgIHJldHVybiAoY29udGVudCkgPT4ge1xuICAgICAgcmV0dXJuIHYudmFsaWRhdGUoY29udGVudCwgc2NoZW1hKTtcbiAgICB9O1xuICB9XG5cbiAgcHJpdmF0ZSBydW5UZXN0KHRlc3Q6IEFUTEhlbHBlcnMuQVRMVGVzdCkge1xuICAgIGxldCBleGVjRm4gPSB0ZXN0LnNraXBcbiAgICAgID8gdGhpcy5kZXNjcmliZS5za2lwXG4gICAgICA6IHRoaXMuZGVzY3JpYmU7XG5cbiAgICBsZXQgdGhhdCA9IHRoaXM7XG5cbiAgICBsZXQgcmVxdWVzdEhvbGRlciA9IHtcbiAgICAgIHJlcTogbnVsbCBhcyByZXF1ZXN0LlRlc3QsXG4gICAgICByZXM6IG51bGwgYXMgcmVxdWVzdC5SZXNwb25zZSxcbiAgICAgIHVybDogdGVzdC51cmksXG4gICAgICBjdHg6IHtcbiAgICAgICAgUkVRVUVTVDoge30gYXMgYW55LFxuICAgICAgICBSRVNQT05TRToge30gYXMgYW55XG4gICAgICB9XG4gICAgfTtcblxuICAgIGV4ZWNGbih0ZXN0LmRlc2NyaXB0aW9uIHx8ICh0ZXN0Lm1ldGhvZC50b1VwcGVyQ2FzZSgpICsgJyAnICsgdGVzdC51cmkpLCBmdW5jdGlvbiAoKSB7XG5cbiAgICAgIGlmICh0ZXN0LnVyaVBhcmFtZXRlcnMpIHtcbiAgICAgICAgdGhhdC5kZWZlcmVkSXQoJ0Vuc3VyZSB1cmlQYXJhbWV0ZXJzJykudGhlbihmdW5jdGlvbiAocmVzb2x2ZXIpIHtcbiAgICAgICAgICBmb3IgKGxldCBpIGluIHRlc3QudXJpUGFyYW1ldGVycykge1xuICAgICAgICAgICAgbGV0IHZhbHVlID0gbnVsbDtcblxuICAgICAgICAgICAgaWYgKHRlc3QudXJpUGFyYW1ldGVyc1tpXSBpbnN0YW5jZW9mIEFUTEhlbHBlcnMucG9pbnRlckxpYi5Qb2ludGVyKSB7XG4gICAgICAgICAgICAgIHZhbHVlID0gdGVzdC51cmlQYXJhbWV0ZXJzW2ldLmdldCh0aGF0LmFzdC5vcHRpb25zLnZhcmlhYmxlcyk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICB2YWx1ZSA9IHRlc3QudXJpUGFyYW1ldGVyc1tpXTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgbGV0IHR5cGVPZlZhbHVlID0gdHlwZW9mIHZhbHVlO1xuXG4gICAgICAgICAgICAvKiBpc3RhbmJ1bCBpZ25vcmUgaWYgKi9cbiAgICAgICAgICAgIGlmICh0eXBlT2ZWYWx1ZSAhPSAnc3RyaW5nJyAmJiB0eXBlT2ZWYWx1ZSAhPSAnbnVtYmVyJykge1xuICAgICAgICAgICAgICByZXNvbHZlcihcIk9ubHkgc3RyaW5ncyBhbmQgbnVtYmVycyBhcmUgYWxsb3dlZCBvbiB1cmlQYXJhbWV0ZXJzLiBcIiArIGkgKyBcIj1cIiArIHV0aWwuaW5zcGVjdCh2YWx1ZSkpO1xuICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJlcXVlc3RIb2xkZXIudXJsID0gcmVxdWVzdEhvbGRlci51cmwucmVwbGFjZShuZXcgUmVnRXhwKFwie1wiICsgaSArIFwifVwiLCBcImdcIiksIGZ1bmN0aW9uIChmdWxsdGV4dCwgbWF0Y2gpIHtcbiAgICAgICAgICAgICAgcmV0dXJuIGVuY29kZVVSSUNvbXBvbmVudCh2YWx1ZSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmVzb2x2ZXIoKTtcbiAgICAgICAgfSk7XG4gICAgICB9XG5cblxuXG4gICAgICBsZXQgcGFyc2VkVXJsID0gdXJsLnBhcnNlKHJlcXVlc3RIb2xkZXIudXJsLCB0cnVlKTtcblxuICAgICAgcGFyc2VkVXJsLnF1ZXJ5ID0gcGFyc2VkVXJsLnF1ZXJ5IHx8IHt9O1xuXG4gICAgICBsZXQgbmV3UXMgPSBwYXJzZWRVcmwucXVlcnk7XG5cbiAgICAgIGlmICh0ZXN0LnJlcXVlc3QucXVlcnlQYXJhbWV0ZXJzKSB7XG4gICAgICAgIHRoYXQuZGVmZXJlZEl0KCdFbnN1cmUgcXVlcnlQYXJhbWV0ZXJzJykudGhlbihmdW5jdGlvbiAocmVzb2x2ZXIpIHtcbiAgICAgICAgICBpZiAoJ3NlYXJjaCcgaW4gcGFyc2VkVXJsKVxuICAgICAgICAgICAgZGVsZXRlIHBhcnNlZFVybC5zZWFyY2g7XG5cbiAgICAgICAgICBsZXQgcXNQYXJhbXMgPSBBVExIZWxwZXJzLmNsb25lT2JqZWN0VXNpbmdQb2ludGVycyh0ZXN0LnJlcXVlc3QucXVlcnlQYXJhbWV0ZXJzLCB0aGF0LmFzdC5vcHRpb25zLnZhcmlhYmxlcyk7XG5cbiAgICAgICAgICBmb3IgKGxldCBpIGluIHFzUGFyYW1zKSB7XG4gICAgICAgICAgICBuZXdRc1tpXSA9IHFzUGFyYW1zW2ldO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIHJlcXVlc3RIb2xkZXIuY3R4LlJFUVVFU1QucXVlcnlQYXJhbWV0ZXJzID0gcXNQYXJhbXM7XG5cbiAgICAgICAgICByZXF1ZXN0SG9sZGVyLnVybCA9IHVybC5mb3JtYXQocGFyc2VkVXJsKTtcblxuICAgICAgICAgIHJlc29sdmVyKCk7XG4gICAgICAgIH0pO1xuICAgICAgfVxuXG4gICAgICB0aGF0LmRlZmVyZWRJdCh0ZXN0Lm1ldGhvZC50b1VwcGVyQ2FzZSgpICsgJyAnICsgcmVxdWVzdEhvbGRlci51cmwsIHRlc3QudGltZW91dCkudGhlbihmdW5jdGlvbiAocmVzb2x2ZXIpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBsZXQgcmVxID0gcmVxdWVzdEhvbGRlci5yZXEgPSB0aGF0LmFnZW50W3Rlc3QubWV0aG9kLnRvTG93ZXJDYXNlKCldKHJlcXVlc3RIb2xkZXIudXJsKTtcblxuICAgICAgICAgIHJlcXVlc3RIb2xkZXIuY3R4LlJFUVVFU1QubWV0aG9kID0gdGVzdC5tZXRob2Q7XG4gICAgICAgICAgcmVxdWVzdEhvbGRlci5jdHguUkVRVUVTVC51cmwgPSByZXF1ZXN0SG9sZGVyLnVybDtcblxuICAgICAgICAgIC8vIHdlIG11c3Qgc2VuZCBzb21lIGRhdGEuLlxuICAgICAgICAgIGlmICh0ZXN0LnJlcXVlc3QpIHtcbiAgICAgICAgICAgIGlmICh0ZXN0LnJlcXVlc3QuaGVhZGVycykge1xuICAgICAgICAgICAgICByZXF1ZXN0SG9sZGVyLmN0eC5SRVFVRVNULmhlYWRlcnMgPSB7fTtcbiAgICAgICAgICAgICAgbGV0IGhlYWRlcnMgPSBBVExIZWxwZXJzLmNsb25lT2JqZWN0VXNpbmdQb2ludGVycyh0ZXN0LnJlcXVlc3QuaGVhZGVycywgdGhhdC5hc3Qub3B0aW9ucy52YXJpYWJsZXMpO1xuICAgICAgICAgICAgICBmb3IgKGxldCBoIGluIGhlYWRlcnMpIHtcblxuICAgICAgICAgICAgICAgIHJlcS5zZXQoaCwgaGVhZGVyc1toXSA9PSB1bmRlZmluZWQgPyAnJyA6IGhlYWRlcnNbaF0udG9TdHJpbmcoKSk7XG4gICAgICAgICAgICAgICAgaWYgKHR5cGVvZiB0ZXN0LnJlcXVlc3QuaGVhZGVyc1toXSA9PSBcIm9iamVjdFwiICYmIHRlc3QucmVxdWVzdC5oZWFkZXJzW2hdIGluc3RhbmNlb2YgQVRMSGVscGVycy5wb2ludGVyTGliLlBvaW50ZXIgJiYgdGVzdC5yZXF1ZXN0LmhlYWRlcnNbaF0ucGF0aC5pbmRleE9mKFwiRU5WXCIpID09IDApIHtcbiAgICAgICAgICAgICAgICAgIHJlcXVlc3RIb2xkZXIuY3R4LlJFUVVFU1QuaGVhZGVyc1toXSA9IFwiKFRBS0VOIEZST00gXCIgKyB0ZXN0LnJlcXVlc3QuaGVhZGVyc1toXS5wYXRoICsgXCIpXCI7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgIHJlcXVlc3RIb2xkZXIuY3R4LlJFUVVFU1QuaGVhZGVyc1toXSA9IHR5cGVvZiBoZWFkZXJzW2hdICE9IFwidW5kZWZpbmVkXCIgJiYgaGVhZGVyc1toXS50b1N0cmluZygpIHx8IGhlYWRlcnNbaF07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmICh0ZXN0LnJlcXVlc3QuanNvbikge1xuICAgICAgICAgICAgICBsZXQgZGF0YSA9IEFUTEhlbHBlcnMuY2xvbmVPYmplY3RVc2luZ1BvaW50ZXJzKHRlc3QucmVxdWVzdC5qc29uLCB0aGF0LmFzdC5vcHRpb25zLnZhcmlhYmxlcyk7XG4gICAgICAgICAgICAgIHJlcXVlc3RIb2xkZXIuY3R4LlJFUVVFU1QuYm9keSA9IGRhdGE7XG4gICAgICAgICAgICAgIHJlcS5zZW5kKGRhdGEpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAodGVzdC5yZXF1ZXN0LmF0dGFjaCkge1xuICAgICAgICAgICAgICAvKiBpc3RhbmJ1bCBpZ25vcmUgaWYgKi9cbiAgICAgICAgICAgICAgaWYgKCF0aGF0LnBhdGgpIHtcbiAgICAgICAgICAgICAgICByZXNvbHZlcihBVExIZWxwZXJzLmVycm9yKFwiYXR0YWNoIGlzIG5vdCBhbGxvd2VkIHVzaW5nIFJBVyBkZWZpbml0aW9uc1wiLCByZXF1ZXN0SG9sZGVyLmN0eCkpO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgIGZvciAobGV0IGkgaW4gdGVzdC5yZXF1ZXN0LmF0dGFjaCkge1xuICAgICAgICAgICAgICAgIGxldCBjdXJyZW50QXR0YWNobWVudCA9IHRlc3QucmVxdWVzdC5hdHRhY2hbaV07XG4gICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgIHJlcS5hdHRhY2goY3VycmVudEF0dGFjaG1lbnQua2V5LCBwYXRoLnJlc29sdmUodGhhdC5wYXRoLCBjdXJyZW50QXR0YWNobWVudC52YWx1ZSkpO1xuICAgICAgICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgICAgICAgIHJlc29sdmVyKGUpO1xuICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAodGVzdC5yZXF1ZXN0LmZvcm0pIHtcbiAgICAgICAgICAgICAgcmVxLnR5cGUoJ2Zvcm0nKTtcblxuICAgICAgICAgICAgICBmb3IgKGxldCBpIGluIHRlc3QucmVxdWVzdC5mb3JtKSB7XG4gICAgICAgICAgICAgICAgbGV0IGN1cnJlbnRBdHRhY2htZW50ID0gQVRMSGVscGVycy5jbG9uZU9iamVjdFVzaW5nUG9pbnRlcnModGVzdC5yZXF1ZXN0LmZvcm1baV0sIHRoYXQuYXN0Lm9wdGlvbnMudmFyaWFibGVzKTtcbiAgICAgICAgICAgICAgICByZXEuZmllbGQoY3VycmVudEF0dGFjaG1lbnQua2V5LCBjdXJyZW50QXR0YWNobWVudC52YWx1ZSk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKHRlc3QucmVxdWVzdC51cmxlbmNvZGVkKSB7XG4gICAgICAgICAgICAgIHJlcS5zZW5kKEFUTEhlbHBlcnMuY2xvbmVPYmplY3RVc2luZ1BvaW50ZXJzKHRlc3QucmVxdWVzdC51cmxlbmNvZGVkLCB0aGF0LmFzdC5vcHRpb25zLnZhcmlhYmxlcykpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cblxuICAgICAgICAgIHJlcS5lbmQoZnVuY3Rpb24gKGVyciwgcmVzKSB7XG4gICAgICAgICAgICByZXF1ZXN0SG9sZGVyLnJlcyA9IHJlcztcbiAgICAgICAgICAgIHJlcXVlc3RIb2xkZXIuY3R4LlJFU1BPTlNFID0gcmVzO1xuICAgICAgICAgICAgLyogaXN0YW5idWwgaWdub3JlIGlmOiB1bnRlc3RhYmxlICovXG4gICAgICAgICAgICBpZiAoZXJyICYmIGVyciBpbnN0YW5jZW9mIEVycm9yKSB7XG4gICAgICAgICAgICAgIGVyciA9IEFUTEhlbHBlcnMuZXJyb3IoZXJyLm1lc3NhZ2UsIHJlcXVlc3RIb2xkZXIuY3R4KTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmVzb2x2ZXIoZXJyKTtcblxuICAgICAgICAgICAgaWYgKCFlcnIpIHtcbiAgICAgICAgICAgICAgdGhhdC5yZWdpc3RlclRlc3RSZXN1bHQodGVzdCwge1xuICAgICAgICAgICAgICAgIHJlcSxcbiAgICAgICAgICAgICAgICByZXMsXG4gICAgICAgICAgICAgICAgdGVzdCxcbiAgICAgICAgICAgICAgICB1cmw6IHJlcXVlc3RIb2xkZXIudXJsXG4gICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB0ZXN0LnJlc29sdmUocmVzLCBlcnIpO1xuICAgICAgICAgIH0pO1xuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgcmVzb2x2ZXIoZSk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuXG5cbiAgICAgIGV4ZWNGbihcIlZhbGlkYXRlIHJlc3BvbnNlXCIsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgaWYgKHRlc3QucmVzcG9uc2UpIHtcbiAgICAgICAgICBpZiAodGVzdC5yZXNwb25zZS5zdGF0dXMpIHtcbiAgICAgICAgICAgIHRoYXQuZGVmZXJlZEl0KFwicmVzcG9uc2Uuc3RhdHVzID09IFwiICsgdGVzdC5yZXNwb25zZS5zdGF0dXMsIHRlc3QudGltZW91dCkudGhlbihyZXNvbHZlciA9PiB7XG4gICAgICAgICAgICAgIC8qIGlzdGFuYnVsIGlnbm9yZSBlbHNlICovXG4gICAgICAgICAgICAgIGlmIChyZXF1ZXN0SG9sZGVyLnJlcy5zdGF0dXMgPT0gdGVzdC5yZXNwb25zZS5zdGF0dXMpXG4gICAgICAgICAgICAgICAgcmVzb2x2ZXIoKTtcbiAgICAgICAgICAgICAgZWxzZVxuICAgICAgICAgICAgICAgIHJlc29sdmVyKEFUTEhlbHBlcnMuZXJyb3IoJ2V4cGVjdGVkIHN0YXR1cyBjb2RlICcgKyB0ZXN0LnJlc3BvbnNlLnN0YXR1cyArICcgZ290ICcgKyByZXF1ZXN0SG9sZGVyLnJlcy5zdGF0dXMsIHJlcXVlc3RIb2xkZXIuY3R4KSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBpZiAodGVzdC5yZXNwb25zZS5ib2R5KSB7XG4gICAgICAgICAgICBpZiAoJ2lzJyBpbiB0ZXN0LnJlc3BvbnNlLmJvZHkpIHtcbiAgICAgICAgICAgICAgdGhhdC5kZWZlcmVkSXQoXCJyZXNwb25zZS5ib2R5XCIsIHRlc3QudGltZW91dCkudGhlbihyZXNvbHZlciA9PiB7XG4gICAgICAgICAgICAgICAgbGV0IGJvZHlFcXVhbHMgPSBBVExIZWxwZXJzLmNsb25lT2JqZWN0VXNpbmdQb2ludGVycyh0ZXN0LnJlc3BvbnNlLmJvZHkuaXMsIHRoYXQuYXN0Lm9wdGlvbnMudmFyaWFibGVzKTtcblxuICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICBpZiAodGVzdC5yZXNwb25zZS5ib2R5LmlzICYmIHR5cGVvZiB0ZXN0LnJlc3BvbnNlLmJvZHkuaXMgPT0gXCJvYmplY3RcIiAmJiB0ZXN0LnJlc3BvbnNlLmJvZHkuaXMgaW5zdGFuY2VvZiBSZWdFeHApIHtcbiAgICAgICAgICAgICAgICAgICAgLyogaXN0YW5idWwgaWdub3JlIGlmICovXG4gICAgICAgICAgICAgICAgICAgIGlmICghdGVzdC5yZXNwb25zZS5ib2R5LmlzLnRlc3QocmVxdWVzdEhvbGRlci5yZXMudGV4dCkpIHtcbiAgICAgICAgICAgICAgICAgICAgICBsZXQgYSA9IHV0aWwuaW5zcGVjdChib2R5RXF1YWxzKTtcbiAgICAgICAgICAgICAgICAgICAgICBsZXQgYiA9IHV0aWwuaW5zcGVjdCh0ZXN0LnJlc3BvbnNlLmJvZHkuaXMpO1xuICAgICAgICAgICAgICAgICAgICAgIHJlc29sdmVyKEFUTEhlbHBlcnMuZXJyb3IoJ2V4cGVjdGVkIHJlc3BvbnNlLmJvZHkgdG8gbWF0Y2ggJyArIGEgKyAnIHJlc3BvbnNlIGJvZHksIGdvdCAnICsgYiwgcmVxdWVzdEhvbGRlci5jdHgpKTtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICByZXNvbHZlcigpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBsZXQgdGFrZW5Cb2R5O1xuICAgICAgICAgICAgICAgICAgICBpZiAodHlwZW9mIHRlc3QucmVzcG9uc2UuYm9keS5pcyA9PSBcInN0cmluZ1wiKSB7XG4gICAgICAgICAgICAgICAgICAgICAgdGFrZW5Cb2R5ID0gcmVxdWVzdEhvbGRlci5yZXMudGV4dDtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICB0YWtlbkJvZHkgPSByZXF1ZXN0SG9sZGVyLnJlcy5ib2R5O1xuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgLyogaXN0YW5idWwgaWdub3JlIGlmICovXG4gICAgICAgICAgICAgICAgICAgIGlmICghXy5pc0VxdWFsKGJvZHlFcXVhbHMsIHRha2VuQm9keSkpIHtcbiAgICAgICAgICAgICAgICAgICAgICBsZXQgYSA9IHV0aWwuaW5zcGVjdChib2R5RXF1YWxzKTtcbiAgICAgICAgICAgICAgICAgICAgICBsZXQgYiA9IHV0aWwuaW5zcGVjdCh0YWtlbkJvZHkpO1xuICAgICAgICAgICAgICAgICAgICAgIHJlc29sdmVyKEFUTEhlbHBlcnMuZXJyb3JEaWZmKCdleHBlY3RlZCAnICsgYSArICcgcmVzcG9uc2UgYm9keSwgZ290ICcgKyBiLCBib2R5RXF1YWxzLCB0YWtlbkJvZHksIHJlcXVlc3RIb2xkZXIuY3R4KSk7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZXIoKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgICAgICAgIHJlc29sdmVyKGUpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmICh0ZXN0LnJlc3BvbnNlLmJvZHkuc2NoZW1hKSB7XG4gICAgICAgICAgICAgIGxldCB2ID0gdGhhdC5vYnRhaW5TY2hlbWFWYWxpZGF0b3IodGVzdC5yZXNwb25zZS5ib2R5LnNjaGVtYSk7XG5cbiAgICAgICAgICAgICAgdGhhdC5kZWZlcmVkSXQoXCJyZXNwb25zZS5ib2R5IHNjaGVtYVwiLCB0ZXN0LnRpbWVvdXQpLnRoZW4ocmVzb2x2ZXIgPT4ge1xuICAgICAgICAgICAgICAgIGxldCB2YWxpZGF0aW9uUmVzdWx0ID0gdihyZXF1ZXN0SG9sZGVyLnJlcy5ib2R5KTtcbiAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgaWYgKHZhbGlkYXRpb25SZXN1bHQudmFsaWQpIHtcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZXIoKTtcbiAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIGxldCBlcnJvcnMgPSBbXCJTY2hlbWEgZXJyb3I6XCJdO1xuICAgICAgICAgICAgICAgICAgICB2YWxpZGF0aW9uUmVzdWx0LmVycm9ycyAmJiB2YWxpZGF0aW9uUmVzdWx0LmVycm9ycy5mb3JFYWNoKHggPT4gZXJyb3JzLnB1c2goXCIgIFwiICsgeC5zdGFjaykpO1xuXG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmVyKEFUTEhlbHBlcnMuZXJyb3IoZXJyb3JzLmpvaW4oJ1xcbicpIHx8IFwiSW52YWxpZCBzY2hlbWFcIiwgcmVxdWVzdEhvbGRlci5jdHgpKTtcbiAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICAgICAgICByZXNvbHZlcihlKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAodGVzdC5yZXNwb25zZS5ib2R5Lm1hdGNoZXMpIHtcbiAgICAgICAgICAgICAgdGVzdC5yZXNwb25zZS5ib2R5Lm1hdGNoZXMuZm9yRWFjaChrdm8gPT4ge1xuICAgICAgICAgICAgICAgIHRoYXQuZGVmZXJlZEl0KFwicmVzcG9uc2UuYm9keTo6XCIgKyBrdm8ua2V5LCB0ZXN0LnRpbWVvdXQpLnRoZW4ocmVzb2x2ZXIgPT4ge1xuICAgICAgICAgICAgICAgICAgbGV0IHZhbHVlOiBhbnkgPSBBVExIZWxwZXJzLmNsb25lT2JqZWN0VXNpbmdQb2ludGVycyhrdm8udmFsdWUsIHRoYXQuYXN0Lm9wdGlvbnMudmFyaWFibGVzKTtcblxuICAgICAgICAgICAgICAgICAgbGV0IHJlYWRlZCA9IF8uZ2V0KHJlcXVlc3RIb2xkZXIucmVzLmJvZHksIGt2by5rZXkpO1xuXG4gICAgICAgICAgICAgICAgICAvKiBpc3RhbmJ1bCBpZ25vcmUgaWYgKi9cbiAgICAgICAgICAgICAgICAgIGlmIChcbiAgICAgICAgICAgICAgICAgICAgKCEodmFsdWUgaW5zdGFuY2VvZiBSZWdFeHApICYmICFfLmlzRXF1YWwocmVhZGVkLCB2YWx1ZSkpXG4gICAgICAgICAgICAgICAgICAgIHx8XG4gICAgICAgICAgICAgICAgICAgICgodmFsdWUgaW5zdGFuY2VvZiBSZWdFeHApICYmICF2YWx1ZS50ZXN0KHJlYWRlZCkpXG4gICAgICAgICAgICAgICAgICApIHtcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZXIoQVRMSGVscGVycy5lcnJvckRpZmYoJ2V4cGVjdGVkIHJlc3BvbnNlLmJvZHk6OicgKyBrdm8ua2V5ICsgJyB0byBiZSAnICsgdXRpbC5pbnNwZWN0KHZhbHVlKSArICcgZ290ICcgKyB1dGlsLmluc3BlY3QocmVhZGVkKSwgdmFsdWUsIHJlYWRlZCwgcmVxdWVzdEhvbGRlci5jdHgpKTtcbiAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmVyKCk7XG4gICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmICh0ZXN0LnJlc3BvbnNlLmJvZHkudGFrZSkge1xuICAgICAgICAgICAgICBsZXQgdGFrZSA9IHRlc3QucmVzcG9uc2UuYm9keS50YWtlO1xuXG4gICAgICAgICAgICAgIHRha2UuZm9yRWFjaChmdW5jdGlvbiAodGFrZW5FbGVtZW50KSB7XG4gICAgICAgICAgICAgICAgdGhhdC5kZWZlcmVkSXQoXCJyZXNwb25zZS5ib2R5OjpcIiArIHRha2VuRWxlbWVudC5rZXkgKyBcIiA+PiAhIXZhcmlhYmxlcyBcIiArIHRha2VuRWxlbWVudC52YWx1ZS5wYXRoLCB0ZXN0LnRpbWVvdXQpLnRoZW4ocmVzb2x2ZXIgPT4ge1xuICAgICAgICAgICAgICAgICAgbGV0IHRha2VuVmFsdWUgPSBfLmdldChyZXF1ZXN0SG9sZGVyLnJlcy5ib2R5LCB0YWtlbkVsZW1lbnQua2V5KTtcbiAgICAgICAgICAgICAgICAgIHRha2VuRWxlbWVudC52YWx1ZS5zZXQodGhhdC5hc3Qub3B0aW9ucy52YXJpYWJsZXMsIHRha2VuVmFsdWUpO1xuICAgICAgICAgICAgICAgICAgcmVzb2x2ZXIoKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmICh0ZXN0LnJlc3BvbnNlLmJvZHkuY29weVRvICYmIHRlc3QucmVzcG9uc2UuYm9keS5jb3B5VG8gaW5zdGFuY2VvZiBBVExIZWxwZXJzLnBvaW50ZXJMaWIuUG9pbnRlcikge1xuICAgICAgICAgICAgICB0aGF0LmRlZmVyZWRJdChcInJlc3BvbnNlLmJvZHkgPj4gISF2YXJpYWJsZXMgXCIgKyB0ZXN0LnJlc3BvbnNlLmJvZHkuY29weVRvLnBhdGgsIHRlc3QudGltZW91dCkudGhlbihyZXNvbHZlciA9PiB7XG4gICAgICAgICAgICAgICAgdGVzdC5yZXNwb25zZS5ib2R5LmNvcHlUby5zZXQodGhhdC5hc3Qub3B0aW9ucy52YXJpYWJsZXMsIHJlcXVlc3RIb2xkZXIucmVzLmJvZHkpO1xuICAgICAgICAgICAgICAgIHJlc29sdmVyKCk7XG4gICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAodGVzdC5yZXNwb25zZS5oZWFkZXJzKSB7XG4gICAgICAgICAgICAgIGxldCBoZWFkZXJzID0gQVRMSGVscGVycy5jbG9uZU9iamVjdFVzaW5nUG9pbnRlcnModGVzdC5yZXNwb25zZS5oZWFkZXJzLCB0aGF0Lm9wdGlvbnMudmFyaWFibGVzKTtcblxuICAgICAgICAgICAgICBmb3IgKGxldCBoIGluIGhlYWRlcnMpIHtcbiAgICAgICAgICAgICAgICBpZiAoaCAhPT0gJ2NvbnRlbnQtdHlwZScpIHtcbiAgICAgICAgICAgICAgICAgIGhlYWRlcnNbaF0gPSBoZWFkZXJzW2hdLnRvU3RyaW5nKCk7XG5cbiAgICAgICAgICAgICAgICAgIHRoYXQuZGVmZXJlZEl0KFwicmVzcG9uc2UuaGVhZGVyOjpcIiArIGgsIHRlc3QudGltZW91dCkudGhlbihyZXNvbHZlID0+IHtcbiAgICAgICAgICAgICAgICAgICAgbGV0IHZhbHVlID0gcmVxdWVzdEhvbGRlci5yZXMuZ2V0KGgudG9Mb3dlckNhc2UoKSk7XG5cbiAgICAgICAgICAgICAgICAgICAgLyogaXN0YW5idWwgaWdub3JlIGlmICovXG4gICAgICAgICAgICAgICAgICAgIGlmIChoZWFkZXJzW2hdICE9IHZhbHVlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgbGV0IGEgPSB1dGlsLmluc3BlY3QoaGVhZGVyc1toXSk7XG4gICAgICAgICAgICAgICAgICAgICAgbGV0IGIgPSB1dGlsLmluc3BlY3QodmFsdWUpO1xuICAgICAgICAgICAgICAgICAgICAgIHJlc29sdmUoQVRMSGVscGVycy5lcnJvckRpZmYoJ2V4cGVjdGVkIHJlc3BvbnNlLmhlYWRlcjo6JyArIGggKyAnIHRvIGJlICcgKyBhICsgJyBnb3QgJyArIGIsIGhlYWRlcnNbaF0sIHZhbHVlLCByZXF1ZXN0SG9sZGVyLmN0eCkpO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgIHJlc29sdmUoKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9KTtcblxuICB9XG5cbiAgZGVmZXJlZEl0KG5hbWU6IHN0cmluZywgdGltZW91dD86IG51bWJlcik6IFByb21pc2U8KGVycj8pID0+IHZvaWQ+IHtcbiAgICBsZXQgZmlsbCA9IG51bGw7XG5cbiAgICBsZXQgcHJvbSA9IEFUTEhlbHBlcnMuZmxhdFByb21pc2UoKTtcblxuICAgIHRoaXMuaXQobmFtZSwgZnVuY3Rpb24gKGRvbmUpIHtcbiAgICAgIGlmICh0aW1lb3V0KVxuICAgICAgICB0aGlzLnRpbWVvdXQodGltZW91dCk7XG5cbiAgICAgIHByb20ucmVzb2x2ZXIuY2FsbCh0aGlzLCBmdW5jdGlvbiAocmV0KSB7XG4gICAgICAgIC8qIGlzdGFuYnVsIGlnbm9yZSBpZiAqL1xuICAgICAgICBpZiAocmV0KSB7XG4gICAgICAgICAgaWYgKGRvbmUuZmFpbClcbiAgICAgICAgICAgIGRvbmUuZmFpbChyZXQpO1xuICAgICAgICAgIGVsc2VcbiAgICAgICAgICAgIGRvbmUocmV0KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBkb25lKCk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuXG4gICAgICBwcm9tLnByb21pc2UuY2F0Y2goZG9uZSk7XG4gICAgfSk7XG5cbiAgICByZXR1cm4gcHJvbS5wcm9taXNlO1xuICB9XG5cbiAgY292ZXJhZ2VEYXRhOiBBVExIZWxwZXJzLklEaWN0aW9uYXJ5PHtcbiAgICBzb3VyY2U6IEFycmF5PG51bWJlciB8IHZvaWQ+O1xuICB9PiA9IHt9O1xuXG4gIHdyaXRlQ292ZXJhZ2UoY292ZXJGaWxlOiBzdHJpbmcpIHtcbiAgICBsZXQgY3dkID0gcGF0aC5kaXJuYW1lKGNvdmVyRmlsZSk7XG5cbiAgICBpZiAodGhpcy5jb3ZlcmFnZURhdGEgJiYgT2JqZWN0LmtleXModGhpcy5jb3ZlcmFnZURhdGEpLmxlbmd0aCkge1xuICAgICAgY29uc29sZS5pbmZvKFwiV3JpdGluZyBjb3ZlcmFnZSBpbmZvcm1hdGlvbjogXCIgKyBjb3ZlckZpbGUpO1xuXG4gICAgICBsZXQgY292ZXJhZ2UgPSAnJztcblxuICAgICAgdHJ5IHtcbiAgICAgICAgZnMubWtkaXJTeW5jKGN3ZCk7XG4gICAgICB9IGNhdGNoIChlKSB7IH1cblxuICAgICAgdHJ5IHtcbiAgICAgICAgY292ZXJhZ2UgPSBmcy5yZWFkRmlsZVN5bmMoY292ZXJGaWxlKS50b1N0cmluZygpO1xuICAgICAgfSBjYXRjaCAoZSkge1xuXG4gICAgICB9XG5cbiAgICAgIGlmIChjb3ZlcmFnZS5sZW5ndGgpIGNvdmVyYWdlID0gY292ZXJhZ2UgKyAnXFxuJztcblxuICAgICAgY292ZXJhZ2UgPVxuICAgICAgICBjb3ZlcmFnZSArPSBPYmplY3Qua2V5cyh0aGlzLmNvdmVyYWdlRGF0YSlcbiAgICAgICAgICAuZmlsdGVyKHggPT4gISF4KVxuICAgICAgICAgIC5tYXAoKGZpbGUpID0+IHtcbiAgICAgICAgICAgIHJldHVybiBjb3ZlcmFnZVRvU3RyaW5nKGZpbGUsIHRoaXMuY292ZXJhZ2VEYXRhW2ZpbGVdIGFzIGFueSk7XG4gICAgICAgICAgfSkuam9pbignXFxuJyk7XG5cbiAgICAgIGZzLndyaXRlRmlsZVN5bmMoY292ZXJGaWxlLCBjb3ZlcmFnZSk7XG5cbiAgICAgIGNvbnNvbGUuaW5mbyhcIldyaXRpbmcgY292ZXJhZ2UgaW5mb3JtYXRpb24uIE9LIVwiKTtcbiAgICB9XG4gIH1cbn1cblxuIl19