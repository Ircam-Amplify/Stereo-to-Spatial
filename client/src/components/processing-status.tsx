import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { formatDistance } from "date-fns";
import { Loader2 } from "lucide-react";

interface ProcessingStatusProps {
  startTime: Date;
  fileInfo?: {
    name: string;
    size: number;
    type: string;
  };
  isCompressing?: boolean;
}

export function ProcessingStatus({ startTime, fileInfo, isCompressing }: ProcessingStatusProps) {
  const [elapsedTime, setElapsedTime] = useState("");

  useEffect(() => {
    const timer = setInterval(() => {
      setElapsedTime(formatDistance(startTime, new Date(), { addSuffix: true }));
    }, 1000);

    return () => clearInterval(timer);
  }, [startTime]);

  const formatFileSize = (bytes: number) => {
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(2)} MB`;
  };

  return (
    <Card className="mb-4">
      <CardContent className="pt-6">
        <div className="flex items-center gap-4 mb-4">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <h3 className="font-medium">
            {isCompressing ? "Compressing your files..." : "Processing your audio"}
          </h3>
        </div>

        <div className="space-y-2 text-sm text-muted-foreground">
          <p>Started: {startTime.toLocaleTimeString()}</p>
          <p>Duration: {elapsedTime}</p>
          {fileInfo && (
            <>
              <p>File: {fileInfo.name}</p>
              <p>Size: {formatFileSize(fileInfo.size)}</p>
              <p>Format: {fileInfo.type}</p>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}