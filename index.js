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

    validate(this.structure);

    let db = this.__getConnection();
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
    this.server.connection({ port: options.port || 3000, host: options.host || '0.0.0.0' });

    this.__addRoutes();

    // start the rest api server
    this.server.start((err) => {
      if (err) {
        throw err;
      }
      console.log(`Server running at: ${this.server.info.uri}`);
    });
  }

  __getConnection() {
    return new Promise((resolve, reject) => {
      MongoClient.connect(this.structure.uri, function(err, db) {
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
function validate(structure) {
  let failed = false;

  if (!structure.uri) {
    console.error("No uri parameter found.");
    failed = true;
  }

  if (failed) new Error("Check error logs for errors.");
  return;
}
