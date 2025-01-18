import axios from "axios";
import path from "path";
import fs from "fs/promises";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let ircamToken: string | null = null;
let tokenExpiry: number | null = null;

const IRCAM_AUTH_URL = "https://api.ircamamplify.io/oauth/token";
const IRCAM_STORAGE_URL = "https://storage.ircamamplify.io";
const IRCAM_SPATIAL_URL = "https://api.ircamamplify.io/stereotospatial/"; // Note the trailing slash
const CLIENT_ID = process.env.IRCAM_CLIENT_ID;
const CLIENT_SECRET = process.env.IRCAM_CLIENT_SECRET;
const TEMP_DIR = path.join(__dirname, "../../temp");

if (!CLIENT_ID || !CLIENT_SECRET) {
  throw new Error("IRCAM credentials not configured");
}

export async function refreshIrcamToken() {
  try {
    console.log("\n=== Refreshing IRCAM Token ===");
    console.log("URL:", IRCAM_AUTH_URL);
    console.log("Request payload:", {
      client_id: CLIENT_ID,
      grant_type: "client_credentials",
    });

    const response = await axios.post(IRCAM_AUTH_URL, {
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: "client_credentials",
    });

    ircamToken = response.data.id_token;
    tokenExpiry = Date.now() + 30 * 60 * 1000;
    console.log("Token refresh successful");
    console.log("Token expiry:", new Date(tokenExpiry).toLocaleString());

    return ircamToken;
  } catch (error) {
    console.error("\n=== Token Refresh Error ===");
    if (axios.isAxiosError(error)) {
      console.error("Request details:", {
        method: error.config?.method?.toUpperCase(),
        url: error.config?.url,
        headers: error.config?.headers,
        data: error.config?.data,
      });
      console.error("Response details:", {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
      });
    } else {
      console.error("Failed to refresh token:", error);
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
    console.log("\n=== Starting IRCAM Storage Upload ===");
    console.log(`File: ${localFilePath}`);
    const startTime = Date.now();

    // Ensure we have a valid token before proceeding
    console.log("\n1. Ensuring valid IRCAM token...");
    await ensureValidToken();
    console.log("Token validation successful");

    // Create storage location
    console.log("\n2. Creating IRCAM storage location...");
    const managerUrl = "https://storage.ircamamplify.io/manager/";
    const headers = getIrcamHeaders();

    console.log("Request details:");
    console.log("- URL:", managerUrl);
    console.log("- Method: POST");
    console.log("- Headers:", JSON.stringify(headers, null, 2));

    const createResponse = await axios.post(managerUrl, {}, { headers });
    const fileId = createResponse.data.id;
    console.log("\nStorage location created:");
    console.log("- File ID:", fileId);
    console.log("- Response:", JSON.stringify(createResponse.data, null, 2));

    // Upload file
    const filename = path.basename(localFilePath);
    const putUrl = `${IRCAM_STORAGE_URL}/${fileId}/${filename}`;
    console.log("\n3. Uploading file to IRCAM storage:");
    console.log("- Upload URL:", putUrl);

    const fileContent = await fs.readFile(localFilePath);
    const fileSize = fileContent.length;
    console.log(`- File size: ${(fileSize / 1024 / 1024).toFixed(2)}MB`);

    // Ensure token is still valid before large file upload
    await ensureValidToken();
    await axios.put(putUrl, fileContent, {
      headers: {
        ...getIrcamHeaders(),
        "Content-Type": "application/octet-stream",
      },
    });
    console.log("File upload completed successfully");

    // Get IAS URL
    console.log("\n4. Retrieving IAS URL...");
    // Ensure token is still valid before final request
    await ensureValidToken();
    console.log("Request details:");
    console.log("- URL:", managerUrl + fileId);
    console.log("- Method: GET");
    console.log("- Headers:", JSON.stringify(getIrcamHeaders(), null, 2));

    const statusResponse = await axios.get(managerUrl + fileId, {
      headers: getIrcamHeaders(),
    });
    const iasUrl = statusResponse.data.ias;
    console.log("- IAS URL:", iasUrl);
    console.log("- Full status:", JSON.stringify(statusResponse.data, null, 2));

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`\n=== Upload completed in ${duration}s ===\n`);

    return {
      fileId,
      iasUrl,
    };
  } catch (error) {
    console.error("\n=== IRCAM Storage Upload Error ===");
    if (axios.isAxiosError(error)) {
      console.error("Request details:", {
        method: error.config?.method?.toUpperCase(),
        url: error.config?.url,
        headers: error.config?.headers,
        data: error.config?.data,
      });
      console.error("Response details:", {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
      });
    } else {
      console.error("\nFailed to upload to IRCAM storage:", error);
    }
    throw error;
  }
}

