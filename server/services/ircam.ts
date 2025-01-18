import axios from "axios";
import path from "path";
import fs from "fs/promises";
import { fileURLToPath } from "url";
import { logger } from "../lib/logger";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let ircamToken: string | null = null;
let tokenExpiry: number | null = null;

const IRCAM_AUTH_URL = "https://api.ircamamplify.io/oauth/token";
const IRCAM_STORAGE_URL = "https://storage.ircamamplify.io";
const IRCAM_SPATIAL_URL = "https://api.ircamamplify.io/stereotospatial/";
const CLIENT_ID = process.env.IRCAM_CLIENT_ID;
const CLIENT_SECRET = process.env.IRCAM_CLIENT_SECRET;
const TEMP_DIR = path.join(__dirname, "../../temp");

if (!CLIENT_ID || !CLIENT_SECRET) {
  throw new Error("IRCAM credentials not configured");
}

export async function refreshIrcamToken() {
  try {
    logger.info('IRCAM', 'Refreshing access token');
    logger.debug('IRCAM', `Auth URL: ${IRCAM_AUTH_URL}`);

    const response = await axios.post(IRCAM_AUTH_URL, {
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: "client_credentials",
    });

    ircamToken = response.data.id_token;
    tokenExpiry = Date.now() + 30 * 60 * 1000;

    logger.info('IRCAM', 'Token refresh successful');
    logger.debug('IRCAM', `Token expires: ${new Date(tokenExpiry).toLocaleString()}`);

    return ircamToken;
  } catch (error) {
    logger.error('IRCAM', 'Token refresh failed');
    if (axios.isAxiosError(error)) {
      logger.error('IRCAM', {
        method: error.config?.method?.toUpperCase(),
        url: error.config?.url,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
      });
    } else {
      logger.error('IRCAM', error);
    }
    throw error;
  }
}

export function getIrcamToken(): string | null {
  if (!ircamToken || !tokenExpiry || Date.now() >= tokenExpiry) {
    return null;
  }
  return ircamToken;
}

export async function ensureValidToken() {
  const token = getIrcamToken();
  if (!token) {
    await refreshIrcamToken();
  }
  return getIrcamToken();
}

export function getIrcamHeaders() {
  const token = getIrcamToken();
  if (!token) {
    throw new Error("IRCAM token not available");
  }

  return {
    "Content-Type": "application/json",
    Accept: "application/json",
    Authorization: `Bearer ${token}`,
  };
}

export async function uploadToIrcamStorage(localFilePath: string) {
  try {
    logger.info('IRCAM', 'Starting storage upload');
    logger.debug('IRCAM', `File: ${localFilePath}`);
    const startTime = Date.now();

    logger.info('IRCAM', 'Ensuring valid token...');
    await ensureValidToken();
    logger.info('IRCAM', 'Token validation successful');

    logger.info('IRCAM', 'Creating storage location...');
    const managerUrl = "https://storage.ircamamplify.io/manager/";
    const headers = getIrcamHeaders();

    logger.debug('IRCAM', "Request details:");
    logger.debug('IRCAM', `- URL: ${managerUrl}`);
    logger.debug('IRCAM', `- Method: POST`);
    logger.debug('IRCAM', `- Headers: ${JSON.stringify(headers, null, 2)}`);

    const createResponse = await axios.post(managerUrl, {}, { headers });
    const fileId = createResponse.data.id;
    logger.info('IRCAM', 'Storage location created');
    logger.debug('IRCAM', `- File ID: ${fileId}`);
    logger.debug('IRCAM', `- Response: ${JSON.stringify(createResponse.data, null, 2)}`);

    const filename = path.basename(localFilePath);
    const putUrl = `${IRCAM_STORAGE_URL}/${fileId}/${filename}`;
    logger.info('IRCAM', 'Uploading file to storage');
    logger.debug('IRCAM', `- Upload URL: ${putUrl}`);

    const fileContent = await fs.readFile(localFilePath);
    const fileSize = fileContent.length;
    logger.debug('IRCAM', `- File size: ${(fileSize / 1024 / 1024).toFixed(2)}MB`);

    await ensureValidToken();
    await axios.put(putUrl, fileContent, {
      headers: {
        ...getIrcamHeaders(),
        "Content-Type": "application/octet-stream",
      },
    });
    logger.info('IRCAM', 'File upload completed successfully');

    logger.info('IRCAM', 'Retrieving IAS URL...');
    await ensureValidToken();
    logger.debug('IRCAM', "Request details:");
    logger.debug('IRCAM', `- URL: ${managerUrl + fileId}`);
    logger.debug('IRCAM', `- Method: GET`);
    logger.debug('IRCAM', `- Headers: ${JSON.stringify(getIrcamHeaders(), null, 2)}`);

    const statusResponse = await axios.get(managerUrl + fileId, {
      headers: getIrcamHeaders(),
    });
    const iasUrl = statusResponse.data.ias;
    logger.debug('IRCAM', `- IAS URL: ${iasUrl}`);
    logger.debug('IRCAM', `- Full status: ${JSON.stringify(statusResponse.data, null, 2)}`);

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    logger.info('IRCAM', `Upload completed in ${duration}s`);

    return {
      fileId,
      iasUrl,
    };
  } catch (error) {
    logger.error('IRCAM', 'Storage upload failed');
    if (axios.isAxiosError(error)) {
      logger.error('IRCAM', {
        method: error.config?.method?.toUpperCase(),
        url: error.config?.url,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
      });
    } else {
      logger.error('IRCAM', error);
    }
    throw error;
  }
}

