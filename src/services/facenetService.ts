import * as ort from 'onnxruntime-web';
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { FaceNetResult } from '../types/verification';

// Configure onnxruntime-web WASM backend paths before any session creation
if (typeof window !== 'undefined' || (typeof location !== 'undefined' && location.protocol?.startsWith('http'))) {
  ort.env.wasm.wasmPaths = {
    wasm: '/wasm/ort-wasm-simd-threaded.jsep.wasm',
  };
}
ort.env.wasm.numThreads = 1;
ort.env.wasm.simd = true;

/**
 * Standard threshold for FaceNet L2-normalized Euclidean distance.
 * Typically 0.80 - 0.90 for Inception-ResNet-v1.
 * Values below threshold are the SAME person.
 * Values at or above threshold are DIFFERENT people.
 */
export const FACENET_CONFIG = {
  modelPath: '/models/facenet.onnx',
  inputWidth: 160,
  inputHeight: 160,
  distanceThreshold: 0.85, // Euclidean distance threshold
};

let faceNetSession: ort.InferenceSession | null = null;
let sessionLoadingPromise: Promise<ort.InferenceSession> | null = null;

let faceLandmarkerInstance: FaceLandmarker | null = null;
let landmarkerLoadingPromise: Promise<FaceLandmarker> | null = null;

/**
 * Initializes or retrieves the singleton FaceNet ONNX inference session.
 */
export async function getFaceNetSession(): Promise<ort.InferenceSession> {
  if (faceNetSession) return faceNetSession;
  if (sessionLoadingPromise) return sessionLoadingPromise;

  sessionLoadingPromise = (async () => {
    // Configure wasm paths for onnxruntime-web explicitly before session creation
    if (typeof window !== 'undefined' || (typeof location !== 'undefined' && location.protocol?.startsWith('http'))) {
      ort.env.wasm.wasmPaths = {
        wasm: '/wasm/ort-wasm-simd-threaded.jsep.wasm',
      };
    }
    ort.env.wasm.numThreads = 1;
    ort.env.wasm.simd = true;

    // Load actual FaceNet Inception-ResNet-v1 model
    const session = await ort.InferenceSession.create(FACENET_CONFIG.modelPath, {
      executionProviders: ['wasm'],
    });

    faceNetSession = session;
    return session;
  })();

  return sessionLoadingPromise;
}

/**
 * Initializes or retrieves the singleton MediaPipe Face detector for alignment.
 */
export async function getFaceDetector(): Promise<FaceLandmarker> {
  if (faceLandmarkerInstance) return faceLandmarkerInstance;
  if (landmarkerLoadingPromise) return landmarkerLoadingPromise;

  landmarkerLoadingPromise = (async () => {
    const vision = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
    );

    const landmarker = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath:
          'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
        delegate: 'GPU',
      },
      outputFaceBlendshapes: false,
      outputFacialTransformationMatrixes: false,
      runningMode: 'IMAGE',
      numFaces: 3, // Detect multiple faces to reject
    });

    faceLandmarkerInstance = landmarker;
    return landmarker;
  })();

  return landmarkerLoadingPromise;
}

/**
 * Normalizes an embedding vector using L2 norm.
 */
export function l2Normalize(vector: Float32Array): Float32Array {
  let sumSq = 0;
  for (let i = 0; i < vector.length; i++) {
    sumSq += vector[i] * vector[i];
  }
  const norm = Math.sqrt(sumSq) || 1e-10;
  const normalized = new Float32Array(vector.length);
  for (let i = 0; i < vector.length; i++) {
    normalized[i] = vector[i] / norm;
  }
  return normalized;
}

/**
 * Calculates Euclidean distance between two L2-normalized embeddings.
 */
