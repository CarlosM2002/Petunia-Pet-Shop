const express = require('express');
const db = require('../../db');
const { hashPassword, verifyPassword, startSession, endSession, mergeVisitorInto, requireAuth, rateLimit } = require('../auth');

const router = express.Router();
const text = (v, max) => String(v ?? '').trim().slice(0, max);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const strict = rateLimit({ windowMs: 15 * 60e3, max: 20 });

/* ───────── Cuenta ───────── */
const publicUser = (u) => ({ name: u.name, email: u.email, role: u.role });

router.post('/auth/register', strict, (req, res) => {
  const name = text(req.body.name, 80), email = text(req.body.email, 160).toLowerCase(), password = String(req.body.password || '');
  if (!name) return res.status(400).json({ error: 'Escribe tu nombre.' });
  if (!EMAIL.test(email)) return res.status(400).json({ error: 'Escribe un correo válido.' });
  if (password.length < 8) return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres.' });
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) return res.status(409).json({ error: 'Ya existe una cuenta con ese correo.' });
  const id = db.prepare('INSERT INTO users (name,email,password_hash) VALUES (?,?,?)').run(name, email, hashPassword(password)).lastInsertRowid;
  mergeVisitorInto(id, req.visitorId);
  startSession(res, id);
  res.status(201).json({ user: { name, email, role: 'customer' } });
});

router.post('/auth/login', strict, (req, res) => {
  const email = text(req.body.email, 160).toLowerCase(), password = String(req.body.password || '');
  const u = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!u || !verifyPassword(password, u.password_hash)) return res.status(401).json({ error: 'Correo o contraseña incorrectos.' });
  mergeVisitorInto(u.id, req.visitorId);
  startSession(res, u.id);
  res.json({ user: publicUser(u) });
});

router.post('/auth/logout', (req, res) => { endSession(req, res); res.json({ ok: true }); });
router.get('/auth/me', (req, res) => res.json({ user: req.user && publicUser(req.user) }));

/* ───────── Reseñas ───────── */
router.post('/products/:slug/reviews', requireAuth, (req, res) => {
  const p = db.prepare('SELECT id FROM products WHERE slug = ? AND active = 1').get(req.params.slug);
  if (!p) return res.status(404).json({ error: 'Producto no encontrado.' });
  const rating = parseInt(req.body.rating, 10), body = text(req.body.body, 1000);
  if (!(rating >= 1 && rating <= 5)) return res.status(400).json({ error: 'Elige de 1 a 5 estrellas.' });
  if (body.length < 3) return res.status(400).json({ error: 'Cuéntanos un poco más en tu opinión.' });
  db.prepare(`INSERT INTO reviews (product_id,user_id,rating,body) VALUES (?,?,?,?)
    ON CONFLICT(product_id,user_id) DO UPDATE SET rating = excluded.rating, body = excluded.body`).run(p.id, req.user.id, rating, body);
  const agg = db.prepare('SELECT COUNT(*) AS count, AVG(rating) AS average FROM reviews WHERE product_id = ?').get(p.id);
  res.status(201).json({ count: agg.count, average: Math.round(agg.average * 10) / 10 });
});

/* ───────── Newsletter ───────── */
router.post('/newsletter', strict, (req, res) => {
  const email = text(req.body.email, 160).toLowerCase();
  if (!EMAIL.test(email)) return res.status(400).json({ error: 'Escribe un correo válido.' });
  if (!req.body.consent) return res.status(400).json({ error: 'Marca la casilla para aceptar recibir correos.' });
  const r = db.prepare('INSERT OR IGNORE INTO newsletter_subscribers (email, consent) VALUES (?, 1)').run(email);
  res.status(r.changes ? 201 : 200).json({ message: r.changes ? '¡Gracias por suscribirte!' : 'Ya estabas suscrito. ¡Gracias!' });
});

/* ───────── Chat ───────── */
router.get('/chat', (req, res) => {
  const greeting = db.prepare("SELECT value FROM site_settings WHERE key = 'chat_greeting'").get()?.value;
  const messages = db.prepare('SELECT id, sender, body, created_at AS createdAt FROM chat_messages WHERE visitor_id = ? ORDER BY id').all(req.visitorId);
  res.json({ greeting, messages });
});

router.post('/chat', rateLimit({ windowMs: 60e3, max: 15 }), (req, res) => {
  const body = text(req.body.body, 1000);
  if (!body) return res.status(400).json({ error: 'Escribe un mensaje.' });
  const first = !db.prepare('SELECT 1 FROM chat_messages WHERE visitor_id = ?').get(req.visitorId);
  const ins = db.prepare('INSERT INTO chat_messages (visitor_id,user_id,sender,body) VALUES (?,?,?,?)');
  ins.run(req.visitorId, req.user?.id ?? null, 'customer', body);
  if (first) ins.run(req.visitorId, null, 'agent', 'Gracias por escribirnos. Recibimos tu mensaje y te responderemos pronto.');
  res.status(201).json(db.prepare('SELECT id, sender, body, created_at AS createdAt FROM chat_messages WHERE visitor_id = ? ORDER BY id').all(req.visitorId));
});

module.exports = router;
