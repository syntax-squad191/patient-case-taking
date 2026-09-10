import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Camera, RefreshCw, AlertCircle, Check, Shield } from 'lucide-react';
import { LivenessStatus } from '../../types/verification';
import { calculateFaceEAR, BlinkDetector, DEFAULT_EAR_CONFIG } from '../../utils/earLiveness';
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { useTranslation } from '../../context/LanguageContext';

interface CameraLivenessProps {
  onLivenessSuccess: (snapshotBlob: Blob, snapshotUrl: string, snapshotCanvas: HTMLCanvasElement) => void;
  onCancel?: () => void;
  earThreshold?: number;
  consecutiveFrames?: number;
}

export const CameraLiveness: React.FC<CameraLivenessProps> = ({
  onLivenessSuccess,
  onCancel,
  earThreshold = DEFAULT_EAR_CONFIG.threshold,
  consecutiveFrames = DEFAULT_EAR_CONFIG.consecutiveFrames,
}) => {
  const { t } = useTranslation();
  const [status, setStatus] = useState<LivenessStatus>('requesting_permission');
  const [currentEar, setCurrentEar] = useState<number>(0);
  const [statusMessage, setStatusMessage] = useState<string>('Opening secure camera stream...');
  const [modelReady, setModelReady] = useState<boolean>(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const landmarkerRef = useRef<FaceLandmarker | null>(null);
  const blinkDetectorRef = useRef<BlinkDetector>(new BlinkDetector(earThreshold, consecutiveFrames));
  const animFrameIdRef = useRef<number | null>(null);
  const isFinishedRef = useRef<boolean>(false);

  // Stop all camera media tracks immediately
  const stopCamera = useCallback(() => {
    if (animFrameIdRef.current !== null) {
      cancelAnimationFrame(animFrameIdRef.current);
      animFrameIdRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // ignore
        }
      });
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  // Capture snapshot directly from live webcam stream
  const captureSnapshot = useCallback(
    (video: HTMLVideoElement): { blob: Promise<Blob>; canvas: HTMLCanvasElement; url: string } => {
      const offscreenCanvas = document.createElement('canvas');
      offscreenCanvas.width = video.videoWidth || 640;
      offscreenCanvas.height = video.videoHeight || 480;
      const ctx = offscreenCanvas.getContext('2d');
      if (ctx) {
        // Mirror the image horizontally to match webcam mirror preview
        ctx.translate(offscreenCanvas.width, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(video, 0, 0, offscreenCanvas.width, offscreenCanvas.height);
      }

      const blobPromise = new Promise<Blob>((resolve, reject) => {
        offscreenCanvas.toBlob(
          (b) => {
            if (b) resolve(b);
            else reject(new Error('Snapshot capture failed'));
          },
          'image/jpeg',
          0.95
        );
      });

      const url = offscreenCanvas.toDataURL('image/jpeg', 0.95);
      return { blob: blobPromise, canvas: offscreenCanvas, url };
    },
    []
  );

  // Start webcam
  const startCamera = useCallback(async () => {
    setStatus('requesting_permission');
    setStatusMessage(t('verification.liveness.cameraPrompt'));

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setStatus('camera_unavailable');
        setStatusMessage(t('verification.liveness.cameraPermissionDenied'));
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user',
        },
        audio: false,
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setStatus('ready');
        setStatusMessage(t('verification.liveness.instruction'));
      }
    } catch (err: unknown) {
      const error = err as Error;
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        setStatus('permission_denied');
        setStatusMessage(t('verification.liveness.cameraPermissionDenied'));
      } else {
        setStatus('camera_unavailable');
        setStatusMessage(t('verification.liveness.cameraPermissionDenied'));
      }
    }
  }, [t]);

  // Initialize MediaPipe FaceLandmarker for continuous video detection
  useEffect(() => {
    let isMounted = true;

    async function initModel() {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
        );

        if (!isMounted) return;

        const landmarker = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
            delegate: 'GPU',
          },
          outputFaceBlendshapes: false,
          outputFacialTransformationMatrixes: false,
          runningMode: 'VIDEO',
          numFaces: 2, // Detect up to 2 faces to strictly detect multiple face violations
        });

        if (isMounted) {
          landmarkerRef.current = landmarker;
          setModelReady(true);
        }
      } catch {
        if (isMounted) {
          setStatus('failed');
          setStatusMessage(t('verification.liveness.livenessFailed'));
        }
      }
    }

    initModel();

    return () => {
      isMounted = false;
    };
  }, [t]);

  // Main continuous detection loop
  useEffect(() => {
    if (!modelReady) return;

    startCamera();

    let lastVideoTime = -1;

    const processFrame = () => {
      if (isFinishedRef.current) return;

      const video = videoRef.current;
      const landmarker = landmarkerRef.current;

      if (video && video.readyState >= 2 && landmarker) {
        if (video.currentTime !== lastVideoTime) {
          lastVideoTime = video.currentTime;

          const nowInMs = performance.now();
          const results = landmarker.detectForVideo(video, nowInMs);

          const faceCount = results.faceLandmarks.length;

          if (faceCount === 0) {
            setStatus('no_face');
            setStatusMessage(t('verification.idDocument.noFaceFound'));
            blinkDetectorRef.current.reset();
          } else if (faceCount > 1) {
            setStatus('multiple_faces');
            setStatusMessage('Multiple faces detected. Ensure only one person is visible.');
            blinkDetectorRef.current.reset();
          } else {
            // Exactly 1 face detected
            const landmarks = results.faceLandmarks[0];
            const { avgEAR } = calculateFaceEAR(landmarks);
            setCurrentEar(Math.round(avgEAR * 100) / 100);

            const { isBlinking, blinkConfirmed } = blinkDetectorRef.current.processFrame(avgEAR);

            if (blinkConfirmed) {
              isFinishedRef.current = true;
              setStatus('blink_detected');
              setStatusMessage(t('verification.liveness.capturingSnapshot'));

              // Immediately capture official live snapshot directly from active video stream
              const { blob: blobPromise, canvas: offscreenCanvas, url } = captureSnapshot(video);

              // Stop camera immediately after capture
              stopCamera();

              blobPromise.then((blob) => {
                setTimeout(() => {
                  onLivenessSuccess(blob, url, offscreenCanvas);
                }, 400);
              });

              return;
            } else if (isBlinking) {
              setStatus('blinking');
              setStatusMessage(t('verification.liveness.blinkDetected'));
            } else {
              setStatus('ready');
              setStatusMessage(t('verification.liveness.instruction'));
            }
          }
        }
      }

      if (!isFinishedRef.current) {
        animFrameIdRef.current = requestAnimationFrame(processFrame);
      }
    };

    animFrameIdRef.current = requestAnimationFrame(processFrame);

    return () => {
      stopCamera();
    };
  }, [modelReady, startCamera, stopCamera, captureSnapshot, onLivenessSuccess, t]);

  return (
    <div className="camera-container">
      <div className="panel-title-area">
        <h3>{t('verification.liveness.title')}</h3>
        <p>{t('verification.liveness.description')}</p>
      </div>

      <div className="camera-viewport">
        <video
          ref={videoRef}
          className="camera-video"
          playsInline
          muted
          autoPlay
          style={{ transform: 'scaleX(-1)' }}
        />

        {/* Face Alignment Oval Guide */}
        <div className={`camera-overlay ${status}`}>
          <div className="face-oval" />
        </div>

        {/* Status Pill Inside Viewport */}
        <div className="camera-status-pill">
          {status === 'ready' && <Camera size={14} />}
          {status === 'blinking' && <RefreshCw size={14} className="spinner" />}
          {status === 'blink_detected' && <Check size={14} strokeWidth={3} />}
          {(status === 'no_face' || status === 'multiple_faces') && <AlertCircle size={14} />}
          {(status === 'permission_denied' || status === 'camera_unavailable' || status === 'failed') && (
            <AlertCircle size={14} />
          )}
          <span>{statusMessage}</span>
        </div>
      </div>

      {/* Telemetry Bar */}
      <div className="camera-telemetry">
        <div className="telemetry-labels">
          <span>EAR: <strong>{currentEar.toFixed(2)}</strong></span>
          <span>Threshold: &lt; {earThreshold.toFixed(2)}</span>
        </div>
        <div className="telemetry-track">
          <div
            className="telemetry-bar-fill"
            style={{ width: `${Math.min(100, (currentEar / 0.4) * 100)}%` }}
          />
        </div>
      </div>

      {/* Camera Action Buttons */}
      <div className="form-actions-row space-between" style={{ marginTop: '0.75rem' }}>
        {onCancel && (
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            {t('verification.actions.cancel')}
          </button>
        )}
        {(status === 'permission_denied' || status === 'camera_unavailable') && (
          <button type="button" className="btn btn-primary" onClick={startCamera}>
            <RefreshCw size={14} /> {t('verification.actions.retry')}
          </button>
        )}
      </div>

      <div className="privacy-notice" style={{ marginTop: '0.5rem', marginBottom: 0 }}>
        <Shield size={14} style={{ flexShrink: 0, marginTop: '2px' }} />
        <span>Camera stream processed locally in browser. No biometric video is ever recorded or uploaded.</span>
      </div>
    </div>
  );
};
