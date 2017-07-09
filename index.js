const yaml = require('yaml-js');
const fs = require('fs');
const MongoClient = require('mongodb');
const Hapi = require('hapi');

module.exports = class {
  constructor(fileName) {
    this.fileName = fileName;
    return this;
  }

  async init() {
    // check whether we have already called init
    if (this.initCalled) {
      return this;
    }
    // otherwise note that we just called init
    this.initCalled = true;
    // read the file (TODO: this could probably be async'ed)
    let file = fs.readFileSync(this.fileName);
    // parse the file
    this.structure = yaml.load(file);

    // validate the file
    try {
      validateSyntax(this.structure);
    } catch (err) {
      console.log(err);
      throw "Could not init declarest.";
    }

    let username = process.env[this.structure.username];
    let password = process.env[this.structure.password];
    // todo: check to make sure that these are set, helpful warning to user
    
    try {
      // create the database connection
      this.db = await this.__getConnection(username, password);
      // create the routes
      this.routes = this.__constructRoutes();
    } catch (err) {
      console.error(err);
      throw "Could not init declarest.";
    }
  }

  async start(options) {
    if (!this.initCalled) {
      try {
        await this.init();
      } catch (err) {
        console.error(err);
        return;
      }
    }
    options = options || {};

    // create server
    this.server = new Hapi.Server();
    this.server.connection({
      port: options.port || 8000,
      host: options.host || '0.0.0.0',
      routes: {
        cors: true
      }
    });

    this.__addRoutes();

    // start the rest api server
    this.server.start((err) => {
      if (err) {
        throw err;
      }
      console.log(`Server running at: ${this.server.info.uri}`);
    });
  }

  async __getConnection(username, password) {
    return new Promise((resolve, reject) => {
      let nonauthUri = this.structure.uri;
      let protocalIndex = nonauthUri.indexOf('://');
      if (protocalIndex < 0) {
        reject("There is no protocal specified in the uri.");
      }
      let protocal = nonauthUri.substring(0, protocalIndex);
      // '://' is 3 characters long
      let hostPortCollectionUri = nonauthUri.substring(protocalIndex + 3);
      let uri = `${protocal}://${username}:${password}@${hostPortCollectionUri}`;
      MongoClient.connect(uri, function(err, db) {
        if (err) {
          console.error(err);
          reject('Could not connect to the database');
        }
        resolve(db);
      });
    });
  }

  // add all the routes to the server object
  __addRoutes() {
    this.routes.forEach((route) => {
      this.server.route(route);
    });
  }
  
  __constructRoutes() {
    let routes = this.structure.routes;
    return routes.map((route) => {
      try {
        return this.__constructRoute(route);
      } catch (err) {
        console.error(err);
        throw new Error("Error constructing routes.");
      }
    });
  }

  // construct a route based on the structure
  __constructRoute(route) {
    let path = Object.keys(route)[0];
    route = route[path];
    let method = route.method || 'GET';
    let handler;
    try {
      handler = this.__constructHandler(method, route);
    } catch (err) {
      console.error(err);
      throw new Error("Unable to construct route handler.");
    }
    return {
      method: method,
      path: path,
      handler: handler
    };
  }

  // construct the handler that will interact with
  // mongodb pursuant to the structure
  __constructHandler(method, route) {
    let handler;
    switch (method) {
      case 'GET':
        handler = this.__constructGetHandler(route);
        break;
      case 'POST':
        handler = this.__constructPostHandler(route);
        break;
      case 'PUT':
        handler = this.__constructPutHandler(route);
        break;
      default:
        console.error("Invalid method provided.");
        throw new Error();
    }
    return handler;
  }

  __constructGetHandler(route) {
    let filters = route.filter || [];
    return (function(req, resp) {
      let collection = this.db.collection(route.collection);
      let cursor = collection.find({});

      // add filters to the search
      for (let filter of filters) {
        cursor = cursor.filter(filter);
      }
      
      cursor.toArray(function(err, docs) {
        if (err) {
          console.error(err);
          resp("Oh oh!");
        }
        resp(docs);
      });
    }).bind(this);
  }

  // create a new post handler
  __constructPostHandler(route) {
    // if there is no prepost specified, we don't want to run it
    let prepost = false;
    // check if prepost was specified
    if (route.prepost) {
      // if it is, create the prepost function from the supplied file
      prepost = function(req, resp, next) {
        require(route.prepost)(req, resp, next);
      }
    }
    // return the method handler function
    return (function(req, resp) {
      // create the post handler function
      // this function is the main db interacting function
      let postHandler = (function(req, resp) {
        let collection = this.db.collection(route.collection);
        // get the body as a JS object, we will be inserting this
        // into the database
        let body = req.payload;

        // attempt to insert the document
        collection.insertOne(body)
        .then((result) => {
          // report success
          let success = {
            status: 201,
            id: result._id
          }
          resp(success).code(success.status);
          return;
        })
        .catch((err) => {
          // report error
          console.error(err);
          let error = {
            status: 400,
            error: "We could not add the provided document."
          }
          resp(error).code(error.status);
          return;
        });
      }).bind(this);

      // check whether we need to run prepost
      if (prepost) {
        // if so, call the created prepost function
        // we pass in postHandler as the callback
        prepost(req, resp, postHandler);
      } else {
        // if not, just call the postHandler
        postHandler(req, resp);
      }
    }).bind(this);
  }

  // create a new put handler
  __constructPutHandler(route) {
    // if there is no preput specified, we don't want to run it
    let preput = false;
    // check if prepost was specified
    if (route.preput) {
      // if it is, create the prepost function from the supplied file
      preput = function(req, resp, next) {
        require(route.preput)(req, resp, next);
      }
    }
    // return the method handler function
    return (function(req, resp) {
      // create the put handler function
      // this function is the main db interacting function
      let putHandler = (function(req, resp) {
        let collection = this.db.collection(route.collection);
        // get the body as a JS object, we will be inserting this
        // into the database
        let body = req.payload;

        // change _id to an ObjectId
        body._id = new MongoClient.ObjectId(body._id);
        
        // attempt to update the document
        collection.findOneAndUpdate(
          { _id: body._id },
          { $set : body }
        )
        .then((result) => {
          // report success
          let success = {
            status: 200,
          }
          resp(success).code(success.status);
          return;
        })
        .catch((err) => {
          // report error
          console.error(err);
          let error = {
            status: 400,
            error: "We could not add the provided document."
          }
          resp(error).code(error.status);
          return;
        });
      }).bind(this);

      // check whether we need to run prepost
      if (preput) {
        // if so, call the created prepost function
        // we pass in postHandler as the callback
        preput(req, resp, putHandler);
      } else {
        // if not, just call the postHandler
        putHandler(req, resp);
      }
    }).bind(this);
  }
}

// validate the syntax of the structure file
function validateSyntax(structure) {
  let failed = false;

  if (!structure.uri) {
    console.error("No uri parameter found.");
    failed = true;
  }

  if (!structure.username) {
    console.error("No username parameter found.");
    failed = true;
  }

  if (!structure.password) {
    console.error("No password parameter found.");
    failed = true;
  }

  if (failed) {
    throw new Error("Check error logs for errors.");
  }
  return;
}