export function calculateEuclideanDistance(
  embeddingA: Float32Array,
  embeddingB: Float32Array
): number {
  if (embeddingA.length !== embeddingB.length) {
    throw new Error('Embeddings must have identical dimensions');
  }

  let sum = 0;
  for (let i = 0; i < embeddingA.length; i++) {
    const diff = embeddingA[i] - embeddingB[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

/**
 * Aligns and crops a face from an image/canvas to a 160x160 Float32Array tensor.
 * Applies FaceNet standard standardization: (pixel / 255.0 - 0.5) / 0.5
 * Transposes to NCHW shape: [1, 3, 160, 160].
 */
export function preprocessFaceCrop(
  source: HTMLImageElement | HTMLCanvasElement,
  boundingBox: { x: number; y: number; width: number; height: number }
): ort.Tensor {
  const cropCanvas = document.createElement('canvas');
  cropCanvas.width = FACENET_CONFIG.inputWidth;
  cropCanvas.height = FACENET_CONFIG.inputHeight;
  const ctx = cropCanvas.getContext('2d');
  if (!ctx) throw new Error('Could not create offscreen canvas context');

  // Add 15% margin around the detected face bounding box
  const marginX = boundingBox.width * 0.15;
  const marginY = boundingBox.height * 0.15;

  const srcWidth = source instanceof HTMLImageElement ? source.naturalWidth : source.width;
  const srcHeight = source instanceof HTMLImageElement ? source.naturalHeight : source.height;

  const sx = Math.max(0, boundingBox.x - marginX);
  const sy = Math.max(0, boundingBox.y - marginY);
  const sw = Math.min(srcWidth - sx, boundingBox.width + 2 * marginX);
  const sh = Math.min(srcHeight - sy, boundingBox.height + 2 * marginY);

  ctx.drawImage(
    source,
    sx,
    sy,
    sw,
    sh,
    0,
    0,
    FACENET_CONFIG.inputWidth,
    FACENET_CONFIG.inputHeight
  );

  const imgData = ctx.getImageData(0, 0, FACENET_CONFIG.inputWidth, FACENET_CONFIG.inputHeight);
  const { data } = imgData;

  const channelSize = FACENET_CONFIG.inputWidth * FACENET_CONFIG.inputHeight;
  const tensorData = new Float32Array(3 * channelSize);

  // Standardize pixels: (val / 255.0 - 0.5) / 0.5 and layout as [1, 3, 160, 160] (NCHW)
  for (let i = 0; i < channelSize; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];

    tensorData[i] = (r / 255.0 - 0.5) / 0.5; // Red channel
    tensorData[channelSize + i] = (g / 255.0 - 0.5) / 0.5; // Green channel
    tensorData[2 * channelSize + i] = (b / 255.0 - 0.5) / 0.5; // Blue channel
  }

  return new ort.Tensor('float32', tensorData, [1, 3, FACENET_CONFIG.inputHeight, FACENET_CONFIG.inputWidth]);
}

/**
 * Computes bounding box from MediaPipe face landmarks.
 */
function getLandmarksBoundingBox(
  landmarks: { x: number; y: number }[],
  imgWidth: number,
  imgHeight: number
): { x: number; y: number; width: number; height: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const pt of landmarks) {
    const px = pt.x * imgWidth;
    const py = pt.y * imgHeight;
    if (px < minX) minX = px;
    if (px > maxX) maxX = px;
    if (py < minY) minY = py;
    if (py > maxY) maxY = py;
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

/**
 * Extracts a 512-dimensional FaceNet embedding from an aligned face image.
 */
export async function extractFaceNetEmbedding(
  source: HTMLImageElement | HTMLCanvasElement,
  session: ort.InferenceSession,
  detector: FaceLandmarker
): Promise<{ embedding: Float32Array | null; faceCount: number; error?: string }> {
  const result = detector.detect(source);
  const faceCount = result.faceLandmarks.length;

  if (faceCount === 0) {
    return { embedding: null, faceCount: 0, error: 'No face detected.' };
  }

  if (faceCount > 1) {
    return { embedding: null, faceCount, error: 'Multiple faces detected.' };
  }

  const srcWidth = source instanceof HTMLImageElement ? source.naturalWidth : source.width;
  const srcHeight = source instanceof HTMLImageElement ? source.naturalHeight : source.height;

  const bbox = getLandmarksBoundingBox(result.faceLandmarks[0], srcWidth, srcHeight);
  const inputTensor = preprocessFaceCrop(source, bbox);

  const outputs = await session.run({ input: inputTensor });
  const rawEmbedding = outputs.embedding.data as Float32Array;

  const normalized = l2Normalize(rawEmbedding);
  return { embedding: normalized, faceCount: 1 };
}

/**
 * Compares an Identity Photo against a Live Camera Snapshot using ACTUAL FaceNet inference.
 *
 * Enforces:
 * - Exactly one face in both images
 * - Real Inception-ResNet-v1 inference
 * - 512-dimensional normalized embeddings
 * - Euclidean distance metric against configured threshold
 */
export async function verifyFacesWithFaceNet(
  idImage: HTMLImageElement,
  liveImage: HTMLCanvasElement | HTMLImageElement
): Promise<FaceNetResult> {
  const threshold = FACENET_CONFIG.distanceThreshold;

  try {
    const [session, detector] = await Promise.all([
      getFaceNetSession(),
      getFaceDetector(),
    ]);

    // 1. Process Identity Photo
    const idRes = await extractFaceNetEmbedding(idImage, session, detector);
    if (idRes.faceCount === 0) {
      return {
        matched: false,
        distance: 2.0,
        method: 'FaceNet',
        threshold,
        message: 'No face detected in the identity photo. Please upload a clear photo with a single visible face.',
        liveFaceDetected: false,
        idFaceDetected: false,
        faceCountA: 0,
        faceCountB: 0,
      };
    }
    if (idRes.faceCount > 1) {
      return {
        matched: false,
        distance: 2.0,
        method: 'FaceNet',
        threshold,
        message: 'Multiple faces detected in the identity photo. Only one person is allowed.',
        liveFaceDetected: false,
        idFaceDetected: true,
        faceCountA: idRes.faceCount,
        faceCountB: 0,
      };
    }

    // 2. Process Live Snapshot
    const liveRes = await extractFaceNetEmbedding(liveImage, session, detector);
    if (liveRes.faceCount === 0) {
      return {
        matched: false,
        distance: 2.0,
        method: 'FaceNet',
        threshold,
        message: 'No face detected in the live camera snapshot.',
        liveFaceDetected: false,
        idFaceDetected: true,
        faceCountA: idRes.faceCount,
        faceCountB: 0,
      };
    }
    if (liveRes.faceCount > 1) {
      return {
        matched: false,
        distance: 2.0,
        method: 'FaceNet',
        threshold,
        message: 'Multiple faces detected in the live camera snapshot.',
        liveFaceDetected: true,
        idFaceDetected: true,
        faceCountA: idRes.faceCount,
        faceCountB: liveRes.faceCount,
      };
    }

    if (!idRes.embedding || !liveRes.embedding) {
      return {
        matched: false,
        distance: 2.0,
        method: 'FaceNet',
        threshold,
        message: 'FaceNet embedding extraction failed.',
        liveFaceDetected: true,
        idFaceDetected: true,
        faceCountA: idRes.faceCount,
        faceCountB: liveRes.faceCount,
      };
    }

    // 3. Compute FaceNet Euclidean Distance
    const distance = calculateEuclideanDistance(idRes.embedding, liveRes.embedding);
    const matched = distance < threshold;

    return {
      matched,
      distance: Number(distance.toFixed(4)),
      method: 'FaceNet',
      threshold,
      message: matched ? 'Face matched.' : 'Face does not match the identity photo.',
      liveFaceDetected: true,
      idFaceDetected: true,
      faceCountA: 1,
      faceCountB: 1,
    };
  } catch (err: unknown) {
    const error = err as Error;
    // CRITICAL: Inference failure must NEVER be returned as a fake distance (like 2.0)
    // or interpreted as "Face does not match". Throw explicit inference error.
    throw new Error(`FaceNet inference error: ${error.message}`);
  }
}
