const helmet =
  require('helmet');

const hpp =
  require('hpp');

const compression =
  require('compression');

const cookieParser =
  require('cookie-parser');

const morgan =
  require('morgan');

module.exports =
  function(app) {

    /* ======================
       HIDE EXPRESS
    ====================== */

    app.disable(
      'x-powered-by'
    );

    /* ======================
       TRUST PROXY
    ====================== */

    app.set(
      'trust proxy',
      1
    );

    /* ======================
       SECURITY HEADERS
    ====================== */

    app.use(
      helmet({
        crossOriginResourcePolicy:
          false,

        contentSecurityPolicy:
          false
      })
    );

    /* ======================
       PARSE COOKIES
    ====================== */

    app.use(
      cookieParser()
    );

    /* ======================
       HTTP PARAM POLLUTION
    ====================== */

    app.use(hpp());

    /* ======================
       RESPONSE COMPRESSION
    ====================== */

    app.use(
      compression()
    );

    /* ======================
       REQUEST LOGGER
    ====================== */

    app.use(
      morgan('dev')
    );

  };