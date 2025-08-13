import "dotenv/config";
import express, { Application, Request, Response } from "express";
import userRoutes from "./routes/userRoutes";
import authRoutes from "./routes/authRoutes";
import productRoutes from "./routes/productRoutes";
import { setupSwagger } from "./config/swagger";
import logger from "./config/logger";
import { httpLogger, errorLogger } from "./middleware/logging";
import register, { httpRequestCounter } from "./config/metrics";

const app: Application = express();
const PORT = process.env.PORT || 3000;

// Middleware de logging (debe ir antes de otros middlewares)
app.use(httpLogger);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configurar Swagger
setupSwagger(app);

// Log de inicio de aplicación
logger.info("Iniciando servidor Express", {
  port: PORT,
  environment: process.env.NODE_ENV || "development",
  timestamp: new Date().toISOString(),
});

// Middleware para contar requests
app.use((req, res, next) => {
  res.on("finish", () => {
    httpRequestCounter
      .labels(req.method, req.path, res.statusCode.toString())
      .inc();
  });
  next();
});

// Endpoint /metrics para Prometheus
app.get("/metrics", async (req, res) => {
  try {
    res.set("Content-Type", register.contentType);
    res.end(await register.metrics());
  } catch (err) {
    res.status(500).end(err instanceof Error ? err.message : "Unknown error");
  }
});

