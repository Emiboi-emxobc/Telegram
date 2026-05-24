const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');

const securityMiddleware = require('./middlewares/security.middleware');
const rateLimiter = require('./middlewares/rateLimit.middleware');
const errorMiddleware = require('./middlewares/error.middleware');

const productRoutes = require('./modules/products/product.routes');
const inquiryRoutes = require('./modules/inquiries/inquiry.routes');
const authRoutes = require('./modules/auth/auth.routes');

const app = express();

/* =========================
   TRUST PROXY (FOR RENDER / VERCEL / NGINX)
========================= */
app.set('trust proxy', 1);

/* =========================
   SECURITY LAYER
========================= */
securityMiddleware(app);

/* =========================
   CORS CONFIG
========================= */
const allowedOrigins = [
  process.env.CLIENT_URL,
  'http://localhost:7700/',
  
].filter(Boolean);

app.use(
  cors({
    origin: function (origin, callback) {
      // allow mobile apps / postman / server-to-server
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error('CORS blocked'), false);
    },
    credentials: true
  })
);

/* =========================
   GLOBAL MIDDLEWARES
========================= */
app.use(rateLimiter);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use(cookieParser());

/* =========================
   HEALTH CHECK
========================= */
app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    app: 'Marsdove Backend',
    status: 'running',
    timestamp: new Date().toISOString()
  });
});

/* =========================
   API ROUTES
========================= */
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/inquiries', inquiryRoutes);

/* =========================
   404 HANDLER
========================= */
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.originalUrl}`
  });
});

/* =========================
   ERROR HANDLER
========================= */
app.use(errorMiddleware);

module.exports = app;