const crypto = require('crypto');
const db = require('../db');

const SESSION_DAYS = 30;
const isProd = process.env.NODE_ENV === 'production';
const cookieBase = { httpOnly: true, sameSite: 'lax', secure: isProd, path: '/' };

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}
function verifyPassword(password, stored) {
  const [alg, saltHex, hashHex] = String(stored).split('$');
  if (alg !== 'scrypt') return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

/* Identifica al visitante (cookie pid) y al usuario (cookie sid) en cada petición. */
function identify(req, res, next) {
  let pid = req.cookies.pid;
  if (!/^[0-9a-f-]{36}$/.test(pid || '')) {
    pid = crypto.randomUUID();
    res.cookie('pid', pid, { ...cookieBase, maxAge: 365 * 864e5 });
  }
  req.visitorId = pid;

  req.user = null;
  const sid = req.cookies.sid;
  if (sid) {
    const row = db.prepare(`SELECT u.id, u.name, u.email, u.role FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND s.expires_at > ?`).get(sha256(sid), new Date().toISOString());
    if (row) req.user = row;
  }
  // Dueño de favoritos y bolsa: el usuario si inició sesión; si no, el visitante.
  req.owner = req.user ? { col: 'user_id', val: req.user.id } : { col: 'visitor_id', val: pid };
  next();
}

function startSession(res, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + SESSION_DAYS * 864e5);
  db.prepare('INSERT INTO sessions (token_hash,user_id,expires_at) VALUES (?,?,?)').run(sha256(token), userId, expires.toISOString());
  res.cookie('sid', token, { ...cookieBase, expires });
}
function endSession(req, res) {
  if (req.cookies.sid) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(req.cookies.sid));
  res.clearCookie('sid', cookieBase);
}

/* Al iniciar sesión, lo que el visitante tenía en favoritos y bolsa pasa a su cuenta. */
function mergeVisitorInto(userId, visitorId) {
  db.transaction(() => {
    db.prepare(`INSERT OR IGNORE INTO favorites (user_id, product_id)
      SELECT ?, product_id FROM favorites WHERE visitor_id = ?`).run(userId, visitorId);
    db.prepare('DELETE FROM favorites WHERE visitor_id = ?').run(visitorId);
    const items = db.prepare('SELECT * FROM cart_items WHERE visitor_id = ?').all(visitorId);
    for (const it of items) {
      const same = db.prepare(`SELECT id FROM cart_items WHERE user_id = ? AND product_id = ?
        AND color_id IS ? AND size_id IS ?`).get(userId, it.product_id, it.color_id, it.size_id);
      if (same) db.prepare('UPDATE cart_items SET qty = MIN(99, qty + ?) WHERE id = ?').run(it.qty, same.id);
      else db.prepare('INSERT INTO cart_items (user_id,product_id,color_id,size_id,qty) VALUES (?,?,?,?,?)')
        .run(userId, it.product_id, it.color_id, it.size_id, it.qty);
    }
    db.prepare('DELETE FROM cart_items WHERE visitor_id = ?').run(visitorId);
  })();
}

const requireAuth = (req, res, next) =>
  req.user ? next() : res.status(401).json({ error: 'Inicia sesión para continuar.' });
const requireAdmin = (req, res, next) =>
  req.user && req.user.role === 'admin' ? next() : res.status(403).json({ error: 'Acceso restringido.' });

/* Limitador sencillo en memoria (por IP y ruta) para login, registro y formularios públicos. */
function rateLimit({ windowMs, max }) {
  const hits = new Map();
  return (req, res, next) => {
    const key = req.ip + req.path;
    const now = Date.now();
    const arr = (hits.get(key) || []).filter((t) => now - t < windowMs);
    if (arr.length >= max) return res.status(429).json({ error: 'Demasiados intentos. Inténtalo en unos minutos.' });
    arr.push(now); hits.set(key, arr);
    next();
  };
}

module.exports = { hashPassword, verifyPassword, identify, startSession, endSession, mergeVisitorInto,
  requireAuth, requireAdmin, rateLimit };
