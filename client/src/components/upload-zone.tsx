import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Upload, FileAudio, Loader2 } from "lucide-react";
import { MAX_FILE_SIZE, ALLOWED_TYPES } from "@/lib/constants";
import { queryClient } from "@/lib/queryClient";

interface UploadResponse {
  message: string;
  path: string;
  ircam?: {
    fileId: string;
    iasUrl: string;
  };
}

interface UploadZoneProps {
  onUploadSuccess?: (data?: UploadResponse) => void;
}

export function UploadZone({ onUploadSuccess }: UploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [status, setStatus] = useState<string>("");
  const { toast } = useToast();

  const resetUploadState = () => {
    setIsUploading(false);
    setProgress(0);
    setStatus("");
  };

  const handleFile = async (file: File) => {
    setIsUploading(true);
    setStatus("Checking file...");
    setProgress(0);

    // Validate file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      resetUploadState();
      toast({
        title: "Invalid file type",
        description: "Please upload a FLAC or WAV file",
        variant: "destructive",
      });
      return;
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      resetUploadState();
      toast({
        title: "File too large",
        description: "Maximum file size is 100MB",
        variant: "destructive",
      });
      return;
    }

    const formData = new FormData();
    formData.append("audio", file);

    try {
      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable) {
          const percentage = Math.round((e.loaded * 100) / e.total);
          setProgress(percentage);
          setStatus(`Uploading: ${percentage}%`);
        }
      });

      xhr.addEventListener("load", () => {
        if (xhr.status === 200) {
          const response: UploadResponse = JSON.parse(xhr.responseText);
          toast({
            title: "Upload complete",
            description: "Your audio file has been uploaded successfully",
          });
          queryClient.invalidateQueries({ queryKey: ['/api/current-file'] });
          onUploadSuccess?.(response);
          resetUploadState();
        } else {
          throw new Error(xhr.responseText || "Upload failed");
        }
      });

      xhr.addEventListener("error", () => {
        throw new Error("Network error occurred");
      });

      xhr.open("POST", "/api/upload");
      setStatus("Starting upload...");
      xhr.send(formData);
    } catch (error) {
      toast({
        title: "Upload failed",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
      resetUploadState();
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  return (
    <div
      className={`relative border-2 border-dashed rounded-lg p-6 text-center transition-colors duration-200 ${
        isDragging ? "border-primary bg-primary/5" : "border-gray-300"
      }`}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
    >
      {isUploading ? (
        <div className="py-4 space-y-4">
          <div className="flex flex-col items-center justify-center gap-2">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm font-medium text-primary">{status}</p>
          </div>
          {progress > 0 && (
            <div className="w-full max-w-md mx-auto space-y-1">
              <Progress value={progress} className="h-2" />
              <p className="text-xs text-muted-foreground">
                {progress}% complete
              </p>
            </div>
          )}
        </div>
      ) : (
        <>
          <FileAudio className="mx-auto h-8 w-8 text-gray-400 mb-3" />
          <p className="text-sm text-gray-600 mb-2">
            Drag and drop your audio file here, or click to select
          </p>
          <p className="text-xs text-gray-500 mb-3">
            Supported formats: FLAC, WAV (max 30 minutes)
          </p>
          <Button
            variant="outline"
            size="sm"
            disabled={isUploading}
            onClick={() => document.getElementById("file-upload")?.click()}
          >
            <Upload className="mr-2 h-4 w-4" />
            Select File
          </Button>
          <input
            id="file-upload"
            type="file"
            className="hidden"
            accept=".flac,.wav"
            onChange={handleFileInput}
          />
        </>
      )}
    </div>
  );
}