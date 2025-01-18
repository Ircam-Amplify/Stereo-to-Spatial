import type { Express } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import path from "path";
import fs from "fs/promises";
import { fileURLToPath } from "url";
import express from "express";
import crypto from "crypto";
import archiver from "archiver";
import { createReadStream, createWriteStream } from "fs";
import { sessionStore } from "./services/session-store";
import {
  refreshIrcamToken,
  getIrcamToken,
  uploadToIrcamStorage,
  spatializeAudio
} from "./services/ircam";
import { validateAudioFile } from "./middleware/upload";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMP_DIR = path.join(__dirname, "../temp");
const MAX_SESSION_AGE = 15 * 60 * 1000; // 15 minutes

const log = (message: string, type: 'info' | 'error' = 'info') => {
  const timestamp = new Date().toISOString();
  console[type === 'error' ? 'error' : 'log'](`[${timestamp}] ${message}`);
};

interface FileRequest extends Request {
  file?: Express.Multer.File;
}

// Initialize storage directory
try {
  await fs.mkdir(TEMP_DIR, { recursive: true });
  log(`Temp directory initialized at: ${TEMP_DIR}`);
} catch (error) {
  log(`Failed to create temp directory: ${error}`, 'error');
  throw error;
}

const storage = multer.diskStorage({
  destination: async (_req, _file, cb) => {
    const sessionId = crypto.randomUUID();
    const uploadDir = path.join(TEMP_DIR, sessionId);

    try {
      await fs.mkdir(uploadDir, { recursive: true });
      log(`New session created: ${sessionId}`);
      cb(null, uploadDir);
    } catch (error) {
      log(`Failed to create upload directory: ${error}`, 'error');
      cb(error as Error, uploadDir);
    }
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const baseName = path.basename(file.originalname, ext)
      .replace(/[^a-zA-Z0-9]/g, '-')
      .toLowerCase();
    const filename = `original_${baseName}${ext}`;
    log(`Processing file: ${filename}`);
    cb(null, filename);
  }
});

// Improved file type validation
const allowedTypes = ['audio/flac', 'audio/wav', 'audio/wave', 'audio/x-wav', 'audio/mpeg'];
const fileFilter = (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  if (allowedTypes.includes(file.mimetype)) {
    log(`Accepted file type: ${file.mimetype}`);
    cb(null, true);
  } else {
    log(`Rejected file type: ${file.mimetype}`, 'error');
    cb(new Error('Invalid file type. Only FLAC, WAV and MP3 files are supported.'));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB
});

// Utility function to clean up old files
async function cleanupOldFiles() {
  try {
    const sessions = await fs.readdir(TEMP_DIR);
    const now = Date.now();

    for (const session of sessions) {
      const sessionPath = path.join(TEMP_DIR, session);
      const stats = await fs.stat(sessionPath);

      if (now - stats.mtime.getTime() > MAX_SESSION_AGE) {
        await fs.rm(sessionPath, { recursive: true, force: true });
        sessionStore.removeSession(session);
        log(`Cleaned up session: ${session}`);
      }
    }
  } catch (error) {
    log(`Cleanup error: ${error}`, 'error');
  }
}

// Run cleanup every 5 minutes
setInterval(cleanupOldFiles, 5 * 60 * 1000);

