const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const { initSchema } = require('./db');
initSchema();

const authRoutes = require('./routes/auth');
const masterRoutes = require('./routes/master');
const pembelianRoutes = require('./routes/pembelian');
const penjualanRoutes = require('./routes/penjualan');
const returRoutes = require('./routes/retur');
const biayaKasRoutes = require('./routes/biayaKas');
const stokRoutes = require('./routes/stok');
const laporanRoutes = require('./routes/laporan');
const periodeRoutes = require('./routes/periode');
const importExportRoutes = require('./routes/importExport');

const app = express();
const PORT = process.env.PORT || 3001;

// Middlewares
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/master', masterRoutes);
app.use('/api/pembelian', pembelianRoutes);
app.use('/api/penjualan', penjualanRoutes);
app.use('/api/retur', returRoutes);
app.use('/api/operasional', biayaKasRoutes);
app.use('/api/stok', stokRoutes);
app.use('/api/laporan', laporanRoutes);
app.use('/api/periode', periodeRoutes);
app.use('/api/import-export', importExportRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    app: 'Multi-Channel Reseller Web App (MCRW Web) v2.0',
    version: '2.0.0-mvp',
    time: new Date().toISOString()
  });
});

// Serve static frontend in production if dist exists
const distPath = path.join(__dirname, '..', 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.use((req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled Server Error:', err);
  res.status(500).json({ error: err.message || 'Terjadi kesalahan pada server.' });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`=======================================================`);
    console.log(` MCRW Web v2.0 Server running on http://localhost:${PORT}`);
    console.log(` Single source of truth active: SQLite WAL mode enabled`);
    console.log(`=======================================================`);
  });
}

module.exports = app;
