const yaml = require('yaml-js');
const fs = require('fs');
const MongoClient = require('mongodb');
const Hapi = require('hapi');

let main = (function(file, options) {
  options = options || {};
  let data = fs.readFileSync(file);
  let structure = yaml.load(data);
  validate(structure);
  
  const server = new Hapi.Server();
  server.connection({ port: options.port || 3000, host: options.host || '0.0.0.0' });


  MongoClient.connect(structure.uri, function(err, db) {
    console.log("Connected successfully to database");

    addRoutes(structure.routes, server, db);

    // start the rest api server
    server.start((err) => {
      if (err) {
        throw err;
      }
      console.log(`Server running at: ${server.info.uri}`);
    });
  });  
});

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

// add all the routes to the server object
function addRoutes(routes, server, db) {
  routes.forEach((route) => {
    server.route(constructRoute(route, db));
  });
}

// construct a route based on the structure
function constructRoute(route, db) {
  let path = Object.keys(route)[0];
  route = route[path];
  let method = route.method || 'GET';
  let handler = constructHandler(method, route, db);
  return {
    method: method,
    path: path,
    handler: handler
  };
}

// construct the handler that will interact with
// mongodb pursuant to the structure
function constructHandler(method, route, db) {
  let handler;
  switch (method) {
    case 'GET':
      handler = constructGetHandler(route, db);
      break;
    default:
      console.error("Invalid method found.");
      break;
  }
  return handler;
}

function constructGetHandler(route, db) {
  let filters = route.filter || [];
  return function(req, resp) {
    let collection = db.collection(route.collection);
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
  }
}

module.exports = main;
