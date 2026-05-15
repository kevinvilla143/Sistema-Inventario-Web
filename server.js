require("dotenv").config();
const express = require("express");
const { Pool } = require("pg");
const session = require("express-session");
const bcrypt = require("bcrypt");
const path = require("path");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const { body, validationResult } = require("express-validator");

const app = express();

app.set("trust proxy", 1);

app.use(helmet({ contentSecurityPolicy: false }));

// ── BASE DE DATOS ──
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false
});

// ── EXPRESS CONFIG ──
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static("public"));

app.use(session({
  secret: process.env.SESSION_SECRET || "fallback_solo_para_dev",
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: 1000 * 60 * 60 * 8
  }
}));

// ── FLASH ──
app.use((req, res, next) => {
  res.locals.flash = req.session.flash || null;
  delete req.session.flash;
  next();
});
function setFlash(req, type, message) {
  req.session.flash = { type, message };
}

// ── INIT DB ──
async function initDB() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS usuarios (
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT DEFAULT 'user'
      );

      CREATE TABLE IF NOT EXISTS productos (
        id SERIAL PRIMARY KEY,
        nombre TEXT NOT NULL,
        precio NUMERIC(10,2) NOT NULL,
        stock INTEGER NOT NULL,
        stock_minimo INTEGER NOT NULL,
        categoria TEXT DEFAULT 'otro',
        imagen TEXT
      );

      CREATE TABLE IF NOT EXISTS ventas (
        id SERIAL PRIMARY KEY,
        producto_id INTEGER REFERENCES productos(id) ON DELETE SET NULL,
        producto_nombre TEXT NOT NULL,
        cantidad INTEGER NOT NULL,
        precio_unitario NUMERIC(10,2) NOT NULL,
        total NUMERIC(10,2) NOT NULL,
        fecha TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    const adminCheck = await client.query("SELECT * FROM usuarios WHERE username = $1", ["admin"]);
    if (adminCheck.rows.length === 0) {
      const hashAdmin = await bcrypt.hash("123456", 10);
      await client.query(
        "INSERT INTO usuarios (username, password, role) VALUES ($1, $2, $3)",
        ["admin", hashAdmin, "admin"]
      );
      console.log("✅ Admin creado: admin / 123456");
    }

    const countResult = await client.query("SELECT COUNT(*) as count FROM productos");
    if (parseInt(countResult.rows[0].count) === 0) {
      const productosDefault = [
        { nombre: "MacBook Pro M3", categoria: "laptop", precio: 2499.99, stock: 5, stock_minimo: 2, imagen: "https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=500&q=80" },
        { nombre: "Dell XPS 13", categoria: "laptop", precio: 1299.99, stock: 8, stock_minimo: 3, imagen: "https://loremflickr.com/500/300/laptop,Dell" },
        { nombre: "Mouse Logitech MX", categoria: "mouse", precio: 79.99, stock: 15, stock_minimo: 5, imagen: "https://images.unsplash.com/photo-1527814050087-3793815479db?w=500&q=80" },
        { nombre: "Teclado Mecánico RGB", categoria: "teclado", precio: 149.99, stock: 12, stock_minimo: 4, imagen: "https://loremflickr.com/500/300/keyboard,mechanical" },
        { nombre: 'Monitor LG 27" 4K', categoria: "monitor", precio: 599.99, stock: 3, stock_minimo: 1, imagen: "https://images.unsplash.com/photo-1527864550417-7fd91fc51a46?w=500&q=80" },
        { nombre: "AirPods Pro", categoria: "auricular", precio: 249.99, stock: 10, stock_minimo: 3, imagen: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=500&q=80" }
      ];
      for (const p of productosDefault) {
        await client.query(
          "INSERT INTO productos (nombre, precio, stock, stock_minimo, categoria, imagen) VALUES ($1, $2, $3, $4, $5, $6)",
          [p.nombre, p.precio, p.stock, p.stock_minimo, p.categoria, p.imagen]
        );
      }
      console.log(`✅ ${productosDefault.length} productos agregados`);
    }
  } finally {
    client.release();
  }
}

initDB().catch(err => {
  console.error("❌ Error inicializando la base de datos:", err);
  process.exit(1);
});

