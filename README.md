# Sistema de Inventario Web

Aplicación web de inventario construida con **Node.js**, **Express**, **PostgreSQL** y **EJS**.

## Funcionalidades

- Inicio de sesión y registro de usuarios.
- Roles de usuario y administrador.
- Gestión de productos: agregar, eliminar y ajustar stock.
- Búsqueda, filtros y ordenamiento de productos.
- Vista de inventario en cuadrícula y tabla.
- Carrito de ventas y registro de ventas.
- Reportes de ventas para administrador.
- Edición de perfil de administrador.
- Diseño responsive para escritorio, tablet y móvil.

## Tecnologías

- Node.js + Express
- PostgreSQL (`pg`)
- EJS (motor de plantillas)
- bcrypt
- express-session
- helmet
- express-rate-limit
- express-validator

## Requisitos

- Node.js >= 18
- npm
- PostgreSQL accesible desde `DATABASE_URL`

## Variables de entorno

Crear un archivo `.env` en la raíz:

```env
DATABASE_URL=postgres://usuario:password@host:5432/base_de_datos
SESSION_SECRET=cualquier_texto_secreto
NODE_ENV=production
```

## Ejecutar localmente

```bash
npm install
npm start
```

La aplicación intenta crear las tablas automáticamente al arrancar si la base de datos está disponible.

## Despliegue en Render

1. Crear una base de datos PostgreSQL en Render.
2. Crear un Web Service conectado a este repositorio.
3. Agregar las variables de entorno `DATABASE_URL`, `SESSION_SECRET` y `NODE_ENV`.
4. Build Command: `npm install`
5. Start Command: `npm start`

## Credenciales por defecto

- **Usuario:** admin
- **Contraseña:** 123456

## Git

Se agregó `.gitignore` para evitar subir `node_modules/`, `.env`, `dev.db` y archivos temporales.

## Notas

- Si el servidor no inicia, revisa que `DATABASE_URL` esté bien configurada.
- El archivo `public/styles.css` y las vistas fueron adaptados para mejorar la experiencia responsive.

