var bat = require('../index')();

bat.load(process.env.HTTP_BAT_FILENAME);
bat.run(process.env.HTTP_BAT_URI);