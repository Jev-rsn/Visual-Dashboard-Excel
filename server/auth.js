const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { db } = require('./db');

// In-memory or database session store
const sessions = new Map(); // token -> { user, expiresAt }

function createSession(user, isPosMode = false) {
  const token = crypto.randomBytes(32).toString('hex');
  // Non-pos expires in 30 minutes; POS can stay longer (8 hours)
  const durationMs = isPosMode ? 8 * 60 * 60 * 1000 : 30 * 60 * 1000;
  const expiresAt = Date.now() + durationMs;

  const sessionData = {
    user: {
      id: user.id,
      nama: user.nama,
      email: user.email,
      peran: user.peran
    },
    expiresAt,
    isPosMode
  };

  sessions.set(token, sessionData);
  return { token, user: sessionData.user, expiresAt };
}

function authMiddleware(req, res, next) {
  const authHeader = req.headers['authorization'];
  let token = null;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  } else if (req.query && req.query.token) {
    token = req.query.token;
  }

  if (!token) {
    return res.status(401).json({ error: 'Akses ditolak: Token autentikasi tidak ditemukan.' });
  }

  const session = sessions.get(token);
  if (!session) {
    return res.status(401).json({ error: 'Sesi tidak valid atau telah berakhir. Silakan login kembali.' });
  }

  if (Date.now() > session.expiresAt) {
    sessions.delete(token);
    return res.status(401).json({ error: 'Sesi telah kedaluwarsa (30 menit tanpa aktivitas). Silakan login kembali.' });
  }

  // Refresh expiration on activity
  if (!session.isPosMode) {
    session.expiresAt = Date.now() + 30 * 60 * 1000;
  }

  req.user = session.user;
  req.token = token;
  next();
}

/**
 * RBAC Role Authorization Middleware
 */
function requireRoles(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Tidak terautentikasi' });
    }

    if (req.user.peran === 'Owner') {
      return next(); // Owner has universal access
    }

    if (!allowedRoles.includes(req.user.peran)) {
      return res.status(403).json({
        error: `Akses ditolak: Peran "${req.user.peran}" tidak memiliki izin untuk tindakan ini.`
      });
    }

    next();
  };
}

/**
 * Sanitize sensitive fields (HPP and Profit) for Kasir & Admin Online (BR-11, UAT-11)
 */
function sanitizeSensitiveFields(data, user) {
  if (!user || user.peran !== 'Kasir & Admin Online') {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map(item => sanitizeSensitiveFields(item, user));
  }

  if (typeof data === 'object' && data !== null) {
    const clean = { ...data };
    delete clean.hpp_snapshot;
    delete clean.total_hpp;
    delete clean.laba_kotor;
    delete clean.hpp_rata_rata;
    delete clean.nilai_persediaan;
    delete clean.total_biaya_hpp;
    delete clean.laba_bersih;
    delete clean.laba_kontribusi;
    delete clean.margin_persen;

    for (const key of Object.keys(clean)) {
      if (typeof clean[key] === 'object' && clean[key] !== null) {
        clean[key] = sanitizeSensitiveFields(clean[key], user);
      }
    }
    return clean;
  }

  return data;
}

module.exports = {
  createSession,
  authMiddleware,
  requireRoles,
  sanitizeSensitiveFields,
  sessions
};
