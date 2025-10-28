import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { prisma } from './utils/prisma.js';

// Rotas
import authRoutes from './routes/auth.js';
import productRoutes from './routes/products.js';
import paymentRoutes from './routes/payments.js';
import saleRoutes from './routes/sales.js';
import reportRoutes from './routes/reports.js';
import categoryRoutes from './routes/categories.js';
import additionalCategoryRoutes from './routes/additionalCategories.js';
import additionalRoutes from './routes/additionals.js';
import settingsRoutes from './routes/settings.js';

dotenv.config({ override: true });

const app = express();
const PORT = process.env.PORT || 4000;

// CORS configurável por env (múltiplas origens)
const allowedOrigins = (process.env.CORS_ORIGINS || '*')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);
const devWhitelist = ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:3002'];

app.use(cors({
  origin: function (origin, callback) {
    // Permite ferramentas locais sem origin
    if (!origin) return callback(null, true);
    const isDev = process.env.NODE_ENV !== 'production';
    const isLocalhost = /^http:\/\/localhost:\d+$/.test(origin);
    if (
      allowedOrigins.includes('*') ||
      allowedOrigins.includes(origin) ||
      (isDev && (devWhitelist.includes(origin) || isLocalhost))
    ) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS: ' + origin), false);
  },
  credentials: true,
}));

app.use(express.json());

// Healthcheck
app.get('/health', (req, res) => {
  res.json({ status: 'ok', env: process.env.NODE_ENV || 'development' });
});

// Prefixo API
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/sales', saleRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/additional-categories', additionalCategoryRoutes);
app.use('/api/additionals', additionalRoutes);
app.use('/api/settings', settingsRoutes);

// Tratamento de erros genérico
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal Server Error' });
});

app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
});