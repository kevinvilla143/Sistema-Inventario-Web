const Database = require('better-sqlite3');
const bcrypt = require('bcrypt');

const db = new Database('dev.db');
db.pragma('journal_mode = WAL');

db.exec(`
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT DEFAULT 'user'
  );
  CREATE TABLE IF NOT EXISTS productos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    precio REAL NOT NULL,
    stock INTEGER NOT NULL,
    stock_minimo INTEGER NOT NULL,
    categoria TEXT DEFAULT 'otro',
    imagen TEXT
  );
  CREATE TABLE IF NOT EXISTS ventas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    producto_id INTEGER,
    producto_nombre TEXT NOT NULL,
    cantidad INTEGER NOT NULL,
    precio_unitario REAL NOT NULL,
    total REAL NOT NULL,
    fecha TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(producto_id) REFERENCES productos(id) ON DELETE SET NULL
  );
`);

(async () => {
  const admin = db.prepare('SELECT id FROM usuarios WHERE username = ?').get('admin');
  if (!admin) {
    const hash = await bcrypt.hash('123456', 10);
    db.prepare('INSERT INTO usuarios (username, password, role) VALUES (?,?,?)').run('admin', hash, 'admin');
    console.log('✅ Admin creado: admin / 123456');
  }

  const count = db.prepare('SELECT COUNT(*) as c FROM productos').get().c;
  if (count === 0) {
    const productosDefault = [
      ['MacBook Pro M3',2499.99,5,2,'laptop','https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=500&q=80'],
      ['Dell XPS 13',1299.99,8,3,'laptop','https://loremflickr.com/500/300/laptop,Dell'],
      ['Mouse Logitech MX',79.99,15,5,'mouse','https://images.unsplash.com/photo-1527814050087-3793815479db?w=500&q=80'],
      ['Teclado Mecánico RGB',149.99,12,4,'teclado','https://loremflickr.com/500/300/keyboard,mechanical'],
      ['Monitor LG 27" 4K',599.99,3,1,'monitor','https://images.unsplash.com/photo-1527864550417-7fd91fc51a46?w=500&q=80'],
      ['AirPods Pro',249.99,10,3,'auricular','https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=500&q=80']
    ];
    const ins = db.prepare('INSERT INTO productos (nombre, precio, stock, stock_minimo, categoria, imagen) VALUES (?,?,?,?,?,?)');
    for (const p of productosDefault) ins.run(...p);
    console.log(`✅ ${productosDefault.length} productos agregados`);
  }

  db.close();
  console.log('SQLite inicializada: dev.db');
})();
