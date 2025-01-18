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
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;

    const cleanup = () => {
      if (wavesurferRef.current) {
        wavesurferRef.current.destroy();
        wavesurferRef.current = undefined;
      }
    };

    cleanup();
    setIsLoading(true);
    setLoadError(false);
    setIsReady(false);

    try {
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

      wavesurfer.on('ready', () => {
        setIsLoading(false);
        setIsReady(true);
        if (initialTime > 0) {
          wavesurfer.setTime(initialTime);
        }
      });

      wavesurfer.on('error', () => {
        console.error('WaveSurfer error encountered');
        setLoadError(true);
        setIsLoading(false);
      });

      wavesurfer.on('timeupdate', (time) => {
        onTimeUpdate(time);
      });

      wavesurfer.on('finish', () => {
        onPlayPause();
      });

      // Create an audio element for preloading
      const audio = new Audio();
      audio.src = audioUrl;
      audio.preload = 'auto';

      // Once audio is loaded, pass it to WaveSurfer
      audio.addEventListener('canplay', () => {
        wavesurfer.load(audioUrl);
      });

      wavesurferRef.current = wavesurfer;

      return () => {
        audio.remove();
        cleanup();
      };
    } catch (error) {
      console.error('Error initializing WaveSurfer:', error);
      setLoadError(true);
      setIsLoading(false);
    }
  }, [audioUrl, initialTime, waveColor, progressColor]);

  useEffect(() => {
    const wavesurfer = wavesurferRef.current;
    if (!wavesurfer || isLoading || !isReady) return;

    try {
      if (isPlaying) {
        wavesurfer.play();
      } else {
        wavesurfer.pause();
      }
    } catch (error) {
      console.error('Playback control error:', error);
    }
  }, [isPlaying, isLoading, isReady]);

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