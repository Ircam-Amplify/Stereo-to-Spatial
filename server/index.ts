import "dotenv/config";
import express, { type Request, Response, NextFunction } from "express";
import cors from 'cors';
import { registerRoutes } from "./routes";
import { setupVite, serveStatic } from "./vite";
import { fileURLToPath } from "url";
import path, { dirname } from "path";
import fs from "fs/promises";
import { sessionStore } from "./services/session-store";
import type { Server } from "http";
import { logger } from "./lib/logger";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const TEMP_DIR = path.join(__dirname, "../temp");

// Validate required environment variables
const requiredEnvVars = ['IRCAM_CLIENT_ID', 'IRCAM_CLIENT_SECRET'];
const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingEnvVars.length > 0) {
  logger.error('ENV', `Missing required environment variables: ${missingEnvVars.join(', ')}`);
  logger.info('ENV', 'Please check your .env file and ensure all required variables are set');
  process.exit(1);
}

// Log environment configuration
logger.info('ENV', `Node Environment: ${process.env.NODE_ENV || 'development'}`);
logger.info('ENV', 'IRCAM API credentials: ✓');
logger.debug('ENV', `Temp Directory: ${TEMP_DIR}`);

// Cleanup function for temp directory
async function cleanupTempDirectory() {
  try {
    logger.info('Cleanup', 'Starting temp directory cleanup');
    logger.debug('Cleanup', `Base temp directory: ${TEMP_DIR}`);

    const currentTime = Date.now();
    const MAX_AGE = 15 * 60 * 1000; // 15 minutes in milliseconds

    const sessions = await fs.readdir(TEMP_DIR);
    logger.info('Cleanup', `Found ${sessions.length} total sessions`);

    for (const session of sessions) {
      const sessionPath = path.join(TEMP_DIR, session);
      try {
        const stats = await fs.stat(sessionPath);
        const age = currentTime - stats.mtime.getTime();
        const ageMinutes = age / (60 * 1000);

        logger.debug('Cleanup', `Session ${session}: ${ageMinutes.toFixed(2)} minutes old`);

        if (age > MAX_AGE) {
          await fs.rm(sessionPath, { recursive: true, force: true });
          sessionStore.removeSession(session);
          logger.info('Cleanup', `Removed expired session: ${session}`);
        }
      } catch (error) {
        logger.error('Cleanup', `Failed to process session ${session}: ${error}`);
      }
    }
  } catch (error) {
    logger.error('Cleanup', error);
  }
}

let currentServer: Server | null = null;

async function startServer() {
  try {
    // Initialize temp directory
    logger.info('Storage', 'Initializing storage system');
    await fs.mkdir(TEMP_DIR, { recursive: true });
    logger.info('Storage', 'Temp directory initialized successfully');

    // Run cleanup on startup and schedule cleanup every 15 minutes
    await cleanupTempDirectory();
    setInterval(cleanupTempDirectory, 15 * 60 * 1000);

    const app = express();

    // Initialize middleware
    app.use(cors({
      origin: true,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization']
    }));

    app.use(express.json());
    app.use(express.urlencoded({ extended: false }));

    // Request logging middleware
    app.use((req, res, next) => {
      const start = Date.now();
      const path = req.path;

      // Capture the original res.json to log response data
      const originalJson = res.json;
      res.json = function (body) {
        const duration = Date.now() - start;
        logger.request(req, res, duration);

        if (process.env.NODE_ENV === 'development') {
          const sanitizedBody = { ...body };
          if (sanitizedBody.password) sanitizedBody.password = '[REDACTED]';
          logger.debug('Response', JSON.stringify(sanitizedBody));
        }

        return originalJson.call(this, body);
      };

      next();
    });

    const server = registerRoutes(app);
    currentServer = server;

    // Error handling middleware
    app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
      logger.error('Server', err);
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";
      res.status(status).json({ message });
    });

    if (app.get("env") === "development") {
      await setupVite(app, server);
    } else {
      serveStatic(app);
    }

    const PORT = process.env.PORT || 5000;
    const MAX_RETRIES = 5;
    let retryCount = 0;

    return new Promise<void>((resolve, reject) => {
      function attemptListen() {
        server.listen(PORT, "0.0.0.0", () => {
          logger.info('Server', `Server running on port ${PORT}`);
          logger.info('Server', `Environment: ${process.env.NODE_ENV || 'development'}`);
          resolve();
        }).on('error', (error: NodeJS.ErrnoException) => {
          if (error.code === 'EADDRINUSE' && retryCount < MAX_RETRIES) {
            retryCount++;
            logger.warn('Server', `Port ${PORT} is busy, retry attempt ${retryCount}/${MAX_RETRIES}...`);
            server.close();
            setTimeout(attemptListen, 1000);
          } else if (retryCount >= MAX_RETRIES) {
            reject(new Error(`Failed to start server after ${MAX_RETRIES} attempts`));
          } else {
            reject(error);
          }
        });
      }

      attemptListen();
    });
  } catch (error) {
    logger.error('Startup', error);
    process.exit(1);
  }
}

// Handle process termination gracefully
process.on('SIGTERM', () => {
  if (currentServer) {
    currentServer.close(() => {
      logger.info('Server', 'Server terminated gracefully');
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
});

startServer().catch((error) => {
  logger.error('Startup', error);
  process.exit(1);
});