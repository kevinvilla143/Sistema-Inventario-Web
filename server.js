require("dotenv").config();
const express = require("express");
const { Pool } = require("pg");
const session = require("express-session");
const bcrypt = require("bcrypt");
const path = require("path");

const app = express();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

app.use(session({
  secret: "inventario_secret",
  resave: false,
  saveUninitialized: false
}));

// =============================
// CREAR TABLAS
// =============================

pool.query(`
CREATE TABLE IF NOT EXISTS usuarios (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  password VARCHAR(200) NOT NULL
);
`);

pool.query(`
CREATE TABLE IF NOT EXISTS productos (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL,
  precio DECIMAL NOT NULL,
  stock INT NOT NULL,
  stock_minimo INT NOT NULL
);
`);

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
// RUTAS LOGIN
// =============================

app.get("/login", (req, res) => {
  res.render("login");
});

app.post("/login", async (req, res) => {
  const { username, password } = req.body;

  const result = await pool.query("SELECT * FROM usuarios WHERE username=$1", [username]);

  if (result.rows.length === 0) {
    return res.send("Usuario no encontrado");
  }

  const usuario = result.rows[0];
  const coincide = await bcrypt.compare(password, usuario.password);

  if (!coincide) {
    return res.send("Contraseña incorrecta");
  }

  req.session.usuario = usuario.username;
  res.redirect("/");
});

app.get("/logout", (req, res) => {
  req.session.destroy();
  res.redirect("/login");
});

// =============================
// DASHBOARD (PROTEGIDO)
// =============================

app.get("/", verificarLogin, async (req, res) => {
  const result = await pool.query("SELECT * FROM productos ORDER BY id DESC");
  res.render("index", { productos: result.rows, usuario: req.session.usuario });
});

// =============================
// CRUD PRODUCTOS
// =============================

app.post("/agregar", verificarLogin, async (req, res) => {
  const { nombre, precio, stock, stock_minimo } = req.body;
  await pool.query(
    "INSERT INTO productos (nombre, precio, stock, stock_minimo) VALUES ($1,$2,$3,$4)",
    [nombre, precio, stock, stock_minimo]
  );
  res.redirect("/");
});

app.get("/eliminar/:id", verificarLogin, async (req, res) => {
  await pool.query("DELETE FROM productos WHERE id=$1", [req.params.id]);
  res.redirect("/");
});

// =============================
// ALERTA STOCK
// =============================

app.get("/stock/:id/:accion", verificarLogin, async (req, res) => {
  const { id, accion } = req.params;
  const cambio = accion === "sumar" ? 1 : -1;

  await pool.query(
    "UPDATE productos SET stock = stock + $1 WHERE id=$2",
    [cambio, id]
  );

  res.redirect("/");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Servidor ejecutándose"));
