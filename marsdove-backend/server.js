require("dotenv").config();

const app = require("./src/app");

const connectDB =
  require("./src/config/db");

const seedAdmin =
  require("./src/seedAdmin.js");

const PORT =
  process.env.PORT || 3000;

/* ======================
   START SERVER
====================== */

async function startServer() {
  try {
    await connectDB();

    await seedAdmin();

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
      "unhandledRejection",
      error => {
        console.error(
          "❌ Unhandled Rejection:",
          error
        );

        server.close(() => {
          process.exit(1);
        });
      }
    );

    process.on(
      "uncaughtException",
      error => {
        console.error(
          "❌ Uncaught Exception:",
          error
        );

        process.exit(1);
      }
    );

  } catch (error) {
    console.error(
      "❌ Failed to start server:",
      error
    );

    process.exit(1);
  }
}

startServer();
