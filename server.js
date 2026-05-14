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

// Necesario para que express-rate-limit funcione detrás del proxy de Render
app.set("trust proxy", 1);

// =============================
// SEGURIDAD — CABECERAS HTTP
// =============================

app.use(helmet({
  contentSecurityPolicy: false
}));

// =============================
// BASE DE DATOS PostgreSQL
// =============================

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false
});

// =============================
// CONFIGURACIÓN EXPRESS
// =============================

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.urlencoded({ extended: true }));
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

// =============================
// FLASH MESSAGES
// =============================

app.use((req, res, next) => {
  res.locals.flash = req.session.flash || null;
  delete req.session.flash;
  next();
});

function setFlash(req, type, message) {
  req.session.flash = { type, message };
}

// =============================
// CREAR TABLAS E INICIALIZAR DATOS
// =============================

async function initDB() {
  const client = await pool.connect();
  try {
    // Crear tablas
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
    `);

    // Crear admin por defecto si no existe
    const adminCheck = await client.query("SELECT * FROM usuarios WHERE username = $1", ["admin"]);
    if (adminCheck.rows.length === 0) {
      const hashAdmin = await bcrypt.hash("123456", 10);
      await client.query(
        "INSERT INTO usuarios (username, password, role) VALUES ($1, $2, $3)",
        ["admin", hashAdmin, "admin"]
      );
      console.log("✅ Admin creado: admin / 123456");
    }

    // Agregar productos de prueba si la tabla está vacía
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

// =============================
// MIDDLEWARE DE AUTENTICACIÓN
// =============================

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

// =============================
// RATE LIMITING
// =============================

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    setFlash(req, "danger", "Demasiados intentos fallidos. Espera 15 minutos.");
    res.redirect("/login");
  }
});

const registroLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  handler: (req, res) => {
    setFlash(req, "danger", "Demasiados registros desde esta IP. Intenta más tarde.");
    res.redirect("/registro");
  }
});

// =============================
// VALIDADORES
// =============================

const validarProducto = [
  body("nombre").trim().notEmpty().withMessage("El nombre es obligatorio").isLength({ max: 100 }),
  body("precio").isFloat({ min: 0 }).withMessage("El precio debe ser un número positivo"),
  body("stock").isInt({ min: 0 }).withMessage("El stock debe ser un número entero positivo"),
  body("stock_minimo").isInt({ min: 0 }).withMessage("El stock mínimo debe ser un número entero positivo"),
  body("imagen").optional().isURL().withMessage("La imagen debe ser una URL válida")
];

const validarUsuario = [
  body("username").trim().notEmpty().isLength({ min: 3, max: 50 }).matches(/^[a-zA-Z0-9_]+$/),
  body("password").isLength({ min: 6 }).withMessage("Mínimo 6 caracteres")
];

// =============================
// RUTAS LOGIN
// =============================

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
  const mensajeError = "Usuario o contraseña incorrectos";

  try {
    const result = await pool.query("SELECT * FROM usuarios WHERE username = $1", [username]);
    const usuario = result.rows[0];

    if (!usuario) {
      await bcrypt.hash(password, 10); // anti timing-attack
      setFlash(req, "danger", mensajeError);
      return res.redirect("/login");
    }

    const coincide = await bcrypt.compare(password, usuario.password);
    if (!coincide) {
      setFlash(req, "danger", mensajeError);
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

// =============================
// REGISTRO
// =============================

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
    setFlash(req, "success", "Cuenta creada correctamente. ¡Inicia sesión!");
    res.redirect("/login");

  } catch (error) {
    if (error.code === "23505") { // unique_violation en PostgreSQL
      setFlash(req, "danger", "Ese nombre de usuario ya está en uso");
    } else {
      console.error("Error en registro:", error);
      setFlash(req, "danger", "Error al crear la cuenta. Intenta de nuevo.");
    }
    res.redirect("/registro");
  }
});

// =============================
// DASHBOARD
// =============================

app.get("/", verificarLogin, async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM productos ORDER BY id DESC");
    res.render("index", {
      productos: result.rows,
      usuario: req.session.usuario,
      esAdmin: req.session.rol === "admin"
    });
  } catch (error) {
    console.error("Error cargando productos:", error);
    res.render("index", { productos: [], usuario: req.session.usuario, esAdmin: false });
  }
});

// =============================
// CRUD PRODUCTOS
// =============================

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
    setFlash(req, "success", `Producto "${nombre}" agregado correctamente`);
  } catch (error) {
    console.error("Error agregando producto:", error);
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
    if (result.rows[0]) {
      setFlash(req, "success", `Producto "${result.rows[0].nombre}" eliminado`);
    }
  } catch (error) {
    console.error("Error eliminando producto:", error);
    setFlash(req, "danger", "Error al eliminar el producto");
  }
  res.redirect("/");
});

// =============================
// AJUSTE DE STOCK
// =============================

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
    console.error("Error actualizando stock:", error);
    setFlash(req, "danger", "Error al actualizar el stock");
  }
  res.redirect("/");
});

// =============================
// MANEJO DE ERRORES
// =============================

app.use((req, res) => res.status(404).send("Página no encontrada"));

app.use((err, req, res, next) => {
  console.error("Error no manejado:", err);
  res.status(500).send("Error interno del servidor");
});

// =============================
// INICIO
// =============================

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor ejecutándose en puerto ${PORT}`));