// ── MIDDLEWARES ──
function verificarLogin(req, res, next) {
  if (!req.session.usuario) return res.redirect("/login");
  next();
}

function verificarAdmin(req, res, next) {
  if (!req.session.usuario || req.session.rol !== "admin") {
    setFlash(req, "danger", "No tienes permiso para realizar esta acción");
    return res.redirect("/");
  }
  next();
}

// ── RATE LIMITERS ──
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 10,
  handler: (req, res) => {
    setFlash(req, "danger", "Demasiados intentos. Espera 15 minutos.");
    res.redirect("/login");
  }
});

const registroLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, max: 5,
  handler: (req, res) => {
    setFlash(req, "danger", "Demasiados registros. Intenta más tarde.");
    res.redirect("/registro");
  }
});

// ── VALIDADORES ──
const validarProducto = [
  body("nombre").trim().notEmpty().isLength({ max: 100 }),
  body("precio").isFloat({ min: 0 }),
  body("stock").isInt({ min: 0 }),
  body("stock_minimo").isInt({ min: 0 }),
  body("imagen").optional().isURL()
];

const validarUsuario = [
  body("username").trim().notEmpty().isLength({ min: 3, max: 50 }).matches(/^[a-zA-Z0-9_]+$/),
  body("password").isLength({ min: 6 })
];

// ── LOGIN ──
app.get("/login", (req, res) => {
  if (req.session.usuario) return res.redirect("/");
  res.render("login");
});

app.post("/login", loginLimiter, validarUsuario, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    setFlash(req, "danger", "Credenciales inválidas");
    return res.redirect("/login");
  }
  const { username, password } = req.body;
  try {
    const result = await pool.query("SELECT * FROM usuarios WHERE username = $1", [username]);
    const usuario = result.rows[0];
    if (!usuario) {
      await bcrypt.hash(password, 10);
      setFlash(req, "danger", "Usuario o contraseña incorrectos");
      return res.redirect("/login");
    }
    const coincide = await bcrypt.compare(password, usuario.password);
    if (!coincide) {
      setFlash(req, "danger", "Usuario o contraseña incorrectos");
      return res.redirect("/login");
    }
    req.session.regenerate((err) => {
      if (err) return res.redirect("/login");
      req.session.usuario = usuario.username;
      req.session.rol = usuario.role;
      res.redirect("/");
    });
  } catch (error) {
    console.error("Error en login:", error);
    setFlash(req, "danger", "Error interno. Intenta de nuevo.");
    res.redirect("/login");
  }
});

app.get("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/login"));
});

// ── REGISTRO ──
app.get("/registro", (req, res) => {
  if (req.session.usuario) return res.redirect("/");
  res.render("registro");
});

app.post("/registro", registroLimiter, validarUsuario, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    setFlash(req, "danger", errors.array()[0].msg);
    return res.redirect("/registro");
  }
  const { username, password } = req.body;
  try {
    const hash = await bcrypt.hash(password, 10);
    await pool.query(
      "INSERT INTO usuarios (username, password, role) VALUES ($1, $2, $3)",
      [username, hash, "user"]
    );
    setFlash(req, "success", "Cuenta creada. ¡Inicia sesión!");
    res.redirect("/login");
  } catch (error) {
    if (error.code === "23505") {
      setFlash(req, "danger", "Ese nombre de usuario ya está en uso");
    } else {
      setFlash(req, "danger", "Error al crear la cuenta.");
    }
    res.redirect("/registro");
  }
});

// ── DASHBOARD ──
app.get("/", verificarLogin, async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM productos ORDER BY id DESC");
    res.render("index", {
      productos: result.rows,
      usuario: req.session.usuario,
      esAdmin: req.session.rol === "admin"
    });
  } catch (error) {
    res.render("index", { productos: [], usuario: req.session.usuario, esAdmin: false });
  }
});

