# Distribuidora y Exportadora de Mariscos "El Puerto"

Sistema web full-stack para la gestión y consulta de lotes de mariscos del Puerto Pesquero Artesanal de Esmeraldas, Ecuador. Incluye una API REST desarrollada en Node.js con Express y MongoDB, junto con un cliente web estático en HTML, CSS, JavaScript y Bootstrap.

## Requisitos Previos
* **Node.js** (v18 o superior)
* **MongoDB** (instancia local o clúster en MongoDB Atlas)

## Instalación y Ejecución del Backend
1. Clonar el repositorio:
   ```bash
   git clone [https://github.com/maol1998/Examen_Parcial.git](https://github.com/maol1998/Examen_Parcial.git)
   cd Examen_Parcial

2. Instalar dependencias: `npm install`
3. Configurar entorno: Crea `.env` desde `.env.example` con `MONGO_URI` y `PORT=3000`
4. Ejecutar servidor: `node index.js` y abrir `http://localhost:3000`

## Rutas de la API (/api/mariscos)
| Metodo | Endpoint | Descripcion |
| :--- | :--- | :--- |
| GET | /api/mariscos | Lista todos los lotes |
| GET | /api/mariscos/:id | Consulta un lote por ID |
| POST | /api/mariscos | Crea un nuevo lote |
| PUT | /api/mariscos/:id | Actualiza un lote por ID |
| DELETE | /api/mariscos/:id | Elimina un lote por ID |
| GET/POST | /api/mariscos/seed | Carga datos iniciales |

## Estructura
* `controllers/` - Logica CRUD
* `db/` - Conexion MongoDB
* `middleware/` - Validaciones
* `models/` - Modelos Mongoose
* `public/` - Frontend web
* `routes/` - Rutas REST
* `server/` - Configuracion Express
