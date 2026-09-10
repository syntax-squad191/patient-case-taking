import * as ort from 'onnxruntime-web';
import fs from 'fs';
import path from 'path';

const MODEL_PATH = path.resolve(__dirname, '../models/facenet.onnx');
export const FACENET_THRESHOLD = 0.85;

let session: ort.InferenceSession | null = null;

export async function getInferenceSession(): Promise<ort.InferenceSession> {
  if (session) return session;

  if (!fs.existsSync(MODEL_PATH)) {
    throw new Error(`FaceNet model file not found at ${MODEL_PATH}`);
  }

  const modelBuffer = fs.readFileSync(MODEL_PATH);
  session = await ort.InferenceSession.create(modelBuffer);
  return session;
}

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

export function euclideanDistance(a: Float32Array, b: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

/**
 * Runs actual FaceNet inference on a preprocessed 1x3x160x160 tensor.
 */
export async function runFaceNetInference(tensorData: Float32Array): Promise<Float32Array> {
  const sess = await getInferenceSession();
  const tensor = new ort.Tensor('float32', tensorData, [1, 3, 160, 160]);
  const results = await sess.run({ input: tensor });
  const rawEmb = results.embedding.data as Float32Array;
  return l2Normalize(rawEmb);
}

/**
 * Compares two 1x3x160x160 face tensors using FaceNet.
 */
export async function compareFaceTensors(
  tensorA: Float32Array,
  tensorB: Float32Array
): Promise<{ matched: boolean; distance: number; method: 'FaceNet'; threshold: number }> {
  const embA = await runFaceNetInference(tensorA);
  const embB = await runFaceNetInference(tensorB);

  const distance = euclideanDistance(embA, embB);
  return {
    matched: distance < FACENET_THRESHOLD,
    distance: Number(distance.toFixed(4)),
    method: 'FaceNet',
    threshold: FACENET_THRESHOLD,
  };
}
