const yaml = require('yaml-js');
const fs = require('fs');
const MongoClient = require('mongodb');
const Hapi = require('hapi');

module.exports = class {
  constructor(fileName) {
    this.load(fileName);
    return this;
  }

  load(fileName) {
    let file = fs.readFileSync(fileName);
    this.structure = yaml.load(file);

    try {
      validateSyntax(this.structure);
    } catch (err) {
      console.log(err);
      throw new Error("There was an error with init.");
    }

    let username = process.env[this.structure.username];
    let password = process.env[this.structure.password];
    // todo: check to make sure that these are set, helpful warning to user

    let db = this.__getConnection(username, password);
    db.then((db) => {
      this.db = db;
    })
    .catch((err) => {
      throw new Error("There was an error connecting to the database.");
    });

    this.routes = this.__constructRoutes();
  }

  start(options) {
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

  __getConnection(username, password) {
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
          reject(err);
          return;
        }
        resolve(db);
        return;
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
      return this.__constructRoute(route);
    });
  }

  // construct a route based on the structure
  __constructRoute(route) {
    let path = Object.keys(route)[0];
    route = route[path];
    let method = route.method || 'GET';
    let handler = this.__constructHandler(method, route);
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
      default:
        console.error("Invalid method found.");
        break;
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
