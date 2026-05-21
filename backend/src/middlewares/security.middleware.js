const helmet = require('helmet');


module.exports = function (
  app
) {
  app.disable('x-powered-by');

  app.use(
    helmet({
      crossOriginResourcePolicy:
        false
    })
  );

  
  };
