import React, { useState, useRef, useEffect, useCallback } from 'react';

export interface LocalVideoInfo {
  file: File;
  fileName: string;
  fileSize: number;
  fileType: string;
  objectUrl: string;
  duration: number;
  videoWidth: number;
  videoHeight: number;
  hasAudio: boolean;
}

export interface UseLocalVideoReturn {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  videoInfo: LocalVideoInfo | null;
  isCaptureSupported: boolean;
  isVideoReady: boolean;
  capturedStream: MediaStream | null;
  error: string | null;
  handleFileSelect: (file: File) => void;
  startCapture: () => MediaStream | null;
  stopCapture: () => void;
  clearVideo: () => void;
}

export function useLocalVideo(): UseLocalVideoReturn {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [videoInfo, setVideoInfo] = useState<LocalVideoInfo | null>(null);
  const [capturedStream, setCapturedStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isCaptureSupported, setIsCaptureSupported] = useState<boolean>(true);
  const [isVideoReady, setIsVideoReady] = useState<boolean>(false);

  // Check captureStream support on mount
  useEffect(() => {
    const video = document.createElement('video');
    const hasCapture =
      typeof (video as any).captureStream === 'function' ||
      typeof (video as any).mozCaptureStream === 'function';
    setIsCaptureSupported(hasCapture);
  }, []);

  const clearVideo = useCallback(() => {
    if (videoInfo?.objectUrl) {
      URL.revokeObjectURL(videoInfo.objectUrl);
    }
    if (capturedStream) {
      capturedStream.getTracks().forEach((t) => t.stop());
      setCapturedStream(null);
    }
    setVideoInfo(null);
    setIsVideoReady(false);
    setError(null);
    if (videoRef.current) {
      videoRef.current.src = '';
      videoRef.current.load();
    }
  }, [videoInfo, capturedStream]);

  // Clean up object URLs on unmount
  useEffect(() => {
    return () => {
      if (videoInfo?.objectUrl) {
        URL.revokeObjectURL(videoInfo.objectUrl);
      }
      if (capturedStream) {
        capturedStream.getTracks().forEach((t) => t.stop());
      }
    };
  }, [videoInfo, capturedStream]);

  const handleFileSelect = useCallback((file: File) => {
    setError(null);

    // Validate mime type or file extension
    if (!file.type.startsWith('video/') && !file.name.match(/\.(mp4|mkv|webm|mov|m4v|avi)$/i)) {
      setError('Please select a valid video file (MP4, WebM, MKV, MOV).');
      return;
    }

    if (videoInfo?.objectUrl) {
      URL.revokeObjectURL(videoInfo.objectUrl);
    }

    try {
      const url = URL.createObjectURL(file);
      const info: LocalVideoInfo = {
        file,
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type || 'video/mp4',
        objectUrl: url,
        duration: 0,
        videoWidth: 0,
        videoHeight: 0,
        hasAudio: false,
      };

      setVideoInfo(info);
      // NOTE: we intentionally do NOT touch videoRef.current here. At this
      // point in the very first file selection, the <video> element hasn't
      // been mounted yet (it's behind `!videoInfo ? dropzone : <video/>`),
      // so videoRef.current would be null and this would silently no-op --
      // wiring .src/.onloadedmetadata is done in the effect below instead,
      // which runs after React has committed the real <video> element.
    } catch (err: any) {
      setError(`Failed to open local file: ${err?.message || 'Unknown error'}`);
    }
  }, [videoInfo]);

  // Wires the actual <video> element to the selected file. Runs after
  // React has mounted the <video> tag (guaranteed once videoInfo is set),
  // rather than inline in handleFileSelect where the element may not exist
  // yet on the very first file selection.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoInfo?.objectUrl) return;

    setIsVideoReady(false);
    video.pause();
    video.removeAttribute('src');
    video.load();
    video.src = videoInfo.objectUrl;
    video.load();

    const updateMetadata = () => {
      if (!videoRef.current) return;
      const duration = videoRef.current.duration || 0;
      const videoWidth = videoRef.current.videoWidth || 0;
      const videoHeight = videoRef.current.videoHeight || 0;
      const media = videoRef.current as any;
      const hasAudio = media.mozHasAudio === true ||
        Boolean(media.audioTracks?.length) ||
        Number(media.webkitAudioDecodedByteCount || 0) > 0;
      setVideoInfo((prev) => (prev ? { ...prev, duration, videoWidth, videoHeight, hasAudio } : null));
    };
    const markReady = () => {
      updateMetadata();
      setIsVideoReady(true);
    };

    video.onloadedmetadata = updateMetadata;
    video.oncanplay = markReady;
    video.onloadeddata = markReady;
    video.onerror = () => {
      setIsVideoReady(false);
      setError(
        'This browser cannot play this video format. Please select an H.264/AAC MP4 or WebM video file.'
      );
    };
    // Keyed only on objectUrl (stable across the metadata-triggered
    // videoInfo update above) so this runs exactly once per genuinely new
    // file, not on every field change to videoInfo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoInfo?.objectUrl]);

  const startCapture = useCallback((): MediaStream | null => {
    const video = videoRef.current;
    if (!video) {
      setError('Video player element not initialized');
      return null;
    }
    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      setError('Video is still loading. Please wait until the video is ready.');
      return null;
    }

    try {
      let stream: MediaStream | null = null;
      if (typeof (video as any).captureStream === 'function') {
        stream = (video as any).captureStream();
      } else if (typeof (video as any).mozCaptureStream === 'function') {
        stream = (video as any).mozCaptureStream();
      }

      if (!stream) {
        setError(
          'This browser cannot capture local video for P2P streaming. Please use a supported browser such as a modern Chromium-based browser.'
        );
        return null;
      }

      setCapturedStream(stream);
      return stream;
    } catch (err: any) {
      console.error('[CaptureStream Error]', err);
      setError(`Failed to capture video stream: ${err?.message || 'Unsupported browser'}`);
      return null;
    }
  }, []);

  const stopCapture = useCallback(() => {
    if (capturedStream) {
      capturedStream.getTracks().forEach((t) => t.stop());
      setCapturedStream(null);
    }
  }, [capturedStream]);

  return {
    videoRef,
    videoInfo,
    isCaptureSupported,
    isVideoReady,
    capturedStream,
    error,
    handleFileSelect,
    startCapture,
    stopCapture,
    clearVideo,
  };
}
