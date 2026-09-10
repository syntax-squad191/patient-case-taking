import fs from 'fs';
import https from 'https';
import path from 'path';

const MODEL_URL = 'https://huggingface.co/haikalmumtaz/facenet-onnx/resolve/main/facenet.onnx';
const TARGET_PATH = path.resolve(process.cwd(), 'public/models/facenet.onnx');
const SERVER_PATH = path.resolve(process.cwd(), 'server/models/facenet.onnx');

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(dest), { recursive: true });

    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadFile(res.headers.location, dest).then(resolve).catch(reject);
      }

      if (res.statusCode !== 200) {
        return reject(new Error(`Failed to download: status ${res.statusCode}`));
      }

      const fileStream = fs.createWriteStream(dest);
      res.pipe(fileStream);

      fileStream.on('finish', () => {
        fileStream.close();
        resolve();
      });
    }).on('error', reject);
  });
}

async function main() {
  if (fs.existsSync(TARGET_PATH) && fs.statSync(TARGET_PATH).size > 80000000) {
    console.log('✓ FaceNet model already downloaded at:', TARGET_PATH);
    if (!fs.existsSync(SERVER_PATH)) {
      fs.copyFileSync(TARGET_PATH, SERVER_PATH);
    }
    return;
  }

  console.log('Downloading FaceNet Inception-ResNet-v1 ONNX model (~90MB)...');
  await downloadFile(MODEL_URL, TARGET_PATH);
  fs.copyFileSync(TARGET_PATH, SERVER_PATH);
  console.log('✓ FaceNet model downloaded successfully.');
}

main().catch(err => {
  console.error('Error downloading FaceNet model:', err);
  process.exit(1);
});
