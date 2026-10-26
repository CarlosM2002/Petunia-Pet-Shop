/* Crea (o convierte en administrador) una cuenta SIN borrar datos.
   Uso:  node db/crear-admin.js correo@ejemplo.com "una-contraseña-larga" "Tu nombre" */
const db = require('./index');
const { hashPassword } = require('../src/auth');

const [email, password, name = 'Administrador'] = process.argv.slice(2);
if (!email || !password || password.length < 8) {
  console.log('Uso: node db/crear-admin.js correo@ejemplo.com "contraseña-de-8+-caracteres" "Tu nombre"');
  process.exit(1);
}
db.prepare(`INSERT INTO users (name,email,password_hash,role) VALUES (?,?,?, 'admin')
  ON CONFLICT(email) DO UPDATE SET role='admin', password_hash=excluded.password_hash`)
  .run(name, email.toLowerCase(), hashPassword(password));
console.log(`Listo: ${email} ya es administrador. Entra en /admin.html`);
