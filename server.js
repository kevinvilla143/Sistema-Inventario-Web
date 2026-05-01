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

// =============================
// SEGURIDAD — CABECERAS HTTP
// =============================

app.use(helmet({
  contentSecurityPolicy: false // desactivado para que Bootstrap CDN y el canvas funcionen
}));

// Render usa un proxy inverso — necesario para que rate limiting funcione correctamente
app.set("trust proxy", 1);

// =============================
// BASE DE DATOS
// =============================

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
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
    httpOnly: true,           // JS del cliente no puede leer la cookie
    secure: process.env.NODE_ENV === "production", // HTTPS en Render
    maxAge: 1000 * 60 * 60 * 8 // sesión expira en 8 horas
  }
}));

// =============================
// FLASH MESSAGES (sin librería extra)
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
// CREAR TABLAS
// =============================

pool.query(`
  CREATE TABLE IF NOT EXISTS usuarios (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password VARCHAR(200) NOT NULL
  );
`).catch(err => console.error("Error creando tabla usuarios:", err));

pool.query(`
  CREATE TABLE IF NOT EXISTS productos (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    precio DECIMAL NOT NULL,
    stock INT NOT NULL,
    stock_minimo INT NOT NULL,
    categoria VARCHAR(50) DEFAULT 'otro'
  );
`).catch(err => console.error("Error creando tabla productos:", err));

// =============================
// MIDDLEWARE DE AUTENTICACIÓN
// =============================

function verificarLogin(req, res, next) {
  if (!req.session.usuario) {
    return res.redirect("/login");
  }
  next();
}

// =============================
// RATE LIMITING
// =============================

// Solo para login — 10 intentos cada 15 minutos por IP
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    setFlash(req, "danger", "Demasiados intentos fallidos. Espera 15 minutos e intenta de nuevo.");
    res.redirect("/login");
  }
});

// Para registro — 5 cuentas por hora por IP
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
  body("nombre")
    .trim()
    .notEmpty().withMessage("El nombre es obligatorio")
    .isLength({ max: 100 }).withMessage("Máximo 100 caracteres"),
  body("precio")
    .isFloat({ min: 0 }).withMessage("El precio debe ser un número positivo"),
  body("stock")
    .isInt({ min: 0 }).withMessage("El stock debe ser un número entero positivo"),
  body("stock_minimo")
    .isInt({ min: 0 }).withMessage("El stock mínimo debe ser un número entero positivo")
];

const validarUsuario = [
  body("username")
    .trim()
    .notEmpty().withMessage("El usuario es obligatorio")
    .isLength({ min: 3, max: 50 }).withMessage("Entre 3 y 50 caracteres")
    .matches(/^[a-zA-Z0-9_]+$/).withMessage("Solo letras, números y guión bajo"),
  body("password")
    .isLength({ min: 6 }).withMessage("Mínimo 6 caracteres")
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

  try {
    const result = await pool.query(
      "SELECT * FROM usuarios WHERE username=$1",
      [username]
    );

    // Mensaje GENÉRICO — no revela si el usuario existe o no
    const mensajeError = "Usuario o contraseña incorrectos";

    if (result.rows.length === 0) {
      // Simulamos el tiempo de bcrypt para evitar timing attacks
      await bcrypt.hash(password, 10);
      setFlash(req, "danger", mensajeError);
      return res.redirect("/login");
    }

    const usuario = result.rows[0];
    const coincide = await bcrypt.compare(password, usuario.password);

    if (!coincide) {
      setFlash(req, "danger", mensajeError);
      return res.redirect("/login");
    }

    req.session.regenerate((err) => {
      if (err) return res.redirect("/login");
      req.session.usuario = usuario.username;
      res.redirect("/");
    });

  } catch (error) {
    console.error("Error en login:", error);
    setFlash(req, "danger", "Error interno. Intenta de nuevo.");
    res.redirect("/login");
  }
});

app.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/login");
  });
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
      "INSERT INTO usuarios (username, password) VALUES ($1,$2)",
      [username, hash]
    );
    setFlash(req, "success", "Cuenta creada correctamente. ¡Inicia sesión!");
    res.redirect("/login");

  } catch (error) {
    if (error.code === "23505") {
      setFlash(req, "danger", "Ese nombre de usuario ya está en uso");
    } else {
      console.error("Error en registro:", error);
      setFlash(req, "danger", "Error al crear la cuenta. Intenta de nuevo.");
    }
    res.redirect("/registro");
  }
});

// =============================
// DASHBOARD (PROTEGIDO)
// =============================

app.get("/", verificarLogin, async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM productos ORDER BY id DESC");
    res.render("index", {
      productos: result.rows,
      usuario: req.session.usuario
    });
  } catch (error) {
    console.error("Error cargando productos:", error);
    res.render("index", { productos: [], usuario: req.session.usuario });
  }
});

// =============================
// CRUD PRODUCTOS
// =============================

app.post("/agregar", verificarLogin, validarProducto, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    setFlash(req, "danger", errors.array()[0].msg);
    return res.redirect("/");
  }

  const { nombre, precio, stock, stock_minimo, categoria } = req.body;
  try {
    await pool.query(
      "INSERT INTO productos (nombre, precio, stock, stock_minimo, categoria) VALUES ($1,$2,$3,$4,$5)",
      [nombre, precio, stock, stock_minimo, categoria || 'otro']
    );
    setFlash(req, "success", `Producto "${nombre}" agregado correctamente`);
  } catch (error) {
    console.error("Error agregando producto:", error);
    setFlash(req, "danger", "Error al agregar el producto");
  }
  res.redirect("/");
});

app.get("/eliminar/:id", verificarLogin, async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.redirect("/");

  try {
    const result = await pool.query(
      "DELETE FROM productos WHERE id=$1 RETURNING nombre",
      [id]
    );
    if (result.rows.length > 0) {
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

app.get("/stock/:id/:accion", verificarLogin, async (req, res) => {
  const id = parseInt(req.params.id);
  const { accion } = req.params;

  if (isNaN(id) || !["sumar", "restar"].includes(accion)) {
    return res.redirect("/");
  }

  const cambio = accion === "sumar" ? 1 : -1;

  try {
    // Evita stock negativo
    await pool.query(
      "UPDATE productos SET stock = GREATEST(0, stock + $1) WHERE id=$2",
      [cambio, id]
    );
  } catch (error) {
    console.error("Error actualizando stock:", error);
    setFlash(req, "danger", "Error al actualizar el stock");
  }

  res.redirect("/");
});

// =============================
// MANEJO DE ERRORES GLOBAL
// =============================

app.use((req, res) => {
  res.status(404).send("Página no encontrada");
});

app.use((err, req, res, next) => {
  console.error("Error no manejado:", err);
  res.status(500).send("Error interno del servidor");
});

// =============================
// INICIO
// =============================

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor ejecutándose en puerto ${PORT}`));