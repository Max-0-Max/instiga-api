const express = require('express');
const cors = require('cors');
const profileRoutes = require('./routes/profiles');

const app = express();

// CORS - required for grading script
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

app.use(cors());
app.use(express.json());

app.use('/api/profiles', profileRoutes);

app.get('/', (req, res) => {
  res.json({ status: 'success', message: 'Insighta Labs API v2' });
});

// 404 fallback
app.use((req, res) => {
  res.status(404).json({ status: 'error', message: 'Route not found' });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ status: 'error', message: 'Internal server error' });
});

module.exports = app;