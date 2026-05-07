# Sistema de Inventario Web

Aplicación web de inventario desarrollada con **Node.js**, **Express**, **PostgreSQL** y **EJS**.

## Tecnologías

- Node.js + Express.js
- PostgreSQL (pg)
- EJS (motor de plantillas)
- bcrypt, express-session, helmet, express-rate-limit

## Variables de entorno

Crear un archivo `.env` en la raíz:

```
DATABASE_URL=postgres://usuario:password@host:5432/base_de_datos
SESSION_SECRET=cualquier_texto_secreto
NODE_ENV=production
```

## Ejecutar localmente

```bash
npm install
node server.js
```

## Desplegar en Render

1. Crear una base de datos PostgreSQL en Render
2. Crear un Web Service conectado a este repositorio
3. Agregar las variables de entorno (`DATABASE_URL`, `SESSION_SECRET`, `NODE_ENV`)
4. Build Command: `npm install`
5. Start Command: `node server.js`

## Credenciales por defecto

- **Usuario:** admin
- **Contraseña:** 123456