async function downloadFile(fileId: string, type: 'binaural' | 'immersive', sessionDir: string) {
  try {
    logger.info('IRCAM', `Downloading ${type} file (ID: ${fileId})`);
    await ensureValidToken();
    const headers = getIrcamHeaders();

    logger.info('IRCAM', 'Getting file metadata...');
    const metadataUrl = `${IRCAM_STORAGE_URL}/manager/${fileId}`;
    logger.debug('IRCAM', "Request details:");
    logger.debug('IRCAM', `- URL: ${metadataUrl}`);
    logger.debug('IRCAM', `- Method: GET`);
    logger.debug('IRCAM', `- Headers: ${JSON.stringify(headers, null, 2)}`);

    const metadataResponse = await axios.get(metadataUrl, { headers });
    const originalFilename = metadataResponse.data.filename;
    logger.debug('IRCAM', `File metadata: ${JSON.stringify(metadataResponse.data, null, 2)}`);

    logger.info('IRCAM', 'Downloading file content...');
    const downloadUrl = `${IRCAM_STORAGE_URL}/${fileId}/${originalFilename}`;
    logger.debug('IRCAM', "Request details:");
    logger.debug('IRCAM', `- URL: ${downloadUrl}`);
    logger.debug('IRCAM', `- Method: GET`);
    logger.debug('IRCAM', `- Headers: ${JSON.stringify(headers, null, 2)}`);

    const response = await axios.get(downloadUrl, {
      headers,
      responseType: 'arraybuffer'
    });

    const baseFileName = path.basename(originalFilename)
      .replace(/_(2|18)_(binaural|immersive)\.[^.]+$/, '')
      .replace(/^original_/, '')
      .replace(/\.[^.]+$/, '');

    const ext = type === 'binaural' ? '.mp3' : '.wav';
    const filename = `${type}_${baseFileName}${ext}`;
    const outputPath = path.join(sessionDir, filename);

    await fs.writeFile(outputPath, response.data);
    logger.info('IRCAM', `File saved successfully at: ${outputPath}`);

    const relativePath = path.relative(TEMP_DIR, outputPath);
    return relativePath;
  } catch (error) {
    logger.error('IRCAM', `${type} file download failed`);
    if (axios.isAxiosError(error)) {
      logger.error('IRCAM', {
        method: error.config?.method?.toUpperCase(),
        url: error.config?.url,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
      });
    } else {
      logger.error('IRCAM', error);
    }
    throw error;
  }
}

