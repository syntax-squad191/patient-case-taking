export type VerificationStep =
  | 'details'
  | 'photo'
  | 'liveness'
  | 'comparison'
  | 'result';

export type VerificationStatus =
  | 'pending'
  | 'verified'
  | 'rejected'
  | 'unavailable';

export type NMCStatus = 'verified' | 'rejected' | 'unavailable';

export interface NMCRecord {
  registrationNumber: string;
  doctorName: string;
  stateMedicalCouncil: string;
  yearOfRegistration?: string;
  qualification?: string;
}

export interface NMCVerificationResult {
  status: NMCStatus;
  registrationNumber: string;
  verifiedName?: string;
  medicalCouncil?: string;
  source: 'SANDBOX' | 'NMC';
  details?: NMCRecord;
  message: string;
  timestamp: string;
  isSandbox?: boolean;
}

export type LivenessStatus =
  | 'idle'
  | 'requesting_permission'
  | 'permission_denied'
  | 'ready'
  | 'no_face'
  | 'multiple_faces'
  | 'blinking'
  | 'blink_detected'
  | 'failed'
  | 'camera_unavailable';

export interface EARConfig {
  earThreshold: number; // typically 0.20 - 0.23
  consecutiveFrames: number; // consecutive frames below threshold to count as blink
}

/**
 * Standard output from actual FaceNet inference
 */
export interface FaceNetResult {
  matched: boolean;
  distance: number;
  method: 'FaceNet';
  threshold: number;
  message: string;
  liveFaceDetected: boolean;
  idFaceDetected: boolean;
  faceCountA: number;
  faceCountB: number;
}

export interface DoctorVerificationState {
  step: VerificationStep;
  fullName: string;
  registrationNumber: string;
  medicalCouncil: string;
  nmcResult: NMCVerificationResult | null;
  identityPhotoFile: File | null;
  identityPhotoUrl: string | null;
  liveSnapshotBlob: Blob | null;
  liveSnapshotUrl: string | null;
  livenessVerified: boolean;
  faceNetResult: FaceNetResult | null;
  finalStatus: VerificationStatus | null;
  verificationSource: 'NMC' | 'SANDBOX' | null;
  errorMessage: string | null;
  isProcessing: boolean;
}
