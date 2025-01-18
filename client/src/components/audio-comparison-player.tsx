import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Play, Pause, Loader2 } from "lucide-react";
import { WaveformVisualizer } from "@/components/waveform-visualizer";

interface AudioComparisonPlayerProps {
  audioUrl: string;
  fileSize: number;
}

export function AudioComparisonPlayer({ audioUrl, fileSize }: AudioComparisonPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(true);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const audio = new Audio(audioUrl);
    audio.addEventListener('loadedmetadata', () => {
      setDuration(audio.duration);
      setIsLoading(false);
    });

    audio.addEventListener('error', () => {
      console.error('Error loading audio file');
      setIsLoading(true);
    });

    return () => {
      audio.removeEventListener('loadedmetadata', () => {});
      audio.removeEventListener('error', () => {});
      audio.remove();
    };
  }, [audioUrl]);

  const togglePlay = () => {
    setIsPlaying(!isPlaying);
  };

  const handleTimeUpdate = (time: number) => {
    // Time update handling kept for future use
  };

  const formatDuration = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const formatFileSize = (bytes: number): string => {
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  };

  const getTrackName = (url: string): string => {
    const fileName = url.split('/').pop() || '';
    return fileName
      .replace(/^(binaural|immersive)_/, '')
      .replace(/\.[^/.]+$/, '')
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  return (
    <Card className="bg-muted/40">
      <CardContent className="pt-4 pb-3">
        <div className="flex items-center gap-4 mb-4">
          <Button
            size="sm"
            variant="ghost"
            className="h-8 w-8 p-0"
            onClick={togglePlay}
            disabled={isLoading}
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : isPlaying ? (
              <Pause className="h-4 w-4" />
            ) : (
              <Play className="h-4 w-4" />
            )}
          </Button>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Binaural</span>
            <span className="text-sm text-muted-foreground">
              {getTrackName(audioUrl)} • {formatDuration(duration)} • {formatFileSize(fileSize)}
            </span>
          </div>
        </div>

        <div className="px-1">
          {isLoading ? (
            <div className="h-[40px] flex items-center justify-center bg-muted/50 rounded-md">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <WaveformVisualizer
              audioUrl={audioUrl}
              isPlaying={isPlaying}
              onPlayPause={togglePlay}
              onTimeUpdate={handleTimeUpdate}
              className="h-[40px]"
            />
          )}
        </div>
      </CardContent>
    </Card>
  );
}