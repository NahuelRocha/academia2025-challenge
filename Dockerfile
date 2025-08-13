# Multi-stage build para optimización
# Etapa 1: Build Stage
FROM node:18-alpine AS builder

# Configurar directorio de trabajo
WORKDIR /app

# Copiar archivos de configuración de dependencias
COPY package*.json ./
COPY tsconfig.json ./

# Instalar dependencias (incluyendo devDependencies para el build)
RUN npm ci --only=production=false

# Copiar código fuente
COPY src/ ./src/

# Compilar TypeScript a JavaScript
RUN npm run build

# Etapa 2: Production Stage  
FROM node:18-alpine AS production

# Instalar dumb-init para manejo de señales del SO
RUN apk add --no-cache dumb-init

# Crear usuario no-root para seguridad
RUN addgroup -g 1001 -S nodejs && \
    adduser -S api -u 1001

# Configurar directorio de trabajo
WORKDIR /app

# Cambiar ownership del directorio a usuario nodejs
RUN chown -R api:nodejs /app

# Cambiar a usuario no-root
USER api

# Copiar package.json y package-lock.json
COPY --chown=api:nodejs package*.json ./

# Instalar solo dependencias de producción
RUN npm ci --only=production && \
    npm cache clean --force

# Copiar código compilado desde build stage
COPY --chown=api:nodejs --from=builder /app/dist ./dist

# Crear directorio para logs
RUN mkdir -p logs

# Exponer puerto de la aplicación
EXPOSE 3000

# Configurar variables de entorno por defecto
ENV NODE_ENV=production
ENV PORT=3000

# Health check para Docker Swarm usando el endpoint existente
HEALTHCHECK --interval=30s --timeout=10s --start-period=90s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health/live || exit 1

# Usar dumb-init para manejar señales correctamente
ENTRYPOINT ["dumb-init", "--"]

# Comando para iniciar la aplicación
CMD ["node", "dist/app.js"]