import fs from 'fs';
import path from 'path';

const srcDir = path.resolve(process.cwd(), 'node_modules/onnxruntime-web/dist');
const targetDir = path.resolve(process.cwd(), 'public/wasm');

fs.mkdirSync(targetDir, { recursive: true });

const filesToCopy = [
  'ort-wasm-simd-threaded.wasm',
  'ort-wasm-simd-threaded.jsep.wasm',
  'ort-wasm-simd-threaded.asyncify.wasm',
  'ort-wasm-simd-threaded.jspi.wasm',
];

for (const file of filesToCopy) {
  const src = path.join(srcDir, file);
  const destWasm = path.join(targetDir, file);
  const destRoot = path.join(process.cwd(), 'public', file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, destWasm);
    fs.copyFileSync(src, destRoot);
    console.log(`Copied ${file} -> public/wasm/${file} and public/${file} (${fs.statSync(destWasm).size} bytes)`);
  } else {
    console.warn(`Source file not found: ${src}`);
  }
}

console.log('✓ All onnxruntime-web wasm files copied successfully.');