async function downloadFile(fileId: string, type: 'binaural' | 'immersive', sessionDir: string) {
  try {
    console.log(`\n=== Downloading ${type} file (ID: ${fileId}) ===`);
    await ensureValidToken();
    const headers = getIrcamHeaders();

    // Get file metadata
    console.log("\n1. Getting file metadata...");
    const metadataUrl = `${IRCAM_STORAGE_URL}/manager/${fileId}`;
    console.log("Request details:");
    console.log("- URL:", metadataUrl);
    console.log("- Method: GET");
    console.log("- Headers:", JSON.stringify(headers, null, 2));

    const metadataResponse = await axios.get(metadataUrl, { headers });
    const originalFilename = metadataResponse.data.filename;
    console.log("File metadata:", JSON.stringify(metadataResponse.data, null, 2));

    // Download file
    console.log("\n2. Downloading file content...");
    const downloadUrl = `${IRCAM_STORAGE_URL}/${fileId}/${originalFilename}`;
    console.log("Request details:");
    console.log("- URL:", downloadUrl);
    console.log("- Method: GET");
    console.log("- Headers:", JSON.stringify(headers, null, 2));

    const response = await axios.get(downloadUrl, {
      headers,
      responseType: 'arraybuffer'
    });

    // Extract base name from original filename (removing any _2_binaural, etc.)
    const baseFileName = path.basename(originalFilename)
      .replace(/_(2|18)_(binaural|immersive)\.[^.]+$/, '')  // Remove IRCAM suffixes
      .replace(/^original_/, '')  // Remove our 'original_' prefix
      .replace(/\.[^.]+$/, '');  // Remove extension

    // Create simplified filename based on type
    const ext = type === 'binaural' ? '.mp3' : '.wav';
    const filename = `${type}_${baseFileName}${ext}`;
    const outputPath = path.join(sessionDir, filename);

    // Save file
    await fs.writeFile(outputPath, response.data);
    console.log(`\nFile saved successfully at: ${outputPath}`);

    // Return the relative path from TEMP_DIR
    const relativePath = path.relative(TEMP_DIR, outputPath);
    return relativePath;
  } catch (error) {
    console.error(`\n=== ${type} File Download Error ===`);
    if (axios.isAxiosError(error)) {
      console.error("Request details:", {
        method: error.config?.method?.toUpperCase(),
        url: error.config?.url,
        headers: error.config?.headers,
      });
      console.error("Response details:", {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
      });
    } else {
      console.error(`Failed to download ${type} file:`, error);
    }
    throw error;
  }
}

export async function spatializeAudio(iasUrl: string, intensity: string, sessionDir: string) {
  try {
    console.log("\n=== Starting Audio Spatialization ===");
    const startTime = Date.now();

    // Step 1: Submit spatialization job
    console.log("\n1. Submitting spatialization job...");
    await ensureValidToken();
    const headers = getIrcamHeaders();

    const payload = {
      audioUrl: iasUrl,
      presetId: parseInt(intensity),
    };
    console.log("Request details:");
    console.log("- URL:", IRCAM_SPATIAL_URL);
    console.log("- Method: POST");
    console.log("- Headers:", JSON.stringify(headers, null, 2));
    console.log("- Payload:", JSON.stringify(payload, null, 2));

    const response = await axios.post(IRCAM_SPATIAL_URL, payload, { headers });
    console.log("\nInitial response:", JSON.stringify(response.data, null, 2));

    if (!response.data.id) {
      throw new Error("No job ID returned from IRCAM API");
    }

    const jobId = response.data.id;
    console.log(`\nJob ID: ${jobId}`);

    // Step 2: Poll for job completion
    console.log("\n2. Monitoring job status...");
    let processStatus = null;
    let pollCount = 0;

    while (processStatus !== "success" && processStatus !== "error") {
      pollCount++;
      console.log(`\nPoll attempt ${pollCount}...`);

      // Wait 5 seconds between subsequent checks
      if (pollCount > 1) {
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }

      // Ensure token is valid before each status check
      await ensureValidToken();
      const statusUrl = `${IRCAM_SPATIAL_URL}${jobId}`;

      console.log("Status check request details:");
      console.log("- URL:", statusUrl);
      console.log("- Method: GET");
      console.log("- Headers:", JSON.stringify(getIrcamHeaders(), null, 2));

      const statusResponse = await axios.get(statusUrl, {
        headers: getIrcamHeaders(),
      });
      console.log("Status response:", JSON.stringify(statusResponse.data, null, 2));

      const jobInfos = statusResponse.data.job_infos;
      if (!jobInfos) {
        throw new Error("Invalid status response: missing job_infos");
      }

      processStatus = jobInfos.job_status;
      console.log(`Current status: ${processStatus}`);
    }

    if (processStatus === "error") {
      throw new Error("Spatialization job failed");
    }

    // Step 3: Get final results
    console.log("\n3. Retrieving final results...");
    await ensureValidToken();

    const finalUrl = `${IRCAM_SPATIAL_URL}${jobId}`;
    console.log("Final request details:");
    console.log("- URL:", finalUrl);
    console.log("- Method: GET");
    console.log("- Headers:", JSON.stringify(getIrcamHeaders(), null, 2));

    const finalResponse = await axios.get(finalUrl, {
      headers: getIrcamHeaders(),
    });
    console.log("Final response:", JSON.stringify(finalResponse.data, null, 2));

    const jobInfos = finalResponse.data.job_infos;
    if (!jobInfos?.report_info?.report) {
      throw new Error("Invalid final response: missing report");
    }

    const report = jobInfos.report_info.report;
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log(`\n=== Spatialization completed in ${duration}s ===`);
    console.log("Final report:", JSON.stringify(report, null, 2));

    // Download processed files
    console.log("\n=== Downloading processed files ===");
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
    console.error("\n=== Spatialization Error ===");
    if (axios.isAxiosError(error)) {
      console.error("Request details:", {
        method: error.config?.method?.toUpperCase(),
        url: error.config?.url,
        headers: error.config?.headers,
        data: error.config?.data,
      });
      console.error("Response details:", {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
      });
    } else {
      console.error("Failed to spatialize audio:", error);
    }
    throw error;
  }
}