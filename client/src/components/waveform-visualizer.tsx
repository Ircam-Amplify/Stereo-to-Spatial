import { useEffect, useRef, useState } from 'react';
import WaveSurfer from 'wavesurfer.js';
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

interface WaveformVisualizerProps {
  audioUrl: string;
  isPlaying: boolean;
  onPlayPause: () => void;
  onTimeUpdate: (time: number) => void;
  className?: string;
  initialTime?: number;
  waveColor?: string;
  progressColor?: string;
}

export function WaveformVisualizer({
  audioUrl,
  isPlaying,
  onPlayPause,
  onTimeUpdate,
  className,
  initialTime = 0,
  waveColor = '#666666',
  progressColor = '#000000'
}: WaveformVisualizerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer>();
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  // Initialize WaveSurfer
  useEffect(() => {
    if (!containerRef.current) return;

    const wavesurfer = WaveSurfer.create({
      container: containerRef.current,
      waveColor,
      progressColor,
      height: 40,
      normalize: true,
      backend: 'WebAudio',
      hideScrollbar: true,
      cursorWidth: 1,
      interact: true,
      fillParent: true,
      minPxPerSec: 50,
      barWidth: 2,
      barGap: 1,
      barRadius: 2
    });

    wavesurferRef.current = wavesurfer;

    // Handle ready event
    wavesurfer.on('ready', () => {
      setIsLoading(false);
      if (initialTime > 0) {
        wavesurfer.setTime(initialTime);
      }
    });

    // Handle errors
    wavesurfer.on('error', (error) => {
      console.error('WaveSurfer error:', error);
      setLoadError(true);
      setIsLoading(false);
    });

    // Handle time updates
    wavesurfer.on('audioprocess', (time) => {
      onTimeUpdate(time);
    });

    // Handle finish
    wavesurfer.on('finish', () => {
      onPlayPause();
    });

    // Load audio
    wavesurfer.load(audioUrl);

    // Cleanup
    return () => {
      if (wavesurfer) {
        wavesurfer.destroy();
      }
    };
  }, [audioUrl]); // Only recreate when audioUrl changes

  // Handle play/pause state
  useEffect(() => {
    const wavesurfer = wavesurferRef.current;
    if (!wavesurfer || isLoading) return;

    if (isPlaying && !wavesurfer.isPlaying()) {
      wavesurfer.play();
    } else if (!isPlaying && wavesurfer.isPlaying()) {
      wavesurfer.pause();
    }
  }, [isPlaying, isLoading]);

  // Handle clicks on waveform
  useEffect(() => {
    const wavesurfer = wavesurferRef.current;
    if (!wavesurfer) return;

    const handleClick = () => {
      onPlayPause();
    };

    wavesurfer.on('click', handleClick);

    return () => {
      wavesurfer.un('click', handleClick);
    };
  }, [onPlayPause]);

  if (loadError) {
    return (
      <div className={cn(
        "w-full h-[40px] flex items-center justify-center",
        "bg-destructive/10 text-destructive text-sm rounded",
        className
      )}>
        Failed to load waveform
      </div>
    );
  }

  return (
    <div className="relative">
      {isLoading && (
        <Skeleton className={cn("w-full h-[40px] absolute top-0 left-0", className)} />
      )}
      <div
        ref={containerRef}
        className={cn(
          "w-full bg-background/5 rounded transition-opacity duration-200",
          isLoading ? "opacity-0" : "opacity-100",
          className
        )}
      />
    </div>
  );
}