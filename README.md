![alt text](http://emojipedia-us.s3.amazonaws.com/cache/01/de/01de435caff4774e3ca70eb3b541e131.png "Bat")
# Http Blackbox API Tester (`http-bat`) [![Coverage Status](https://coveralls.io/repos/github/mulesoft-labs/http-bat/badge.svg?branch=develop)](https://coveralls.io/github/mulesoft-labs/http-bat?branch=develop) [![Build Status](https://travis-ci.org/mulesoft-labs/http-bat.svg?branch=develop)](https://travis-ci.org/mulesoft-labs/http-bat)

It's a markup for blackbox tests. Based on YAML

It uses supertest and mocha to test APIs

## Usage

### Using command line

```
$ npm install http-bat -g
$ http-bat google-apis/*.spec.yml --uri https://api.google.com
```

### Using node test.spec.js files

```
$ npm install http-bat --save-dev
```

Create a spec file

```javascript

const bat = require('http-bat')();

const app = require('../app'); //express server

bat.load(__dirname + '/test-1.yml');
bat.run(app);

```

Execute mocha on your project

```
$ mocha
```

![Imgur](http://i.imgur.com/zoV5lH7.gif)

## Examples

### Test response status code

```yaml
tests:
  "Favicon must exists":
    GET /favicon.ico:
      response:
        status: 200
  "Should return 401":
    GET /unauthorized_url:
      response:
        status: 401
  "Should return 404":
    GET /asjdnasjdnkasf:
      response:
        status: 404
```

### Send query string parameters

```yaml
tests:
  "Inline query string":
    GET /orders?page=10:
      response:
        status: 200
  "Non inline":
    GET /orders:
      queryParameters:
        page: 10
      response:
        status: 200
  "Override inline query string":
    # The final url will be /orders?page=10&qty=20 
    GET /orders?page={----asd---}&qty=20:
      queryParameters:
        page: 10                 
      response:
        status: 200
```

### Validate response ´Content-Type´

```yaml
tests:
  "Must return text":
    GET /responses/text:
      response:
        content-type: text/plain  
  "Must return json":
    GET /responses/json:
      response:
        content-type: application/json
  "Must return url-encoded":
    GET /responses/url-encoded:
      response:
        content-type: application/x-www-form-urlencoded
```

### Send headers

```yaml
tests:
  "Headers":
    GET /profile#UNAUTHORIZED:
      # headers:
      #  Authorization: Bearer asfgsgh-fasdddss
      response: 
        # UNAUTHORIZED
        status: 401 
    GET /profile:
      headers:
        Authorization: Bearer asfgsgh-fasdddss
      response: 
        # OK
        status: 200 
```


### Validate response headers

```yaml
tests:
  "Headers":
    PUT /bounce/headers:
      response:
        headers: 
          Access-Control-Allow-Headers: "Authorization, X-Default-Header, X-Custom-Header" # literal value
```

### Validate response content

```yaml
tests:
  "Must validate response body":
    GET /text:
      response:
        body: 
          content-type: text/plain
          is: "Success"
          # "is" means equals. In this case the response is the text "Success"
          
    GET /json:
      response:
        body: 
          content-type: application/json
          is: !!map { json: true }
          # "is" means equals. In this case the response is the JSON {"json":true}
    
    GET /json/v1:
      response:
        body: 
          content-type: application/json
          is: 
            json: true
            # "is" means equals. In this case the response is the JSON {"json":true}
            # this is the same as the previous example
```

### Validate response (partially)

```yaml
tests:
  "Must validate response body":
    GET /json:
      response:
        body: 
          content-type: application/json
          # In this case the response is the JSON { "json":true, "a": 1, "b": 2 }
          matches:
            a: 1
          # "json" and "b" properties will be ignored
          
          
    GET /users:
      response:
        body: 
          content-type: application/json
          # In this case the response is the JSON 
          # [ 
          #    { "id": 1, "name": "Agu" }, 
          #    { "id": 2, "name": "Dan" } 
          # ]
          matches:
            "[0].id": 1
            "[1].name": Dan
```


```yaml
# BAT

baseUri: http://localhost:3000

stores:
  oauth:
    accessToken: "EMPTY_VALUE"
  ENV:
    NODE_ENV: FAKE_ENV
    PORT: 0

tests:
  "Test 404 error":
    GET /asjdnasjdnkasf:
      response:
        status: 404



  "Another":
    GET /hello?name=ERROR:
      queryParameters:
        name: agusA
      response:
        status: 200
        body:
          is: "Hello agusA!"



  "Another tests":
    GET /status/200:
      response:
        status: 200
        body:
         is: "Success"



    GET /hello:
      response:
        status: 200
        body:
          is: "Hello World!"



    GET /hello?name=agus:
      response:
        status: 200
        body:
          is: "Hello agus!"



  "Headers":
    PUT /bounce/headers:
      headers:
        Authorization: test
      response:
        headers:
          Access-Control-Allow-Headers: "Authorization, X-Default-Header, X-Custom-Header"
        body:
          matches:
            authorization: test



  "Text Response":
    GET /responses/text:
      response:
        status: 200
        body:
          is: 'text'



  "JSON Response":
    GET /responses/json:
      response:
        status: 200
        body:
          is: !!map { json: true }



  "Regexp body":
    GET /stream:
      response:
        status: 200
        body:
          is: !!js/regexp /^Lorem/



  "Url encoded responses":
    GET /responses/url-encoded/basic:
      response:
        status: 200
        content-type: application/x-www-form-urlencoded
        body:
          is:
            key: value



    GET /responses/url-encoded/duplicate:
      response:
        status: 200
        content-type: application/x-www-form-urlencoded
        body:
          is:
            key: [ 1, 2, 3 ]



    GET /responses/url-encoded/escaped:
      response:
        status: 200
        content-type: application/x-www-form-urlencoded
        body:
          is:
            key: "Hello, world!"



  "Post tests":
    POST /post-body/json:
      request:
        json: &ref_value_json
          string: "value"
          number: 123
      response:
        status: 200
        body:
          is: *ref_value_json



    POST /post-body/attach-file:
      request:
        attach:
          - file: 'server/fixtures/lorem.txt'
      response:
        status: 200
        body:
          is:
            - file: lorem.txt



    POST /post-body/attach-file?multiple:
      request:
        attach:
          - file: 'server/fixtures/lorem.txt'
          - file: 'server/fixtures/lorem.txt'
          - "file-otherName": 'server/fixtures/lorem.txt'
      response:
        status: 200
        body:
          is:
            - file: 'lorem.txt'
            - file: 'lorem.txt'
            - "file-otherName": 'lorem.txt'



    POST /post-body/url:
      request:
        urlencoded: &form-data-1
          - name: 'agustin'
          - name: 'agustin'
          - another: 123
      response:
        status: 200
        body:
          is: *form-data-1



    POST /post-body/form:
      request:
        form: &form-data-2
          - name: 'agustin'
          - name: 'agustin'
          - another: 123string
      response:
        status: 200
        body:
          print: true
          is: *form-data-2



    POST /post-body/form-n-files:
      request:
        attach:
          - file: 'server/fixtures/lorem.txt'
        form:
          - name: 'agustin'
          - name: 'agustin'
          - another: 123string
      response:
        status: 200
        print: true
        body:
          is:
            - file: "lorem.txt"
            - name: 'agustin'
            - name: 'agustin'
            - another: 123string



  "Access control by token":
    GET /secured_by_token#should-be-unauthorized:
      queryParameters: 
        accessToken: !!pointer oauth.accessToken
      response:
        status: 401
        
    GET /secured_by_token/header#should-be-unauthorized:
      headers: 
        Authorization: !!pointer oauth.accessToken
      response:
        status: 401



    POST /get_access_token:
      # responses { new_token: "asd" }
      response:
        body:
          take: # take a value from body
            new_token: !!pointer oauth.accessToken


    GET /secured_by_token:
      queryParameters: 
        accessToken: !!pointer oauth.accessToken
      response:
        status: 200
        body:
          is:
            success: true


    GET /secured_by_token/header:
      headers: 
        Authorization: !!pointer oauth.accessToken
      response:
        status: 200
        body:
          is:
            success: true
```
