require("dotenv").config();
const express = require("express");
const { Pool } = require("pg");
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

// Crear tabla automáticamente
pool.query(`
CREATE TABLE IF NOT EXISTS productos (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL,
  precio DECIMAL NOT NULL,
  stock INT NOT NULL,
  stock_minimo INT NOT NULL
);
`);

// Página principal
app.get("/", async (req, res) => {
  const result = await pool.query("SELECT * FROM productos ORDER BY id DESC");
  res.render("index", { productos: result.rows });
});

// Agregar producto
app.post("/agregar", async (req, res) => {
  const { nombre, precio, stock, stock_minimo } = req.body;
  await pool.query(
    "INSERT INTO productos (nombre, precio, stock, stock_minimo) VALUES ($1,$2,$3,$4)",
    [nombre, precio, stock, stock_minimo]
  );
  res.redirect("/");
});

// Eliminar producto
app.get("/eliminar/:id", async (req, res) => {
  await pool.query("DELETE FROM productos WHERE id=$1", [req.params.id]);
  res.redirect("/");
});

// Modificar stock
app.get("/stock/:id/:accion", async (req, res) => {
  const { id, accion } = req.params;
  const cambio = accion === "sumar" ? 1 : -1;

  await pool.query(
    "UPDATE productos SET stock = stock + $1 WHERE id=$2",
    [cambio, id]
  );

  res.redirect("/");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Servidor ejecutándose en puerto " + PORT));
