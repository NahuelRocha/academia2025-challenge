import client from "prom-client";

// Crear un registro global de métricas
const register = new client.Registry();

// Agregar métricas del proceso Node.js (CPU, memoria, event loop)
client.collectDefaultMetrics({ register });

// Métrica personalizada de ejemplo: contador de requests HTTP
export const httpRequestCounter = new client.Counter({
  name: "http_requests_total",
  help: "Cantidad total de requests HTTP",
  labelNames: ["method", "route", "statusCode"],
});

// Registrar la métrica personalizada
register.registerMetric(httpRequestCounter);

// Exportar el registry
export default register;
