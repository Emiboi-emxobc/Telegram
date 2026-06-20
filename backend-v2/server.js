require('dotenv').config();

const app = require('./src/app');

const connectDB =
  require('./src/config/db');

const PORT =
  process.env.PORT || 3000;

/* ======================
   DATABASE, 
====================== */

connectDB();

/* ======================
   SERVER
====================== */
const server = app.listen(
  PORT,
  () => {
    console.log(
      `🚀 Marsdove backend running on ${PORT}`
    );
  }
);

/* ======================
   UNCAUGHT ERRORS
====================== */

process.on(
  'unhandledRejection',
  error => {
    console.error(
      '❌ Unhandled Rejection:',
      error
    );

    server.close(() => {
      process.exit(1);
    });
  }
);

process.on(
  'uncaughtException',
  error => {
    console.error(
      '❌ Uncaught Exception:',
      error
    );

    process.exit(1);
  }
);