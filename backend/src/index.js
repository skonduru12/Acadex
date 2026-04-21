require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { startCronJobs } = require('./services/cronService');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json());

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/tasks', require('./routes/tasks'));
app.use('/api/tests', require('./routes/tests'));
app.use('/api/timeblocks', require('./routes/timeblocks'));
app.use('/api/canvas', require('./routes/canvas'));
app.use('/api/calendar', require('./routes/calendar'));
app.use('/api/schedule', require('./routes/schedule'));
app.use('/api/dashboard', require('./routes/dashboard'));

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: new Date() }));

// Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Acadex backend running on port ${PORT}`);
  startCronJobs();
});
