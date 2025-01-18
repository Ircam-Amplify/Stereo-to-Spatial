import { Request, Response, NextFunction } from "express";
import { MAX_DURATION } from "../../client/src/lib/constants";

interface FileRequest extends Request {
  file?: Express.Multer.File;
}

export async function validateAudioFile(
  req: FileRequest,
  res: Response,
  next: NextFunction
) {
  if (!req.file) {
    console.error("[Validation Error] No file uploaded");
    return res.status(400).json({ message: "No file uploaded" });
  }

  const allowedTypes = [
    'audio/flac',
    'audio/wav',
    'audio/wave',
    'audio/x-wav'
  ];

  // Check MIME type
  if (!allowedTypes.includes(req.file.mimetype)) {
    console.error(`[Validation Error] Invalid file type: ${req.file.mimetype}`);
    console.error("[Validation Error] Supported types:", allowedTypes.join(", "));
    return res.status(400).json({
      message: "Invalid file type. Only FLAC and WAV files are supported."
    });
  }

  try {
    console.log(`\n[Validation] Checking duration for file: ${req.file.filename}`);
    // Import the package using dynamic import
    const audioDuration = await import('get-audio-duration');
    // Pass the full file path to getAudioDuration
    const duration = await audioDuration.default(req.file.path);
    console.log(`[Validation] File duration: ${duration.toFixed(2)} seconds`);

    if (duration > MAX_DURATION) {
      console.error("[Validation Error] File exceeds maximum duration");
      console.error(`  - File duration: ${duration.toFixed(2)} seconds`);
      console.error(`  - Maximum allowed: ${MAX_DURATION} seconds`);
      return res.status(400).json({
        message: "Audio file exceeds maximum duration of 30 minutes"
      });
    }

    console.log("[Validation] File passed all checks");
    next();
  } catch (error) {
    console.error('[Validation Error] Failed to validate audio file:', error);
    return res.status(400).json({
      message: "Error validating audio file. Please ensure the file is a valid FLAC or WAV file."
    });
  }
}