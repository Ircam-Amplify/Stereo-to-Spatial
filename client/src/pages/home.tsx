import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { UploadZone } from "@/components/upload-zone";
import { AudioPreview } from "@/components/audio-preview";
import { ProcessingSlider } from "@/components/processing-slider";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { Wand2, Loader2, Download, FileMusic } from "lucide-react";
import { ProcessingStatus } from "@/components/processing-status";
import { cn } from "@/lib/utils";
import { ErrorDisplay } from "@/components/error-display";

interface CurrentFileResponse {
  audioUrl: string | null;
  ircam?: {
    fileId: string;
    iasUrl: string;
  };
}

interface SpatializationResponse {
  jobId: string;
  report: {
    errorMessage: string;
    immersiveFile?: {
      ias: string;
      id: string;
    };
    binauralFile?: {
      ias: string;
      id: string;
    };
  };
  downloads: {
    binaural?: string;
    immersive?: string;
    binauralSize?: number;
    immersiveSize?: number;
    zipSize?: number;
  };
}

export default function Home() {
  const { toast } = useToast();
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [intensity, setIntensity] = useState("3");
  const [ircamData, setIrcamData] = useState<{
    fileId: string;
    iasUrl: string;
  } | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [sessionId, setSessionId] = useState<string>();
  const [hasProcessedFiles, setHasProcessedFiles] = useState(false);
  const [processingStartTime, setProcessingStartTime] = useState<Date>();
  const [processingFileInfo, setProcessingFileInfo] = useState<{
    name: string;
    size: number;
    type: string;
  }>();
  const [isCompressing, setIsCompressing] = useState(false);
  const [fileSizes, setFileSizes] = useState<{
    binaural?: number;
    immersive?: number;
    zip?: number;
  }>({});
  const [authError, setAuthError] = useState<string>();
  const [currentSessionId, setCurrentSessionId] = useState<string>();

  const { data: currentFile, isError } = useQuery<CurrentFileResponse>({
    queryKey: ["/api/current-file", currentSessionId],
    queryFn: () =>
      fetch(`/api/current-file${currentSessionId ? `?sessionId=${currentSessionId}` : ""}`)
        .then((res) => res.json()),
    retry: false,
  });

  useEffect(() => {
    if (currentFile?.ircam) {
      setIrcamData(currentFile.ircam);
    }
  }, [currentFile]);

  useEffect(() => {
    fetch("/api/check-token")
      .then(async (response) => {
        if (!response.ok) {
          const text = await response.text();
          throw new Error(text);
        }
      })
      .catch((error) => {
        setAuthError(
          "Unable to connect to IRCAM services. Please check your credentials and try again."
        );
        toast({
          title: "Service Unavailable",
          description: "Unable to connect to IRCAM services",
          variant: "destructive",
          duration: 5000,
        });
      });
  }, [toast]);

  const handleSpatialize = async () => {
    if (!ircamData?.iasUrl) return;

    setIsProcessing(true);
    setProcessingStartTime(new Date());

    const fileInput = document.getElementById("file-upload") as HTMLInputElement;
    if (fileInput?.files?.[0]) {
      const file = fileInput.files[0];
      setProcessingFileInfo({
        name: file.name,
        size: file.size,
        type: file.type,
      });
    }

    toast({
      title: "Processing Started",
      description:
        "Starting audio spatialization with IRCAM's advanced processing...",
      duration: 3000,
    });

    try {
      const response = await fetch("/api/spatialize", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          iasUrl: ircamData.iasUrl,
          intensity,
        }),
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      toast({
        title: "Processing Complete",
        description: "Preparing your processed audio files...",
        duration: 2000,
      });

      setIsCompressing(true);
      const result: SpatializationResponse = await response.json();

      if (result.downloads.binaural) {
        setHasProcessedFiles(true);
        const pathParts = result.downloads.binaural.split("/");
        if (pathParts.length > 0) {
          setSessionId(pathParts[0]);
        }

        setFileSizes({
          binaural: result.downloads.binauralSize,
          immersive: result.downloads.immersiveSize,
          zip: result.downloads.zipSize,
        });
      }

      setProcessingStartTime(undefined);
      setProcessingFileInfo(undefined);
      setIsCompressing(false);

      toast({
        title: "Success",
        description:
          "Your audio has been transformed! You can now download the processed versions.",
        duration: 4000,
      });
    } catch (error) {
      toast({
        title: "Error",
        description:
          error instanceof Error ? error.message : "Failed to process audio",
        variant: "destructive",
        duration: 5000,
      });

      setProcessingStartTime(undefined);
      setProcessingFileInfo(undefined);
      setIsCompressing(false);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownloadZip = async () => {
    if (!sessionId) return;

    toast({
      title: "Preparing Download",
      description: "Creating ZIP archive of all processed files...",
      duration: 2000,
    });

    try {
      const response = await fetch(`/api/download-zip/${sessionId}`);
      if (!response.ok) {
        throw new Error(await response.text());
      }

      const contentDisposition = response.headers.get("Content-Disposition");
      const filename = contentDisposition
        ? contentDisposition.split("filename=")[1].replace(/["']/g, "")
        : "processed_audio.zip";

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast({
        title: "Download Started",
        description:
          "All processed audio files are being downloaded as ZIP",
        duration: 3000,
      });
    } catch (error) {
      toast({
        title: "Download Failed",
        description:
          error instanceof Error ? error.message : "Failed to download files",
        variant: "destructive",
        duration: 5000,
      });
    }
  };

  const formatFileSize = (bytes?: number): string => {
    if (!bytes) return "";
    const mb = bytes / (1024 * 1024);
    return `(${mb.toFixed(1)} MB)`;
  };

  if (isError) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Card>
          <CardContent className="pt-6">
            <p className="text-destructive">Failed to load current file state</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleDownloadFile = async (type: "binaural" | "immersive") => {
    if (!sessionId) return;

    toast({
      title: "Preparing Download",
      description: `Preparing ${type} audio file for download...`,
      duration: 2000,
    });

    try {
      const response = await fetch(`/api/download-${type}/${sessionId}`);
      if (!response.ok) {
        throw new Error(await response.text());
      }

      const contentDisposition = response.headers.get("Content-Disposition");
      const filename = contentDisposition
        ? contentDisposition.split("filename=")[1].replace(/["']/g, "")
        : `processed_audio_${type}.${
            type === "binaural" ? "mp3" : "wav"
          }`;

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast({
        title: "Download Started",
        description: `Your ${type} audio file is being downloaded`,
        duration: 3000,
      });
    } catch (error) {
      toast({
        title: "Download Failed",
        description:
          error instanceof Error ? error.message : "Failed to download file",
        variant: "destructive",
        duration: 5000,
      });
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <h1 className="text-3xl font-bold mb-8 text-center bg-gradient-to-r from-primary/90 to-primary/70 bg-clip-text text-transparent">
        Stereo-to-Spatial by IRCAM Amplify
      </h1>

      {authError && (
        <ErrorDisplay title="Authentication Error" message={authError} />
      )}

      <Card className="mb-8">
        <CardContent className="pt-6">
          <UploadZone
            onUploadSuccess={(data) => {
              setUploadSuccess(true);
              if (data?.ircam) {
                setIrcamData(data.ircam);
              }
              if (data?.sessionId) {
                setCurrentSessionId(data.sessionId);
              }
              setHasProcessedFiles(false);
            }}
          />
        </CardContent>
      </Card>

      {currentFile?.audioUrl && uploadSuccess && (
        <div className="space-y-8">
          <Card
            className={cn(
              "transition-opacity duration-200",
              hasProcessedFiles && "opacity-50 pointer-events-none"
            )}
          >
            <CardContent className="pt-4 pb-3">
              <AudioPreview audioUrl={currentFile.audioUrl} />
            </CardContent>
          </Card>

          {ircamData && (
            <div className="space-y-4">
              <div className="bg-background rounded-lg p-6">
                <ProcessingSlider value={intensity} onChange={setIntensity} />
              </div>

              {isProcessing && processingStartTime && (
                <ProcessingStatus
                  startTime={processingStartTime}
                  fileInfo={processingFileInfo}
                  isCompressing={isCompressing}
                />
              )}

              <Button
                className="w-full py-6 text-lg"
                onClick={handleSpatialize}
                disabled={isProcessing}
              >
                {isProcessing ? (
                  <Loader2 className="mr-2 h-6 w-6 animate-spin" />
                ) : (
                  <Wand2 className="mr-2 h-6 w-6" />
                )}
                {isProcessing ? "Processing..." : "Spatialize my track"}
              </Button>
            </div>
          )}

          {hasProcessedFiles && (
            <Card>
              <CardContent className="pt-6">
                <div className="space-y-6">
                  <h3 className="text-lg font-semibold">
                    Preview and Download Audio
                  </h3>

                  {currentFile?.audioUrl && (
                    <AudioPreview
                      audioUrl={currentFile.audioUrl}
                      processedFiles={{
                        binaural: `/temp/${sessionId}/binaural_californication-short_1_binaural.mp3`,
                        immersive: `/temp/${sessionId}/immersive_californication-short_1_immersive.wav`,
                        binauralSize: fileSizes.binaural,
                        immersiveSize: fileSizes.immersive,
                      }}
                    />
                  )}

                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <Button
                        className="w-full py-4 text-sm"
                        onClick={() => handleDownloadFile("binaural")}
                        variant="secondary"
                        disabled={!sessionId}
                      >
                        <FileMusic className="mr-2 h-4 w-4" />
                        Binaural {formatFileSize(fileSizes.binaural)}
                      </Button>
                      <Button
                        className="w-full py-4 text-sm"
                        onClick={() => handleDownloadFile("immersive")}
                        variant="secondary"
                        disabled={!sessionId}
                      >
                        <FileMusic className="mr-2 h-4 w-4" />
                        Immersive {formatFileSize(fileSizes.immersive)}
                      </Button>
                    </div>
                    <Button
                      className="w-full py-6 text-lg"
                      onClick={handleDownloadZip}
                      variant="outline"
                    >
                      <Download className="mr-2 h-6 w-6" />
                      Download All {formatFileSize(fileSizes.zip)}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}