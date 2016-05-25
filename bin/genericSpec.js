var bat = require('../index')();
console.log(context);

bat.load(process.env.HTTP_BAT_FILENAME);
bat.run(process.env.HTTP_BAT_URI);