// ── CRUD PRODUCTOS ──
app.post("/agregar", verificarLogin, verificarAdmin, validarProducto, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    setFlash(req, "danger", errors.array()[0].msg);
    return res.redirect("/");
  }
  const { nombre, precio, stock, stock_minimo, categoria, imagen } = req.body;
  try {
    await pool.query(
      "INSERT INTO productos (nombre, precio, stock, stock_minimo, categoria, imagen) VALUES ($1, $2, $3, $4, $5, $6)",
      [nombre, precio, stock, stock_minimo, categoria || "otro", imagen || null]
    );
    setFlash(req, "success", `Producto "${nombre}" agregado`);
  } catch (error) {
    setFlash(req, "danger", "Error al agregar el producto");
  }
  res.redirect("/");
});

app.get("/eliminar/:id", verificarLogin, verificarAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.redirect("/");
  try {
    const result = await pool.query("SELECT nombre FROM productos WHERE id = $1", [id]);
    await pool.query("DELETE FROM productos WHERE id = $1", [id]);
    if (result.rows[0]) setFlash(req, "success", `Producto "${result.rows[0].nombre}" eliminado`);
  } catch (error) {
    setFlash(req, "danger", "Error al eliminar el producto");
  }
  res.redirect("/");
});

app.get("/stock/:id/:accion", verificarLogin, verificarAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  const { accion } = req.params;
  if (isNaN(id) || !["sumar", "restar"].includes(accion)) return res.redirect("/");
  const cambio = accion === "sumar" ? 1 : -1;
  try {
    await pool.query(
      "UPDATE productos SET stock = GREATEST(0, stock + $1) WHERE id = $2",
      [cambio, id]
    );
  } catch (error) {
    setFlash(req, "danger", "Error al actualizar el stock");
  }
  res.redirect("/");
});

// ── VENTAS (API para el carrito) ──
app.post("/api/venta", verificarLogin, async (req, res) => {
  const { items } = req.body; // [{ id, nombre, precio, qty }]
  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.json({ ok: false, error: "Sin items" });
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const item of items) {
      const prod = await client.query("SELECT stock FROM productos WHERE id = $1 FOR UPDATE", [item.id]);
      if (!prod.rows[0]) continue;
      const nuevoStock = Math.max(0, prod.rows[0].stock - item.qty);
      await client.query("UPDATE productos SET stock = $1 WHERE id = $2", [nuevoStock, item.id]);
      await client.query(
        "INSERT INTO ventas (producto_id, producto_nombre, cantidad, precio_unitario, total) VALUES ($1,$2,$3,$4,$5)",
        [item.id, item.nombre, item.qty, item.precio, item.precio * item.qty]
      );
    }
    await client.query("COMMIT");
    res.json({ ok: true });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Error en venta:", err);
    res.json({ ok: false, error: "Error al procesar la venta" });
  } finally {
    client.release();
  }
});

// ── REPORTES (Solo Admin) ──
app.get("/reportes", verificarLogin, verificarAdmin, async (req, res) => {
  try {
    // Ventas de hoy
    const hoy = await pool.query(`
      SELECT producto_nombre, SUM(cantidad) as unidades, SUM(total) as ingresos
      FROM ventas
      WHERE fecha >= CURRENT_DATE AND fecha < CURRENT_DATE + INTERVAL '1 day'
      GROUP BY producto_nombre ORDER BY unidades DESC
    `);

    // Ventas de la semana
    const semana = await pool.query(`
      SELECT producto_nombre, SUM(cantidad) as unidades, SUM(total) as ingresos
      FROM ventas
      WHERE fecha >= CURRENT_DATE - INTERVAL '6 days'
      GROUP BY producto_nombre ORDER BY unidades DESC
    `);

    // Ventas del mes
    const mes = await pool.query(`
      SELECT producto_nombre, SUM(cantidad) as unidades, SUM(total) as ingresos
      FROM ventas
      WHERE fecha >= DATE_TRUNC('month', CURRENT_DATE)
      GROUP BY producto_nombre ORDER BY unidades DESC
    `);

    // Ingresos por día (últimos 7 días)
    const ingresosSemanales = await pool.query(`
      SELECT TO_CHAR(fecha, 'Dy') as dia, DATE(fecha) as fecha_raw, SUM(total) as total
      FROM ventas
      WHERE fecha >= CURRENT_DATE - INTERVAL '6 days'
      GROUP BY DATE(fecha), TO_CHAR(fecha, 'Dy')
      ORDER BY fecha_raw ASC
    `);

    // Totales
    const totHoy = hoy.rows.reduce((s, r) => s + parseFloat(r.ingresos), 0);
    const totSemana = semana.rows.reduce((s, r) => s + parseFloat(r.ingresos), 0);
    const totMes = mes.rows.reduce((s, r) => s + parseFloat(r.ingresos), 0);

    res.render("reportes", {
      usuario: req.session.usuario,
      esAdmin: true,
      hoy: hoy.rows,
      semana: semana.rows,
      mes: mes.rows,
      ingresosSemanales: ingresosSemanales.rows,
      totHoy,
      totSemana,
      totMes
    });
  } catch (error) {
    console.error("Error en reportes:", error);
    setFlash(req, "danger", "Error al cargar reportes");
    res.redirect("/");
  }
});

