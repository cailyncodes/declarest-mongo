const Declarest = require('../index.js');

const path = require('path');
let file = path.resolve(__dirname, 'example1.yaml');

new Declarest(file).start();
