import * as ort from 'onnxruntime-web';
import fs from 'fs';
import path from 'path';

async function runDiagnostic() {
  console.log('====================================================');
  console.log('FaceNet ONNX Runtime WASM Diagnostic Test');
  console.log('====================================================');

  // 1. Configure WASM environment
  if (typeof window !== 'undefined') {
    ort.env.wasm.wasmPaths = {
      wasm: '/wasm/ort-wasm-simd-threaded.jsep.wasm',
    };
  }
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.simd = true;
  console.log('1. WASM environment configured:');
  console.log('   wasmPaths (Browser): { wasm: "/wasm/ort-wasm-simd-threaded.jsep.wasm" } | (Node): default runtime loader');
  console.log('   numThreads:', ort.env.wasm.numThreads);
  console.log('   simd:', ort.env.wasm.simd);

  // 2. Locate model file
  const modelPath = path.resolve(process.cwd(), 'public/models/facenet.onnx');
  if (!fs.existsSync(modelPath)) {
    throw new Error(`FaceNet model not found at: ${modelPath}`);
  }
  const modelBytes = fs.statSync(modelPath).size;
  console.log(`2. FaceNet model located: ${modelPath} (${(modelBytes / 1024 / 1024).toFixed(2)} MB)`);

  // 3. Initialize ONNX Runtime Session
  console.log('3. Initializing ONNX Runtime InferenceSession...');
  const startTime = Date.now();
  const session = await ort.InferenceSession.create(modelPath, {
    executionProviders: ['wasm'],
  });
  const initDuration = Date.now() - startTime;
  console.log(`✓ Session initialized successfully in ${initDuration}ms`);
  console.log('   Input names:', session.inputNames);
  console.log('   Output names:', session.outputNames);

  // 4. Create a valid 1x3x160x160 test face tensor
  console.log('4. Creating 1x3x160x160 test tensor...');
  const tensorSize = 1 * 3 * 160 * 160;
  const dummyData = new Float32Array(tensorSize);
  // Fill with simulated normalized pixel values [-1.0, 1.0]
  for (let i = 0; i < tensorSize; i++) {
    dummyData[i] = Math.sin(i * 0.01);
  }
  const inputTensor = new ort.Tensor('float32', dummyData, [1, 3, 160, 160]);

  // 5. Run actual inference
  console.log('5. Running actual FaceNet model inference...');
  const inferStartTime = Date.now();
  const results = await session.run({ input: inputTensor });
  const inferDuration = Date.now() - inferStartTime;
  console.log(`✓ Inference executed in ${inferDuration}ms`);

  // 6. Validate output embedding
  const embedding = results.embedding?.data as Float32Array;
  if (!embedding) {
    throw new Error('Inference output did not contain "embedding" tensor.');
  }
  console.log('6. Validating embedding output:');
  console.log('   Embedding dimensions:', embedding.length, '(Expected: 512)');
  if (embedding.length !== 512) {
    throw new Error(`Expected 512 embedding dimensions, got: ${embedding.length}`);
  }

  // Calculate L2 norm
  let sumSq = 0;
  for (let i = 0; i < embedding.length; i++) {
    sumSq += embedding[i] * embedding[i];
  }
  const norm = Math.sqrt(sumSq);
  console.log('   Raw embedding L2 norm:', norm.toFixed(4));
  console.log('   First 5 embedding values:', Array.from(embedding.subarray(0, 5)).map(v => v.toFixed(4)).join(', '));

  // 7. Verify error propagation (Requirement 8)
  console.log('7. Verifying that inference failures throw explicit error (no fake distance 2.0)...');
  try {
    const invalidTensor = new ort.Tensor('float32', new Float32Array(10), [1, 10]);
    await session.run({ input: invalidTensor });
    throw new Error('Invalid tensor should have caused session.run to throw!');
  } catch (err: unknown) {
    const error = err as Error;
    if (error.message.includes('Invalid tensor')) {
      throw error;
    }
    console.log(`✓ Invalid inference correctly rejected with error: ${error.message.substring(0, 70)}...`);
  }

  console.log('====================================================');
  console.log('DIAGNOSTIC PASSED: WASM Backend & FaceNet Inference Working');
  console.log('====================================================');
}

runDiagnostic().catch((err) => {
  console.error('Diagnostic failed:', err);
  process.exit(1);
});
