const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

const connectDB =
  require('./config/db');

const securityMiddleware =
  require('./middlewares/security.middleware');

const rateLimiter =
  require('./middlewares/rateLimit.middleware');

const errorMiddleware =
  require('./middlewares/error.middleware');

const productRoutes =
  require('./modules/products/product.routes');

const inquiryRoutes =
  require('./modules/inquiries/inquiry.routes');

const authRoutes =
  require('./modules/auth/auth.routes');

dotenv.config();

const app = express();

/* ======================
   DATABASE
====================== */

connectDB();

/* ======================
   SECURITY
====================== */

securityMiddleware(app);

/* ======================
   GLOBAL MIDDLEWARES
====================== */

app.use(cors({
  origin:
    process.env.CLIENT_URL,
  credentials: true
}));

app.use(rateLimiter);

app.use(express.json({
  limit: '10mb'
}));

app.use(express.urlencoded({
  extended: true,
  limit: '10mb'
}));

/* ======================
   HEALTH CHECK
====================== */

app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    app: 'Marsdove Backend',
    status: 'running'
  });
});

/* ======================
   ROUTES
====================== */

app.use(
  '/api/auth',
  authRoutes
);

app.use(
  '/api/products',
  productRoutes
);

app.use(
  '/api/inquiries',
  inquiryRoutes
);

/* ======================
   ERROR HANDLER
====================== */

app.use(errorMiddleware);

module.exports = app;