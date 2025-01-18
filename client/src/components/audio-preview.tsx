import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Play, Pause, Loader2 } from "lucide-react";
import { WaveformVisualizer } from "@/components/waveform-visualizer";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

interface AudioPreviewProps {
  audioUrl: string;
  processedFiles?: {
    binaural?: string;
    immersive?: string;
    binauralSize?: number;
    immersiveSize?: number;
  };
}

export function AudioPreview({ audioUrl, processedFiles }: AudioPreviewProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState<number>(0);
  const [activeVersion, setActiveVersion] = useState<'original' | 'binaural'>('original');
  const [currentTime, setCurrentTime] = useState(0);
  const originalAudioRef = useRef<HTMLAudioElement | null>(null);
  const binauralAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const loadAudio = async () => {
      // Load original audio
      const originalAudio = new Audio(audioUrl);
      originalAudio.addEventListener('loadedmetadata', () => {
        setDuration(originalAudio.duration);
      });
      originalAudioRef.current = originalAudio;

      // Load binaural audio if available
      if (processedFiles?.binaural) {
        const binauralAudio = new Audio(processedFiles.binaural);
        binauralAudioRef.current = binauralAudio;
      }
    };

    loadAudio();

    return () => {
      // Cleanup audio elements
      if (originalAudioRef.current) {
        originalAudioRef.current.pause();
        originalAudioRef.current = null;
      }
      if (binauralAudioRef.current) {
        binauralAudioRef.current.pause();
        binauralAudioRef.current = null;
      }
    };
  }, [audioUrl, processedFiles?.binaural]);

  const togglePlay = () => {
    const currentAudio = activeVersion === 'original' ? originalAudioRef.current : binauralAudioRef.current;

    if (isPlaying) {
      currentAudio?.pause();
    } else {
      if (currentAudio) {
        currentAudio.currentTime = currentTime;
        currentAudio.play().catch(console.error);
      }
    }
    setIsPlaying(!isPlaying);
  };

  const handleVersionChange = (version: string) => {
    const newVersion = version as 'original' | 'binaural';
    const currentAudio = activeVersion === 'original' ? originalAudioRef.current : binauralAudioRef.current;
    const newAudio = newVersion === 'original' ? originalAudioRef.current : binauralAudioRef.current;

    if (currentAudio && newAudio) {
      const wasPlaying = !currentAudio.paused;
      currentAudio.pause();
      newAudio.currentTime = currentAudio.currentTime;

      if (wasPlaying) {
        newAudio.play().catch(console.error);
      }
    }

    setActiveVersion(newVersion);
  };

  const handleTimeUpdate = (time: number) => {
    setCurrentTime(time);
    const otherAudio = activeVersion === 'original' ? binauralAudioRef.current : originalAudioRef.current;
    if (otherAudio) {
      otherAudio.currentTime = time;
    }
  };

  const formatDuration = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const getTrackName = (url: string): string => {
    const fileName = url.split('/').pop() || '';
    return fileName
      .replace(/^(original|binaural)_/, '')
      .replace(/\.[^/.]+$/, '')
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  return (
    <div className="space-y-4">
      {processedFiles?.binaural && (
        <div className="flex justify-center">
          <ToggleGroup
            type="single"
            value={activeVersion}
            onValueChange={(v) => v && handleVersionChange(v)}
            className="bg-muted/40 p-1 rounded-lg"
          >
            <ToggleGroupItem
              value="original"
              className="px-4 py-2 text-sm data-[state=on]:bg-background data-[state=on]:text-foreground rounded-md transition-all"
            >
              Original File
            </ToggleGroupItem>
            <ToggleGroupItem
              value="binaural"
              className="px-4 py-2 text-sm data-[state=on]:bg-primary data-[state=on]:text-primary-foreground rounded-md transition-all"
            >
              Binaural by IRCAM Amplify
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
      )}

      <Card className="bg-muted/40">
        <CardContent className="pt-4 pb-3">
          <div className="flex items-center gap-4 mb-4">
            <Button
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0"
              onClick={togglePlay}
            >
              {isPlaying ? (
                <Pause className="h-4 w-4" />
              ) : (
                <Play className="h-4 w-4" />
              )}
            </Button>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">
                {activeVersion === 'original' ? 'Original' : 'Binaural'}
              </span>
              <span className="text-sm text-muted-foreground">
                {getTrackName(audioUrl)} • {formatDuration(duration)}
              </span>
            </div>
          </div>

          <div className="px-1">
            <WaveformVisualizer
              audioUrl={activeVersion === 'original' ? audioUrl : (processedFiles?.binaural || '')}
              isPlaying={isPlaying}
              onPlayPause={togglePlay}
              onTimeUpdate={handleTimeUpdate}
              className="h-[40px]"
              waveColor={activeVersion === 'binaural' ? "hsl(var(--primary))" : undefined}
              progressColor={activeVersion === 'binaural' ? "hsl(var(--primary)/.5)" : undefined}
              initialTime={currentTime}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}