describe('Set up context', function () {
    this.ctx = {
        batFile: __dirname + '/mocha.context.yml',
        variables: {
            connectionHeader: 'close'
        },
        baseUri: 'https://github.com'
    };

    require('../index')()
})