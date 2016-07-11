![alt text](http://emojipedia-us.s3.amazonaws.com/cache/01/de/01de435caff4774e3ca70eb3b541e131.png "Bat")
# Http Blackbox API Tester (`http-bat`) [![Coverage Status](https://coveralls.io/repos/github/mulesoft-labs/http-bat/badge.svg?branch=develop)](https://coveralls.io/github/mulesoft-labs/http-bat?branch=develop) [![Build Status](https://travis-ci.org/mulesoft-labs/http-bat.svg?branch=develop)](https://travis-ci.org/mulesoft-labs/http-bat)

Describe your platform independient API tests using [ATL (Api Testing Language)](https://github.com/mulesoft-labs/http-bat/wiki/ATL-SPEC--(Api-Testing-Language)) and run them using `http-bat`. It also generate [coverage reports for your RAML files](https://coveralls.io/builds/6914230/source?filename=test%2Fserver%2Ffixtures%2Fexample.raml).

## Usage

### Using command line, usefull for CI

Install the tool using `npm install http-bat -g`

Run your tests on `api` folder:
```
$ http-bat api/*.spec.yml
```

Run your tests with a custom remote URI:
```
$ http-bat github_api/*.spec.yml --uri http://api.github.com
```

### You need it embeded on a Node project? (Useful for coverage and CI)

Install the package
```
$ npm install http-bat --save-dev
```

> `test/api.spec.js` <- mocha spec

```javascript
const lib = require('http-bat');

const app = require('../app'); //express server

const bat = new lib.Bat();

bat.load(__dirname + '/test-1.yml');
bat.run(app /* you could provide an URL too */);

```

### Execute mocha on your project

```
$ mocha
```

![Imgur](http://i.imgur.com/zoV5lH7.gif)

## Demo project

[http-bat-demo](https://github.com/menduz/http-bat-demo)

## Current features

You can read the entire list on [this page](https://github.com/mulesoft-labs/http-bat/wiki/Features)

## Examples

### Wiki examples

- [Full CRUD](https://github.com/mulesoft-labs/http-bat/wiki/Examples:-CRUD)
- [Obtain and use access tokens](https://github.com/mulesoft-labs/http-bat/wiki/Examples:-Obtain-access-token)
- [Travis CI for APIs](https://github.com/mulesoft-labs/http-bat/wiki/Examples:-Travis-CI-for-APIs)
- [Travis CI for APIs (With RAML coverage)](https://github.com/mulesoft-labs/http-bat/wiki/Examples:-RAML-Coverage)
- [Using environment variables](https://github.com/mulesoft-labs/http-bat/wiki/Examples:-Using-environment-variables-&-Login), e.g. storing credentials.

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
      response: 
        status: 401 
        
    GET /profile:
      headers:
        Authorization: Bearer asfgsgh-fasdddss
      response: 
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
            - a: 1
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
            - "[0].id": 1
            - "[1].name": Dan
```

## Execute in sequence. Obtain access token

```yaml

stores: # anything can be stored here
  oauth:
    accessToken: "INVALID_TOKEN"

tests:
  "Access control by token, executed in sequence":
    GET /secured_by_token#should-be-unauthorized:
      description: Must be unauthorized
      queryParameters: 
        accessToken: !!variable oauth.accessToken
      response:
        status: 401

    POST /get_access_token:
      # the server responds { new_token: "asd" }
      description: Obtain access token
      response:
        body:
          take: # take "new_token" from response body
            - new_token: !!variable oauth.accessToken

    GET /secured_by_token:
      description: Now the status must be 200 OK
      queryParameters: 
        # use the access token obtained previously
        accessToken: !!variable oauth.accessToken
      response:
        status: 200
        body:
          is:
            success: true
```

## CRUD

> This example shows how to create an asset, check that it exists, put new content on it and delete it. Then check 404 for the same asset.  
Also shows how use ENVIRONMENTS variables. ENV variables are stored on variables.ENV, can be accessed using `!!variable ENV.*`

```yaml
variables:
  ENV:
    csToken: Bearer <<YOU MUST DEFINE YOUR csToken ON ENV>>
    organizationId: abc123
  flow:
    id: ""

tests:
  "Project create and delete":
    POST /organizations/{orgId}/projects#create'first:
      description: Create project
      uriParameters:
        orgId: !!variable ENV.organizationId
      headers:
        Authorization: !!variable ENV.csToken
      request:
        json:
          name: RetrieveEmployeeFlow,
          created: 06-06-06
          updated: 06-06-06
          environmentId: asd1f65dasf656
          organizationId: !!variable ENV.organizationId
      response:
        status: 201
        body:
          # store the whole response (project) in projectNuevo
          take: !!variable projectNuevo

    GET /organizations/{orgId}/projects/{projectId}:
      description: Check that the created project exists
      uriParameters:
        orgId: !!variable ENV.organizationId
        projectId: !!variable projectNuevo.id
      headers:
        Authorization: !!variable ENV.csToken
      response:
        status: 200
        body:
          matches:
            id: !!variable projectNuevo.id

    PUT /organizations/{orgId}/projects/{projectId}:
      uriParameters:
        orgId: !!variable ENV.organizationId
        projectId: !!variable projectNuevo.id
      headers:
        Authorization: !!variable ENV.csToken
      request:
        json: !!variable projectNuevo
      response:
       status: 200
        body:
          matches:
            id: !!variable projectNuevo.id

    DELETE /organizations/{orgId}/projects/{projectId}:
      uriParameters:
        orgId: !!variable ENV.organizationId
        projectId: !!variable projectNuevo.id
      headers:
        Authorization: !!variable ENV.csToken
      response:
        status: 200

    GET /organizations/{orgId}/projects/{projectId}#mustn't exists:
      uriParameters:
        orgId: !!variable ENV.organizationId
        projectId: !!variable projectNuevo.id
      headers:
        Authorization: !!variable ENV.csToken
      response:
        status: 404

```
