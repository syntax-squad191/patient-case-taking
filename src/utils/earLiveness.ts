/**
 * Port of Eye-Blink-Detection-using-MediaPipe-and-OpenCV
 * Reference: https://github.com/Pushtogithub23/Eye-Blink-Detection-using-MediaPipe-and-OpenCV
 * 
 * Adapted for browser TypeScript with MediaPipe Face Landmark indices.
 * Attribution: Based on Sourav (Pushtogithub23) EAR methodology.
 */

export interface Point2D {
  x: number;
  y: number;
  z?: number;
}

/**
 * Exact MediaPipe landmark indices from the reference implementation:
 * RIGHT EYE: 33, 159, 158, 133, 153, 145
 * LEFT EYE:  362, 380, 374, 263, 386, 385
 */
export const RIGHT_EYE_LANDMARKS = {
  h1: 33,
  h2: 133,
  v1_top: 159,
  v1_bottom: 145,
  v2_top: 158,
  v2_bottom: 153,
} as const;

export const LEFT_EYE_LANDMARKS = {
  h1: 362,
  h2: 263,
  v1_top: 385,
  v1_bottom: 380,
  v2_top: 386,
  v2_bottom: 374,
} as const;

/**
 * Default calibrated EAR parameters
 */
export const DEFAULT_EAR_CONFIG = {
  threshold: 0.22,
  consecutiveFrames: 2,
};

/**
 * Calculates 2D Euclidean distance between two landmark coordinates.
 */
export function euclideanDistance(p1: Point2D, p2: Point2D): number {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Calculates Eye Aspect Ratio (EAR) for a single eye given its 6 landmarks:
 * EAR = (vertical distance 1 + vertical distance 2) / (2.0 * horizontal distance)
 */
export function calculateEyeEAR(
  h1: Point2D,
  h2: Point2D,
  v1Top: Point2D,
  v1Bottom: Point2D,
  v2Top: Point2D,
  v2Bottom: Point2D
): number {
  const horizontalDist = euclideanDistance(h1, h2);
  if (horizontalDist <= 0.00001) return 0;

  const verticalDist1 = euclideanDistance(v1Top, v1Bottom);
  const verticalDist2 = euclideanDistance(v2Top, v2Bottom);

  return (verticalDist1 + verticalDist2) / (2.0 * horizontalDist);
}

/**
 * Calculates EAR for both eyes from MediaPipe face landmarks array (468/478 points).
 */
export function calculateFaceEAR(landmarks: Point2D[]): {
  rightEAR: number;
  leftEAR: number;
  avgEAR: number;
} {
  if (!landmarks || landmarks.length < 468) {
    return { rightEAR: 0, leftEAR: 0, avgEAR: 0 };
  }

  // Right Eye
  const rH1 = landmarks[RIGHT_EYE_LANDMARKS.h1];
  const rH2 = landmarks[RIGHT_EYE_LANDMARKS.h2];
  const rV1Top = landmarks[RIGHT_EYE_LANDMARKS.v1_top];
  const rV1Bottom = landmarks[RIGHT_EYE_LANDMARKS.v1_bottom];
  const rV2Top = landmarks[RIGHT_EYE_LANDMARKS.v2_top];
  const rV2Bottom = landmarks[RIGHT_EYE_LANDMARKS.v2_bottom];

  const rightEAR = calculateEyeEAR(rH1, rH2, rV1Top, rV1Bottom, rV2Top, rV2Bottom);

  // Left Eye
  const lH1 = landmarks[LEFT_EYE_LANDMARKS.h1];
  const lH2 = landmarks[LEFT_EYE_LANDMARKS.h2];
  const lV1Top = landmarks[LEFT_EYE_LANDMARKS.v1_top];
  const lV1Bottom = landmarks[LEFT_EYE_LANDMARKS.v1_bottom];
  const lV2Top = landmarks[LEFT_EYE_LANDMARKS.v2_top];
  const lV2Bottom = landmarks[LEFT_EYE_LANDMARKS.v2_bottom];

  const leftEAR = calculateEyeEAR(lH1, lH2, lV1Top, lV1Bottom, lV2Top, lV2Bottom);

  const avgEAR = (rightEAR + leftEAR) / 2.0;

  return { rightEAR, leftEAR, avgEAR };
}

/**
 * State tracker to detect a genuine eye blink.
 * Confirmed when EAR falls below threshold for required consecutive frames
 * and subsequently rises back above threshold.
 */
export class BlinkDetector {
  private consecutiveClosedFrames = 0;
  private blinkDetected = false;
  private readonly threshold: number;
  private readonly minClosedFrames: number;

  constructor(threshold = DEFAULT_EAR_CONFIG.threshold, minClosedFrames = DEFAULT_EAR_CONFIG.consecutiveFrames) {
    this.threshold = threshold;
    this.minClosedFrames = minClosedFrames;
  }

  /**
   * Process a frame's average EAR.
   * Returns true if a complete blink cycle was just concluded in this frame.
   */
  public processFrame(avgEAR: number): {
    isBlinking: boolean;
    blinkConfirmed: boolean;
    closedFrameCount: number;
  } {
    if (this.blinkDetected) {
      return { isBlinking: false, blinkConfirmed: true, closedFrameCount: this.consecutiveClosedFrames };
    }

    const isEyeClosed = avgEAR < this.threshold;

    if (isEyeClosed) {
      this.consecutiveClosedFrames++;
      return { isBlinking: true, blinkConfirmed: false, closedFrameCount: this.consecutiveClosedFrames };
    }

    // Eye is open: check if it just opened after sufficient closed frames
    if (this.consecutiveClosedFrames >= this.minClosedFrames) {
      this.blinkDetected = true;
      this.consecutiveClosedFrames = 0;
      return { isBlinking: false, blinkConfirmed: true, closedFrameCount: 0 };
    }

    // False blink / noise (e.g. 1 jitter frame)
    this.consecutiveClosedFrames = 0;
    return { isBlinking: false, blinkConfirmed: false, closedFrameCount: 0 };
  }

  public reset(): void {
    this.consecutiveClosedFrames = 0;
    this.blinkDetected = false;
  }

  public isConfirmed(): boolean {
    return this.blinkDetected;
  }
}
