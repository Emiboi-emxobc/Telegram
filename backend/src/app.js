const express = require('express');
const cors = require('cors');
const cookieParser =
  require('cookie-parser');

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

const app = express();

app.set('trust proxy', 1);

/* SECURITY */
securityMiddleware(app);

/* GLOBAL MIDDLEWARES */

app.use(cors({
  origin:
    process.env.CLIENT_URL ||
    'http://localhost:5173',
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

app.use(cookieParser());

/* HEALTH */

app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    app: 'Marsdove Backend',
    status: 'running'
  });
});

/* ROUTES */

app.use('/api/auth', authRoutes);

app.use(
  '/api/products',
  productRoutes
);

app.use(
  '/api/inquiries',
  inquiryRoutes
);

/* 404 */

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});
/* ERROR */

app.use(errorMiddleware);

module.exports = app;