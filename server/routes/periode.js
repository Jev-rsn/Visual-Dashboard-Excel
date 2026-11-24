const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { authMiddleware, requireRoles } = require('../auth');
const { closeAccountingPeriod, reopenAccountingPeriod } = require('../businessLogic');

// GET /api/periode (List accounting periods)
router.get('/', authMiddleware, requireRoles('Owner', 'Admin Keuangan'), (req, res) => {
  const periods = db.prepare('SELECT * FROM periode_akuntansi ORDER BY tahun DESC, bulan DESC').all();

  // Attach snapshots if available
  const result = periods.map(p => {
    const snapshots = db.prepare('SELECT * FROM snapshot_periode WHERE periode_id = ?').all(p.id);
    return {
      ...p,
      snapshots
    };
  });

  res.json(result);
});

// POST /api/periode/tutup (Close period)
router.post('/tutup', authMiddleware, requireRoles('Owner'), (req, res) => {
  try {
    const { bulan, tahun } = req.body;
    if (!bulan || !tahun) return res.status(400).json({ error: 'Bulan dan tahun wajib diisi.' });

    const result = closeAccountingPeriod({
      bulan,
      tahun,
      user: req.user
    });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/periode/buka (Re-open period)
router.post('/buka', authMiddleware, requireRoles('Owner'), (req, res) => {
  try {
    const { bulan, tahun, alasan } = req.body;
    if (!bulan || !tahun || !alasan) {
      return res.status(400).json({ error: 'Bulan, tahun, dan alasan pembukaan wajib diisi.' });
    }

    const result = reopenAccountingPeriod({
      bulan,
      tahun,
      alasan,
      user: req.user
    });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
