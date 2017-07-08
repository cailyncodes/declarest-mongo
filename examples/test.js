const Declarest = require('../index.js');

const path = require('path');
let file = path.resolve(__dirname, 'example1.yaml');

new Declarest(file).start();

file = path.resolve(__dirname, 'example2.yaml');

new Declarest(file).start({port:3001});