export async function spatializeAudio(iasUrl: string, intensity: string, sessionDir: string) {
  try {
    logger.info('IRCAM', 'Starting audio spatialization');
    const startTime = Date.now();

    logger.info('IRCAM', 'Submitting spatialization job...');
    await ensureValidToken();
    const headers = getIrcamHeaders();

    const payload = {
      audioUrl: iasUrl,
      presetId: parseInt(intensity),
    };
    logger.debug('IRCAM', "Request details:");
    logger.debug('IRCAM', `- URL: ${IRCAM_SPATIAL_URL}`);
    logger.debug('IRCAM', `- Method: POST`);
    logger.debug('IRCAM', `- Headers: ${JSON.stringify(headers, null, 2)}`);
    logger.debug('IRCAM', `- Payload: ${JSON.stringify(payload, null, 2)}`);

    const response = await axios.post(IRCAM_SPATIAL_URL, payload, { headers });
    logger.debug('IRCAM', `Initial response: ${JSON.stringify(response.data, null, 2)}`);

    if (!response.data.id) {
      throw new Error("No job ID returned from IRCAM API");
    }

    const jobId = response.data.id;
    logger.info('IRCAM', `Job ID: ${jobId}`);

    logger.info('IRCAM', 'Monitoring job status...');
    let processStatus = null;
    let pollCount = 0;

    while (processStatus !== "success" && processStatus !== "error") {
      pollCount++;
      logger.info('IRCAM', `Poll attempt ${pollCount}...`);

      if (pollCount > 1) {
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }

      await ensureValidToken();
      const statusUrl = `${IRCAM_SPATIAL_URL}${jobId}`;

      logger.debug('IRCAM', "Status check request details:");
      logger.debug('IRCAM', `- URL: ${statusUrl}`);
      logger.debug('IRCAM', `- Method: GET`);
      logger.debug('IRCAM', `- Headers: ${JSON.stringify(getIrcamHeaders(), null, 2)}`);

      const statusResponse = await axios.get(statusUrl, {
        headers: getIrcamHeaders(),
      });
      logger.debug('IRCAM', `Status response: ${JSON.stringify(statusResponse.data, null, 2)}`);

      const jobInfos = statusResponse.data.job_infos;
      if (!jobInfos) {
        throw new Error("Invalid status response: missing job_infos");
      }

      processStatus = jobInfos.job_status;
      logger.info('IRCAM', `Current status: ${processStatus}`);
    }

    if (processStatus === "error") {
      throw new Error("Spatialization job failed");
    }

    logger.info('IRCAM', 'Retrieving final results...');
    await ensureValidToken();

    const finalUrl = `${IRCAM_SPATIAL_URL}${jobId}`;
    logger.debug('IRCAM', "Final request details:");
    logger.debug('IRCAM', `- URL: ${finalUrl}`);
    logger.debug('IRCAM', `- Method: GET`);
    logger.debug('IRCAM', `- Headers: ${JSON.stringify(getIrcamHeaders(), null, 2)}`);

    const finalResponse = await axios.get(finalUrl, {
      headers: getIrcamHeaders(),
    });
    logger.debug('IRCAM', `Final response: ${JSON.stringify(finalResponse.data, null, 2)}`);

    const jobInfos = finalResponse.data.job_infos;
    if (!jobInfos?.report_info?.report) {
      throw new Error("Invalid final response: missing report");
    }

    const report = jobInfos.report_info.report;
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    logger.info('IRCAM', `Spatialization completed in ${duration}s`);
    logger.debug('IRCAM', `Final report: ${JSON.stringify(report, null, 2)}`);

    logger.info('IRCAM', 'Downloading processed files...');
    const downloads: { binaural?: string; immersive?: string } = {};

    if (report.binauralFile?.id) {
      downloads.binaural = await downloadFile(report.binauralFile.id, 'binaural', sessionDir);
    }

    if (report.immersiveFile?.id) {
      downloads.immersive = await downloadFile(report.immersiveFile.id, 'immersive', sessionDir);
    }

    return {
      jobId,
      report,
      downloads
    };
  } catch (error) {
    logger.error('IRCAM', 'Spatialization failed');
    if (axios.isAxiosError(error)) {
      logger.error('IRCAM', {
        method: error.config?.method?.toUpperCase(),
        url: error.config?.url,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
      });
    } else {
      logger.error('IRCAM', error);
    }
    throw error;
  }
}