export function registerRoutes(app: Express): Server {
  const httpServer = createServer(app);

  // CORS middleware for /temp directory
  app.use("/temp", (req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization, Range, Accept");
    res.header("Access-Control-Expose-Headers", "Content-Range, Accept-Ranges, Content-Length");

    if (req.method === "OPTIONS") {
      return res.sendStatus(200);
    }
    next();
  }, express.static(TEMP_DIR, {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.wav') || filePath.endsWith('.flac')) {
        res.set({
          'Accept-Ranges': 'bytes',
          'Content-Type': 'audio/wav',
          'Cache-Control': 'no-cache',
          'X-Content-Type-Options': 'nosniff'
        });
      } else if (filePath.endsWith('.mp3')) {
        res.set({
          'Accept-Ranges': 'bytes',
          'Content-Type': 'audio/mpeg',
          'Cache-Control': 'no-cache',
          'X-Content-Type-Options': 'nosniff'
        });
      }
    }
  }));

  // API Routes
  app.get("/api/check-token", async (_req, res) => {
    try {
      log("Checking API token status");
      const token = getIrcamToken();
      if (!token) {
        log("No valid token found, refreshing");
        await refreshIrcamToken();
      }
      res.json({ status: "ok" });
    } catch (error) {
      log(`Token verification failed: ${error}`, 'error');
      res.status(500).json({ message: "Failed to verify IRCAM token" });
    }
  });

  // Upload endpoint
  app.post("/api/upload",
    upload.single("audio"),
    validateAudioFile,
    async (req: FileRequest, res) => {
      if (!req.file) {
        log("No file provided in request", 'error');
        return res.status(400).json({ message: "No file uploaded" });
      }

      try {
        const { fileId, iasUrl } = await uploadToIrcamStorage(req.file.path);
        const sessionId = path.basename(req.file.destination);

        sessionStore.saveSession(sessionId, { fileId, iasUrl });
        log(`Upload processed successfully: ${fileId}`);

        res.json({
          message: "File uploaded successfully",
          sessionId,
          path: `/temp/${sessionId}/${req.file.filename}`,
          ircam: { fileId, iasUrl }
        });
      } catch (error) {
        log(`Upload processing failed: ${error}`, 'error');
        res.status(500).json({ message: "Upload failed" });
      }
    }
  );

  // Get current file state
  app.get("/api/current-file", async (_req, res) => {
    try {
      const sessions = await fs.readdir(TEMP_DIR);
      log(`Found ${sessions.length} active sessions`);

      if (sessions.length > 0) {
        const sessionStats = await Promise.all(
          sessions.map(async (session) => {
            const stats = await fs.stat(path.join(TEMP_DIR, session));
            return { session, timestamp: stats.mtime.getTime() };
          })
        );

        const sortedSessions = sessionStats
          .sort((a, b) => b.timestamp - a.timestamp)
          .map(s => s.session);

        const latestSession = sortedSessions[0];
        const sessionDir = path.join(TEMP_DIR, latestSession);
        const files = await fs.readdir(sessionDir);
        const originalFile = files.find(f => f.startsWith('original_'));

        if (!originalFile) {
          log("No original file found in session");
          return res.json({ audioUrl: null });
        }

        const ircamData = sessionStore.getSession(latestSession);
        const audioUrl = `/temp/${latestSession}/${originalFile}`;
        log(`Serving audio URL: ${audioUrl}`);

        res.json({ audioUrl, ircam: ircamData });
      } else {
        res.json({ audioUrl: null });
      }
    } catch (error) {
      log(`Failed to get current file: ${error}`, 'error');
      res.status(500).json({ message: "Failed to get current file" });
    }
  });

  // Download processed files as ZIP
  app.get("/api/download-zip/:sessionId", async (req, res) => {
    try {
      const { sessionId } = req.params;
      log(`Preparing ZIP download for session: ${sessionId}`);

      const sessionData = sessionStore.getSession(sessionId);
      if (!sessionData?.zipPath) {
        return res.status(404).json({ message: "ZIP file not found" });
      }

      const zipFilePath = sessionData.zipPath;
      try {
        await fs.access(zipFilePath);
      } catch (error) {
        log(`ZIP file not found: ${zipFilePath}`, 'error');
        return res.status(404).json({ message: "ZIP file not found" });
      }

      const zipFileName = path.basename(zipFilePath);
      res.download(zipFilePath, zipFileName, (err) => {
        if (err) {
          log(`Failed to send ZIP: ${err}`, 'error');
        }
      });
    } catch (error) {
      log(`Download failed: ${error}`, 'error');
      if (!res.headersSent) {
        res.status(500).json({ message: "Failed to download ZIP file" });
      }
    }
  });

  // Download individual file
  app.get("/api/download-file/:sessionId/:type", async (req, res) => {
    try {
      const { sessionId, type } = req.params;
      if (type !== 'binaural' && type !== 'immersive') {
        return res.status(400).json({ message: "Invalid file type requested" });
      }

      log(`Preparing ${type} file download for session: ${sessionId}`);
      const sessionDir = path.join(TEMP_DIR, sessionId);

      try {
        const files = await fs.readdir(sessionDir);
        const targetFile = files.find(f => f.startsWith(type + '_'));

        if (!targetFile) {
          log(`${type} file not found in session ${sessionId}`, 'error');
          return res.status(404).json({ message: `${type} file not found` });
        }

        const filePath = path.join(sessionDir, targetFile);
        res.download(filePath, targetFile, (err) => {
          if (err) {
            log(`Failed to send ${type} file: ${err}`, 'error');
          }
        });
      } catch (error) {
        log(`Failed to access session directory: ${sessionDir}`, 'error');
        return res.status(404).json({ message: "Session not found" });
      }
    } catch (error) {
      log(`Download failed: ${error}`, 'error');
      if (!res.headersSent) {
        res.status(500).json({ message: `Failed to download ${req.params.type} file` });
      }
    }
  });

  // Process audio
  app.post("/api/spatialize", async (req, res) => {
    const { iasUrl, intensity } = req.body;

    if (!iasUrl) {
      log("Missing iasUrl parameter", 'error');
      return res.status(400).json({ message: "Missing iasUrl parameter" });
    }

    try {
      const sessions = await fs.readdir(TEMP_DIR);
      if (sessions.length === 0) {
        throw new Error("No active sessions found");
      }

      const sessionStats = await Promise.all(
        sessions.map(async (session) => {
          const stats = await fs.stat(path.join(TEMP_DIR, session));
          return { session, timestamp: stats.mtime.getTime() };
        })
      );

      const sortedSessions = sessionStats
        .sort((a, b) => b.timestamp - a.timestamp)
        .map(s => s.session);

      const latestSession = sortedSessions[0];
      const sessionDir = path.join(TEMP_DIR, latestSession);
      const files = await fs.readdir(sessionDir);
      const originalFile = files.find(f => f.startsWith('original_'));

      if (!originalFile) {
        throw new Error("Original file not found");
      }

      log(`Starting audio processing with intensity: ${intensity}`);
      const result = await spatializeAudio(
        iasUrl,
        intensity,
        sessionDir,
        originalFile.replace(/\.[^/.]+$/, '')
      );
      log("Processing completed successfully");

      if (result.downloads.binaural && result.downloads.immersive) {
        const binauralPath = path.join(TEMP_DIR, result.downloads.binaural);
        const immersivePath = path.join(TEMP_DIR, result.downloads.immersive);

        const [binauralStats, immersiveStats] = await Promise.all([
          fs.stat(binauralPath),
          fs.stat(immersivePath)
        ]);

        result.downloads.binauralSize = binauralStats.size;
        result.downloads.immersiveSize = immersiveStats.size;

        try {
          const zipPath = await createProcessedFilesZip(
            sessionDir,
            result.downloads.binaural,
            result.downloads.immersive,
            originalFile
          );
          const zipStats = await fs.stat(zipPath);

          sessionStore.updateSession(latestSession, {
            zipPath,
            zipSize: zipStats.size
          });

          result.downloads.zipSize = zipStats.size;
        } catch (error) {
          log(`ZIP creation failed: ${error}`, 'error');
        }
      }

      res.json(result);
    } catch (error) {
      log(`Processing failed: ${error}`, 'error');
      res.status(500).json({ message: "Spatialization failed" });
    }
  });

  async function createProcessedFilesZip(
    sessionDir: string,
    binauralPath: string,
    immersivePath: string,
    originalFileName: string
  ): Promise<string> {
    log(`Creating ZIP archive in: ${sessionDir}`);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const baseName = originalFileName.replace(/\.[^/.]+$/, '');
    const zipFileName = `${baseName}_${timestamp}.zip`;
    const zipFilePath = path.join(sessionDir, zipFileName);

    const output = createWriteStream(zipFilePath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    archive.on('warning', function(err) {
      if (err.code === 'ENOENT') {
        log(`Archive warning: ${err}`, 'error');
      } else {
        throw err;
      }
    });

    archive.on('error', function(err) {
      log(`Archive error: ${err}`, 'error');
      throw err;
    });

    archive.pipe(output);

    const filesToAdd = [
      { path: path.join(TEMP_DIR, binauralPath), name: path.basename(binauralPath) },
      { path: path.join(TEMP_DIR, immersivePath), name: path.basename(immersivePath) }
    ];

    for (const file of filesToAdd) {
      try {
        await fs.access(file.path);
        archive.append(createReadStream(file.path), { name: file.name });
      } catch (error) {
        log(`Failed to access file: ${file.path}`, 'error');
        throw error;
      }
    }

    await archive.finalize();

    await new Promise((resolve, reject) => {
      output.on('close', resolve);
      output.on('error', reject);
    });

    log('ZIP archive created successfully');
    return zipFilePath;
  }

  return httpServer;
}