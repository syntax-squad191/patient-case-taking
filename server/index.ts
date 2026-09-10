import express, { Request, Response } from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { compareFaceTensors, getInferenceSession } from './facenet/inference';
import { handleDoctorVerification } from './nmc/controller';

// Load .env.local and .env if present
const envFiles = ['.env.local', '.env'];
for (const file of envFiles) {
  const filePath = path.resolve(process.cwd(), file);
  if (fs.existsSync(filePath)) {
    const lines = fs.readFileSync(filePath, 'utf-8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
        const [key, ...rest] = trimmed.split('=');
        const val = rest.join('=').trim();
        if (key.trim() && !(key.trim() in process.env)) {
          process.env[key.trim()] = val;
        }
      }
    }
  }
}

const app = express();
const PORT = process.env.PORT || 5001;

app.use(cors());
app.use(express.json({ limit: '25mb' }));

app.get('/api/health', async (_req: Request, res: Response) => {
  try {
    const session = await getInferenceSession();
    res.json({
      status: 'ok',
      facenetLoaded: !!session,
      model: 'FaceNet Inception-ResNet-v1 (512-d ONNX)',
      sandboxEnabled: process.env.VITE_ENABLE_NMC_SANDBOX === 'true',
    });
  } catch (err: unknown) {
    const error = err as Error;
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// FaceNet Comparison Endpoint
app.post('/api/facenet/compare', async (req: Request, res: Response) => {
  try {
    const { tensorA, tensorB } = req.body;

    if (!tensorA || !tensorB) {
      return res.status(400).json({
        error: 'Both tensorA and tensorB are required (1x3x160x160 Float32Array arrays).',
      });
    }

    const arrA = new Float32Array(tensorA);
    const arrB = new Float32Array(tensorB);

    if (arrA.length !== 160 * 160 * 3 || arrB.length !== 160 * 160 * 3) {
      return res.status(400).json({
        error: `Expected tensor length ${160 * 160 * 3}, got ${arrA.length} and ${arrB.length}`,
      });
    }

    const result = await compareFaceTensors(arrA, arrB);
    res.json(result);
  } catch (err: unknown) {
    const error = err as Error;
    res.status(500).json({
      error: `FaceNet inference error: ${error.message}`,
      matched: false,
    });
  }
});

// Doctor Registration Verification Endpoint
app.post('/api/nmc/verify', async (req: Request, res: Response) => {
  try {
    const { registrationNumber, fullName, medicalCouncil } = req.body;
    const result = await handleDoctorVerification({
      registrationNumber,
      fullName,
      medicalCouncil,
    });
    res.json(result);
  } catch {
    res.status(500).json({
      verified: false,
      status: 'unavailable',
      source: 'NMC',
      message: "Verification isn't available right now. Please try again later.",
    });
  }
});

app.listen(PORT, () => {
  console.log(`[PRAKRITI Backend] Server running on http://localhost:${PORT}`);
  console.log(`[PRAKRITI Backend] Sandbox mode: ${process.env.VITE_ENABLE_NMC_SANDBOX === 'true' ? 'ENABLED' : 'DISABLED'}`);
});
