describe('Set up context', function () {
    this.ctx = {
        batFile: __dirname + '/mocha.context.yml',
        variables: {
            connectionHeader: 'close'
        },
        baseUri: 'https://github.com'
    };

    require('../index')()

    it('ends', function () { })
})

describe('Set up context, test RAW yaml', function () {
    this.ctx = {
        rawBat: [
            "tests:",
            "  RAW_TESTS:",
            "    GET /:",
            "      description: RAW YAML"
        ].join("\n"),
        baseUri: 'https://github.com'
    };

    require('../index')()

    it('ends', function () { })
})