const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { db } = require('../db');
const { createSession, authMiddleware, requireRoles } = require('../auth');
const { logAudit } = require('../businessLogic');

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { email, password, isPosMode } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email dan password wajib diisi.' });
  }

  const user = db.prepare('SELECT * FROM pengguna WHERE email = ? AND aktif = 1').get(email);
  if (!user) {
    return res.status(401).json({ error: 'Email atau password salah.' });
  }

  const match = bcrypt.compareSync(password, user.password_hash);
  if (!match) {
    return res.status(401).json({ error: 'Email atau password salah.' });
  }

  const session = createSession(user, Boolean(isPosMode));
  logAudit(user, 'pengguna', user.id, 'LOGIN', null, { ip: req.ip, isPosMode });

  res.json({
    message: 'Login berhasil.',
    token: session.token,
    user: session.user,
    expiresAt: session.expiresAt
  });
});

// GET /api/auth/me
router.get('/me', authMiddleware, (req, res) => {
  res.json({ user: req.user });
});

// POST /api/auth/logout
router.post('/logout', authMiddleware, (req, res) => {
  const { sessions } = require('../auth');
  if (req.token) {
    sessions.delete(req.token);
  }
  res.json({ message: 'Logout berhasil.' });
});

// GET /api/auth/users (Owner only)
router.get('/users', authMiddleware, requireRoles('Owner'), (req, res) => {
  const users = db.prepare('SELECT id, nama, email, peran, aktif, created_at FROM pengguna ORDER BY id ASC').all();
  res.json(users);
});

// POST /api/auth/users (Owner only)
router.post('/users', authMiddleware, requireRoles('Owner'), (req, res) => {
  const { nama, email, password, peran } = req.body;
  if (!nama || !email || !password || !peran) {
    return res.status(400).json({ error: 'Semua bidang wajib diisi.' });
  }

  const existing = db.prepare('SELECT id FROM pengguna WHERE email = ?').get(email);
  if (existing) {
    return res.status(400).json({ error: 'Email sudah terdaftar.' });
  }

  const hash = bcrypt.hashSync(password, 10);
  const now = new Date().toISOString();

  const insert = db.prepare(`
    INSERT INTO pengguna (nama, email, password_hash, peran, aktif, created_at)
    VALUES (?, ?, ?, ?, 1, ?)
  `);
  const result = insert.run(nama, email, hash, peran, now);

  logAudit(req.user, 'pengguna', result.lastInsertRowid, 'CREATE_USER', null, { nama, email, peran });

  res.json({ success: true, message: 'Pengguna berhasil ditambahkan.' });
});

// PUT /api/auth/users/:id (Owner only)
router.put('/users/:id', authMiddleware, requireRoles('Owner'), (req, res) => {
  const { nama, email, password, peran, aktif } = req.body;
  const user = db.prepare('SELECT * FROM pengguna WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'Pengguna tidak ditemukan.' });

  let hash = user.password_hash;
  if (password && password.trim()) {
    hash = bcrypt.hashSync(password, 10);
  }

  db.prepare(`
    UPDATE pengguna
    SET nama = ?, email = ?, password_hash = ?, peran = ?, aktif = ?
    WHERE id = ?
  `).run(nama || user.nama, email || user.email, hash, peran || user.peran, aktif !== undefined ? aktif : user.aktif, user.id);

  logAudit(req.user, 'pengguna', user.id, 'UPDATE_USER', { nama: user.nama, peran: user.peran }, { nama, peran, aktif });

  res.json({ success: true, message: 'Data pengguna berhasil diperbarui.' });
});

// GET /api/audit-logs
router.get('/audit-logs', authMiddleware, requireRoles('Owner', 'Admin Keuangan'), (req, res) => {
  const { limit = 100, entitas, pengguna_id } = req.query;

  let query = 'SELECT * FROM audit_log WHERE 1=1';
  const params = [];

  if (entitas) {
    query += ' AND entitas = ?';
    params.push(entitas);
  }
  if (pengguna_id) {
    query += ' AND pengguna_id = ?';
    params.push(pengguna_id);
  }

  query += ' ORDER BY id DESC LIMIT ?';
  params.push(Number(limit));

  const logs = db.prepare(query).all(...params);
  res.json(logs);
});

module.exports = router;
