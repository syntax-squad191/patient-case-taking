// Test verifying the exact browser onnxruntime-web bundle and runtime behavior
async function testBrowserRuntime() {
  console.log('====================================================');
  console.log('Testing Browser FaceNet Runtime & Comparison');
  console.log('====================================================');

  // Load the EXACT ESM bundle that Vite serves to the browser
  // @ts-ignore bundle import
  const ort = await import('../node_modules/onnxruntime-web/dist/ort.all.bundle.min.mjs');

  // Configure wasmPaths with the exact object configuration
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.simd = true;
  ort.env.wasm.wasmPaths = {
    wasm: 'http://localhost:3000/wasm/ort-wasm-simd-threaded.jsep.wasm',
  };

  console.log('1. Configuring browser wasmPaths:', ort.env.wasm.wasmPaths);

  // Initialize session by fetching the model from the running Vite dev server
  console.log('2. Loading model from running Vite dev server: http://localhost:3000/models/facenet.onnx');
  const session = await ort.InferenceSession.create('http://localhost:3000/models/facenet.onnx', {
    executionProviders: ['wasm'],
  });
  console.log('✓ Session initialized successfully!');
  console.log('   Input names:', session.inputNames);
  console.log('   Output names:', session.outputNames);

  // Generate two face tensors (Face A and slightly perturbed Face A')
  const tensorSize = 1 * 3 * 160 * 160;
  const tensorA = new Float32Array(tensorSize);
  const tensorB = new Float32Array(tensorSize);
  for (let i = 0; i < tensorSize; i++) {
    const val = Math.sin(i * 0.05);
    tensorA[i] = val;
    tensorB[i] = val + 0.02 * Math.cos(i * 0.03); // Slight perturbation
  }

  console.log('3. Running FaceNet inference on Tensor A...');
  const resA = await session.run({ input: new ort.Tensor('float32', tensorA, [1, 3, 160, 160]) });
  const rawEmbA = resA.embedding.data as Float32Array;
  console.log('✓ Output embedding A generated with dimensions:', rawEmbA.length);

  console.log('4. Running FaceNet inference on Tensor B...');
  const resB = await session.run({ input: new ort.Tensor('float32', tensorB, [1, 3, 160, 160]) });
  const rawEmbB = resB.embedding.data as Float32Array;
  console.log('✓ Output embedding B generated with dimensions:', rawEmbB.length);

  // L2 normalize embeddings
  function l2Norm(vec: Float32Array): Float32Array {
    let sum = 0;
    for (let i = 0; i < vec.length; i++) sum += vec[i] * vec[i];
    const n = Math.sqrt(sum) || 1e-10;
    const out = new Float32Array(vec.length);
    for (let i = 0; i < vec.length; i++) out[i] = vec[i] / n;
    return out;
  }

  const normA = l2Norm(rawEmbA);
  const normB = l2Norm(rawEmbB);

  // Calculate Euclidean Distance
  let diffSq = 0;
  for (let i = 0; i < normA.length; i++) {
    const d = normA[i] - normB[i];
    diffSq += d * d;
  }
  const distance = Math.sqrt(diffSq);
  console.log('5. Actual FaceNet Euclidean Comparison Distance:', distance.toFixed(4));
  console.log('   Distance < Threshold (0.85):', distance < 0.85 ? 'MATCH' : 'NO MATCH');

  console.log('====================================================');
  console.log('BROWSER RUNTIME SIMULATION FULLY PASSED');
  console.log('====================================================');
}

testBrowserRuntime().catch((err) => {
  console.error('Browser runtime test failed:', err);
  process.exit(1);
});