// ── PERFIL / CAMBIAR CREDENCIALES (Solo Admin) ──
app.get("/perfil", verificarLogin, verificarAdmin, (req, res) => {
  res.render("perfil", {
    usuario: req.session.usuario,
    esAdmin: true
  });
});

app.post("/perfil/cambiar", verificarLogin, verificarAdmin, async (req, res) => {
  const { password_actual, nuevo_username, nuevo_password, confirmar_password } = req.body;

  // Verificar contraseña actual
  try {
    const result = await pool.query("SELECT * FROM usuarios WHERE username = $1", [req.session.usuario]);
    const usuario = result.rows[0];
    if (!usuario) {
      setFlash(req, "danger", "Usuario no encontrado");
      return res.redirect("/perfil");
    }

    const coincide = await bcrypt.compare(password_actual, usuario.password);
    if (!coincide) {
      setFlash(req, "danger", "La contraseña actual es incorrecta");
      return res.redirect("/perfil");
    }

    // Validar nuevo username si se proporcionó
    let updates = [];
    let values = [];
    let idx = 1;

    if (nuevo_username && nuevo_username.trim() !== "" && nuevo_username !== req.session.usuario) {
      if (!/^[a-zA-Z0-9_]{3,50}$/.test(nuevo_username)) {
        setFlash(req, "danger", "El nombre de usuario debe tener 3-50 caracteres alfanuméricos");
        return res.redirect("/perfil");
      }
      updates.push(`username = $${idx++}`);
      values.push(nuevo_username.trim());
    }

    if (nuevo_password && nuevo_password.trim() !== "") {
      if (nuevo_password.length < 6) {
        setFlash(req, "danger", "La nueva contraseña debe tener mínimo 6 caracteres");
        return res.redirect("/perfil");
      }
      if (nuevo_password !== confirmar_password) {
        setFlash(req, "danger", "Las contraseñas nuevas no coinciden");
        return res.redirect("/perfil");
      }
      const nuevoHash = await bcrypt.hash(nuevo_password, 10);
      updates.push(`password = $${idx++}`);
      values.push(nuevoHash);
    }

    if (updates.length === 0) {
      setFlash(req, "danger", "No ingresaste ningún cambio");
      return res.redirect("/perfil");
    }

    values.push(usuario.id);
    await pool.query(
      `UPDATE usuarios SET ${updates.join(", ")} WHERE id = $${idx}`,
      values
    );

    // Actualizar sesión si cambió username
    if (nuevo_username && nuevo_username.trim() !== "" && nuevo_username !== req.session.usuario) {
      req.session.usuario = nuevo_username.trim();
    }

    setFlash(req, "success", "Credenciales actualizadas correctamente");
    res.redirect("/perfil");

  } catch (error) {
    if (error.code === "23505") {
      setFlash(req, "danger", "Ese nombre de usuario ya está en uso");
    } else {
      console.error("Error actualizando perfil:", error);
      setFlash(req, "danger", "Error al actualizar. Intenta de nuevo.");
    }
    res.redirect("/perfil");
  }
});

// ── ERRORES ──
app.use((req, res) => res.status(404).send("Página no encontrada"));
app.use((err, req, res, next) => {
  console.error("Error:", err);
  res.status(500).send("Error interno del servidor");
});

// ── INICIO ──
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor en puerto ${PORT}`));
