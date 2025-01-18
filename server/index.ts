import express, { type Request, Response, NextFunction } from "express";
import cors from 'cors';
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { fileURLToPath } from "url";
import path, { dirname } from "path";
import fs from "fs/promises";
import { sessionStore } from "./services/session-store";
import type { Server } from "http";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const TEMP_DIR = path.join(__dirname, "../temp");

// Cleanup function for temp directory
async function cleanupTempDirectory() {
  try {
    console.log("\n=== Starting temp directory cleanup ===");
    console.log(`Base temp directory: ${TEMP_DIR}`);

    const currentTime = Date.now();
    const MAX_AGE = 15 * 60 * 1000; // 15 minutes in milliseconds

    const sessions = await fs.readdir(TEMP_DIR);
    console.log(`Found ${sessions.length} total sessions`);

    for (const session of sessions) {
      const sessionPath = path.join(TEMP_DIR, session);
      try {
        const stats = await fs.stat(sessionPath);
        const age = currentTime - stats.mtime.getTime();
        const ageMinutes = age / (60 * 1000);

        console.log(`\nChecking session: ${session}`);
        console.log(`- Path: ${sessionPath}`);
        console.log(`- Age: ${ageMinutes.toFixed(2)} minutes`);

        if (age > MAX_AGE) {
          console.log(`- Status: Removing (exceeded ${MAX_AGE / (60 * 1000)} minutes)`);
          await fs.rm(sessionPath, { recursive: true, force: true });
          // Also remove from session store
          sessionStore.removeSession(session);
          console.log('- Memory store: Cleared');
        } else {
          console.log('- Status: Keeping');
        }
      } catch (error) {
        console.error(`Failed to process session ${session}:`, error);
      }
    }
    console.log("\n=== Cleanup completed ===");
  } catch (error) {
    console.error("Failed to cleanup temp directory:", error);
  }
}

let currentServer: Server | null = null;

async function startServer() {
  try {
    // Initialize temp directory
    console.log("\n=== Initializing storage ===");
    console.log(`Base temp directory: ${TEMP_DIR}`);

    await fs.mkdir(TEMP_DIR, { recursive: true });
    console.log("Temp directory initialized successfully");

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
      let capturedJsonResponse: Record<string, any> | undefined = undefined;

      const originalResJson = res.json;
      res.json = function (bodyJson, ...args) {
        capturedJsonResponse = bodyJson;
        return originalResJson.apply(res, [bodyJson, ...args]);
      };

      res.on("finish", () => {
        const duration = Date.now() - start;
        if (path.startsWith("/api")) {
          let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
          if (capturedJsonResponse) {
            logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
          }

          if (logLine.length > 80) {
            logLine = logLine.slice(0, 79) + "…";
          }

          log(logLine);
        }
      });

      next();
    });

    const server = registerRoutes(app);
    currentServer = server;

    // Error handling middleware
    app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
      console.error("[Server Error]", err);
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";
      res.status(status).json({ message });
    });

    if (app.get("env") === "development") {
      await setupVite(app, server);
    } else {
      serveStatic(app);
    }

    const PORT = 5000;
    const MAX_RETRIES = 5;
    let retryCount = 0;

    return new Promise<void>((resolve, reject) => {
      function attemptListen() {
        server.listen(PORT, "0.0.0.0", () => {
          log(`serving on port ${PORT}`);
          resolve();
        }).on('error', (error: NodeJS.ErrnoException) => {
          if (error.code === 'EADDRINUSE' && retryCount < MAX_RETRIES) {
            retryCount++;
            console.log(`Port ${PORT} is busy, retry attempt ${retryCount}/${MAX_RETRIES}...`);
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
    console.error("[Startup Error]", error);
    process.exit(1);
  }
}

// Handle process termination gracefully
process.on('SIGTERM', () => {
  if (currentServer) {
    currentServer.close(() => {
      console.log('Server terminated gracefully');
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
});

startServer().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});