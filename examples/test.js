const restup = require('../index.js');
const path = require('path');

let file = path.resolve(__dirname, 'desired-syntax.yaml');
restup(file);
