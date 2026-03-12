# Sistema-Inventario-Web
Sistema de inventario web con Node.js, Express y PostgreSQL listo para desplegar en Render.
# Sistema de Inventario Web

## Descripción

Este proyecto es una aplicación web desarrollada con **Node.js**, **Express** y **PostgreSQL** que permite gestionar usuarios dentro de un sistema de inventario mediante una interfaz web.

La aplicación incluye funcionalidades de **registro e inicio de sesión de usuarios**, utilizando **encriptación de contraseñas** y conexión a una base de datos remota.

---

# Objetivo del proyecto

El objetivo de este sistema es demostrar la integración entre:

* Backend con Node.js
* Base de datos PostgreSQL
* Sistema de autenticación de usuarios
* Renderizado dinámico de páginas web

Este proyecto sirve como base para sistemas más complejos como:

* Sistemas de inventario
* Sistemas administrativos
* Aplicaciones web con autenticación

---

# Tecnologías utilizadas

* Node.js
* Express.js
* PostgreSQL
* EJS
* bcrypt
* express-session
* dotenv
* CSS

---

# Estructura del proyecto

```text
aplicativo web/
│
├── server.js
├── package.json
├── .env
│
├── public/
│   └── styles.css
│
└── views/
    ├── index.ejs
    ├── login.ejs
    └── registro.ejs
```

### Descripción de cada archivo

**server.js**

Archivo principal del servidor.
Aquí se configuran:

* El servidor Express
* La conexión con PostgreSQL
* Las rutas del sistema
* El manejo de sesiones

**package.json**

Contiene las dependencias del proyecto y los scripts de ejecución.

**.env**

Archivo donde se guardan las variables de entorno como la conexión a la base de datos.

**public/**

Carpeta donde se almacenan archivos estáticos como:

* CSS
* imágenes
* scripts del cliente

**views/**

Carpeta donde se encuentran las plantillas **EJS** utilizadas para renderizar las páginas web.

---

# Cómo funciona el sistema (paso a paso)

## 1. Inicio del servidor

Cuando se ejecuta el comando:

```bash
node server.js
```

Node.js inicia el servidor utilizando **Express**.

El servidor queda escuchando en el puerto:

```
http://localhost:3000
```

---

## 2. Conexión a la base de datos

El servidor utiliza la librería **pg** para conectarse a PostgreSQL mediante la variable de entorno:

```
DATABASE_URL
```

Esta variable contiene:

* usuario
* contraseña
* host
* puerto
* nombre de la base de datos

---

## 3. Renderizado de páginas

El sistema utiliza **EJS** como motor de plantillas.

Esto permite generar páginas HTML dinámicamente desde el servidor.

Ejemplo de páginas:

* Página principal
* Página de login
* Página de registro

---

## 4. Registro de usuarios

Cuando un usuario se registra:

1. Ingresa sus datos en el formulario.
2. El servidor recibe la información.
3. La contraseña se **encripta con bcrypt**.
4. Los datos se guardan en la base de datos.

Esto mejora la seguridad del sistema.

---

## 5. Inicio de sesión

Cuando un usuario intenta iniciar sesión:

1. El usuario introduce su correo y contraseña.
2. El servidor busca el usuario en la base de datos.
3. Se compara la contraseña ingresada con la almacenada utilizando **bcrypt**.
4. Si coinciden, se inicia una **sesión de usuario**.

---

## 6. Manejo de sesiones

El sistema utiliza **express-session** para mantener al usuario autenticado mientras navega por la aplicación.

Esto permite:

* mantener la sesión activa
* restringir accesos a ciertas páginas

---

# Instalación del proyecto

## 1. Clonar el repositorio

```
git clone <url-del-repositorio>
cd aplicativo-web
```

---

## 2. Instalar dependencias

```
npm install
```

---

## 3. Crear archivo .env

Crear un archivo llamado **.env** en la raíz del proyecto:

```
DATABASE_URL=postgres://usuario:password@host:5432/base_de_datos
```

Ejemplo con Render:

```
DATABASE_URL=postgres://inventario_pp2p_user:password@dpg-d6jntcfgi27c73c5gqkg-a.oregon-postgres.render.com:5432/inventario_pp2p
```

---

## 4. Ejecutar el servidor

```
node server.js
```

---

## 5. Acceder al sistema

Abrir el navegador y entrar a:

```
http://localhost:3000
```

---

# Seguridad del sistema

El sistema implementa varias medidas básicas de seguridad:

* Encriptación de contraseñas con bcrypt
* Uso de variables de entorno para proteger credenciales
* Conexión segura a la base de datos con SSL

---

# Posibles mejoras

El sistema puede ampliarse con funcionalidades como:

* CRUD completo de productos
* Gestión de inventario
* Panel administrativo
* Roles de usuario
* API REST
* Validación avanzada de formularios

---

# Autor

Proyecto desarrollado con fines educativos para demostrar el funcionamiento de aplicaciones web con Node.js, autenticación de usuarios y conexión a bases de datos PostgreSQL.