// Rutas de la API
app.use("/api/users", userRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/products", productRoutes);

/**
 * @swagger
 * /health:
 *   get:
 *     tags: [Health Check]
 *     summary: Health Check del sistema
 *     description: Verifica el estado de salud de la aplicación y sus dependencias
 *     responses:
 *       200:
 *         description: Sistema saludable
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "healthy"
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                   example: "2025-08-03T10:30:00.000Z"
 *                 uptime:
 *                   type: number
 *                   example: 3600.5
 *                 version:
 *                   type: string
 *                   example: "1.0.0"
 *                 environment:
 *                   type: string
 *                   example: "production"
 *                 services:
 *                   type: object
 *                   properties:
 *                     database:
 *                       type: object
 *                       properties:
 *                         status:
 *                           type: string
 *                           example: "connected"
 *                         responseTime:
 *                           type: number
 *                           example: 15.5
 *                     redis:
 *                       type: object
 *                       properties:
 *                         status:
 *                           type: string
 *                           example: "connected"
 *                         responseTime:
 *                           type: number
 *                           example: 2.1
 *                 system:
 *                   type: object
 *                   properties:
 *                     memory:
 *                       type: object
 *                       properties:
 *                         used:
 *                           type: number
 *                           example: 134217728
 *                         total:
 *                           type: number
 *                           example: 2147483648
 *                         percentage:
 *                           type: number
 *                           example: 6.25
 *       503:
 *         description: Sistema no saludable
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "unhealthy"
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 errors:
 *                   type: array
 *                   items:
 *                     type: string
 */
// GET /health - Health Check endpoint
app.get("/health", async (req: Request, res: Response) => {
  const startTime = Date.now();
  const timestamp = new Date().toISOString();
  const uptime = process.uptime();

  let status = "healthy";
  const errors: string[] = [];
  const services: any = {};

  try {
    // Health check de base de datos (simulado - reemplazar con conexión real)
    const dbStartTime = Date.now();
    try {
      // TODO: Reemplazar con verificación real de base de datos
      // Ejemplo: await dbConnection.query('SELECT 1');
      await new Promise((resolve) => setTimeout(resolve, Math.random() * 20)); // Simula latencia
      services.database = {
        status: "connected",
        responseTime: Date.now() - dbStartTime,
      };
    } catch (error) {
      services.database = {
        status: "disconnected",
        error: "Database connection failed",
      };
      errors.push("Database is not accessible");
      status = "unhealthy";
    }

    // Health check de Redis (simulado - reemplazar con conexión real)
    const redisStartTime = Date.now();
    try {
      // TODO: Reemplazar con verificación real de Redis
      // Ejemplo: await redisClient.ping();
      await new Promise((resolve) => setTimeout(resolve, Math.random() * 5)); // Simula latencia
      services.redis = {
        status: "connected",
        responseTime: Date.now() - redisStartTime,
      };
    } catch (error) {
      services.redis = {
        status: "disconnected",
        error: "Redis connection failed",
      };
      // Redis no es crítico, no marcamos como unhealthy
    }

    // Información del sistema
    const memoryUsage = process.memoryUsage();
    const system = {
      memory: {
        used: memoryUsage.heapUsed,
        total: memoryUsage.heapTotal,
        percentage:
          Math.round(
            (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100 * 100
          ) / 100,
      },
      cpu: {
        uptime: uptime,
        load: process.cpuUsage(),
      },
    };

    const responseTime = Date.now() - startTime;

    const healthResponse = {
      status,
      timestamp,
      uptime,
      version: "1.0.0",
      environment: process.env.NODE_ENV || "development",
      services,
      system,
      responseTime,
      ...(errors.length > 0 && { errors }),
    };

    // Log del health check
    logger.info("Health check ejecutado", {
      status,
      responseTime,
      services: Object.keys(services).map((key) => ({
        name: key,
        status: services[key].status,
      })),
    });

    const statusCode = status === "healthy" ? 200 : 503;
    res.status(statusCode).json(healthResponse);
  } catch (error) {
    logger.error("Error en health check", {
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    });

    res.status(503).json({
      status: "unhealthy",
      timestamp,
      error: "Health check failed",
      responseTime: Date.now() - startTime,
    });
  }
});

/**
 * @swagger
 * /health/ready:
 *   get:
 *     tags: [Health Check]
 *     summary: Readiness check
 *     description: Verifica si la aplicación está lista para recibir tráfico (endpoint simple para load balancers)
 *     responses:
 *       200:
 *         description: Aplicación lista
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "ready"
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *       503:
 *         description: Aplicación no lista
 */
// GET /health/ready - Readiness probe (para Kubernetes/Docker)
app.get("/health/ready", (req: Request, res: Response) => {
  // Check básico - la aplicación está corriendo
  res.status(200).json({
    status: "ready",
    timestamp: new Date().toISOString(),
  });
});

/**
 * @swagger
 * /health/live:
 *   get:
 *     tags: [Health Check]
 *     summary: Liveness check
 *     description: Verifica si la aplicación está viva (endpoint para restart automático)
 *     responses:
 *       200:
 *         description: Aplicación viva
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "alive"
 *                 uptime:
 *                   type: number
 *                   example: 3600.5
 */
// GET /health/live - Liveness probe (para Kubernetes/Docker)
app.get("/health/live", (req: Request, res: Response) => {
  res.status(200).json({
    status: "alive",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

/**
 * @swagger
 * /:
 *   get:
 *     tags: [Información General]
 *     summary: Información de la API
 *     description: Retorna información general sobre la API y sus endpoints disponibles
 *     responses:
 *       200:
 *         description: Información de la API
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Bienvenido a la API de Express.js con TypeScript"
 *                 version:
 *                   type: string
 *                   example: "1.0.0"
 *                 authentication:
 *                   type: object
 *                 endpoints:
 *                   type: object
 */
// GET / - Ruta raíz
app.get("/", (req: Request, res: Response) => {
  res.json({
    message: "Bienvenido a la API de Express.js con TypeScript",
    version: "1.0.0",
    authentication: {
      required: "Los endpoints de usuarios requieren autenticación",
      process: [
        "1. POST /api/auth/login con email y password",
        "2. Usar el token recibido en el header Authorization: Bearer <token>",
        "3. Acceder a los endpoints protegidos de /api/users",
      ],
    },
    endpoints: {
      auth: {
        "POST /api/auth/login": "Iniciar sesión (público)",
        "POST /api/auth/logout": "Cerrar sesión (público)",
        "GET /api/auth/me":
          "Obtener información del usuario actual (requiere auth)",
      },
      users: {
        "GET /api/users": "Obtener todos los usuarios (🔒 requiere auth)",
        "GET /api/users/:id": "Obtener usuario por ID (🔒 requiere auth)",
        "POST /api/users": "Crear nuevo usuario (🔒 requiere auth)",
        "PUT /api/users/:id": "Actualizar usuario (🔒 requiere auth)",
        "DELETE /api/users/:id": "Eliminar usuario (🔒 requiere auth)",
      },
      products: {
        "GET /api/products":
          "Obtener todos los productos (🔒 requiere auth, soporta ?category=X&search=Y&active=true)",
        "GET /api/products/:id": "Obtener producto por ID (🔒 requiere auth)",
        "POST /api/products": "Crear nuevo producto (🔒 requiere auth)",
        "PUT /api/products/:id": "Actualizar producto (🔒 requiere auth)",
        "PATCH /api/products/:id/stock":
          "Actualizar stock del producto (🔒 requiere auth)",
        "DELETE /api/products/:id": "Eliminar producto (🔒 requiere auth)",
      },
    },
  });
});

// Middleware para manejar rutas no encontradas
app.use("*", (req: Request, res: Response) => {
  logger.warn("Endpoint no encontrado", {
    method: req.method,
    url: req.originalUrl,
    ip: req.ip || req.connection.remoteAddress,
  });

  res.status(404).json({
    success: false,
    message: "Endpoint no encontrado",
  });
});

// Middleware de logging de errores (debe ir antes del error handler)
app.use(errorLogger);

// Middleware global para manejo de errores
app.use((err: Error, req: Request, res: Response, next: any) => {
  logger.error("Error no manejado en la aplicación", {
    error: err.message,
    stack: err.stack,
    method: req.method,
    url: req.originalUrl,
    ip: req.ip || req.connection.remoteAddress,
  });

  res.status(500).json({
    success: false,
    message: "Error interno del servidor",
  });
});

// Iniciar servidor
app.listen(PORT, () => {
  logger.info("Servidor iniciado exitosamente", {
    port: PORT,
    apiDocs: `http://localhost:${PORT}/api-docs`,
    environment: process.env.NODE_ENV || "development",
  });

  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
  console.log(
    `📚 API Documentation disponible en http://localhost:${PORT}/api-docs`
  );
});

export default app;
