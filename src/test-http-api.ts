import express from 'express';
import { handleDoctorVerification } from '../server/nmc/controller';
import http from 'http';

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(`[HTTP TEST FAILED] ${msg}`);
}

async function runHttpTests() {
  console.log('====================================================');
  console.log('Testing Real HTTP Endpoint: POST /api/nmc/verify');
  console.log('====================================================\n');

  const app = express();
  app.use(express.json());
  app.post('/api/nmc/verify', async (req, res) => {
    try {
      const result = await handleDoctorVerification(req.body);
      res.json(result);
    } catch {
      res.status(500).json({ status: 'unavailable', message: "Verification isn't available right now. Please try again later." });
    }
  });

  const TEST_PORT = 5099;
  const server = http.createServer(app);

  await new Promise<void>((resolve) => server.listen(TEST_PORT, () => resolve()));
  console.log(`Test HTTP server started on http://localhost:${TEST_PORT}\n`);

  async function postVerify(body: Record<string, string>) {
    const res = await fetch(`http://localhost:${TEST_PORT}/api/nmc/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return res.json();
  }

  // --- SCENARIO 1: Sandbox Mode ENABLED (ENABLE_NMC_SANDBOX=true) ---
  console.log('--- SCENARIO 1: ENABLE_NMC_SANDBOX=true ---');
  process.env.ENABLE_NMC_SANDBOX = 'true';
  process.env.VITE_ENABLE_NMC_SANDBOX = 'true';

  const startTime = Date.now();
  const res1 = await postVerify({
    fullName: 'Priyansh V Shah',
    registrationNumber: '48217',
    medicalCouncil: 'SANDBOX TEST COUNCIL',
  });
  const duration = Date.now() - startTime;

  console.log('HTTP Response 1:', JSON.stringify(res1, null, 2));
  assert(res1.verified === true, 'res1.verified must be true');
  assert(res1.status === 'verified', 'res1.status must be "verified"');
  assert(res1.source === 'SANDBOX', 'res1.source must be "SANDBOX"');
  assert(
    res1.message === 'Demo verification only. This is not an NMC registry result.',
    `res1.message mismatch: ${res1.message}`
  );
  // Real NMC registry takes >= 6000ms timeout. Sandbox returns immediately without network timeout.
  assert(duration < 2000, `Sandbox response should be fast (<2000ms), took ${duration}ms`);
  console.log(`✓ Test 1 Passed: Exact sandbox record verified via HTTP in ${duration}ms (Real NMC bypassed).\n`);

  // Wrong reg number
  const res2 = await postVerify({
    fullName: 'Priyansh V Shah',
    registrationNumber: '12345',
    medicalCouncil: 'SANDBOX TEST COUNCIL',
  });
  console.log('HTTP Response 2 (Wrong Reg):', JSON.stringify(res2, null, 2));
  assert(res2.verified === false && res2.status === 'rejected', 'Wrong reg must reject');
  assert(res2.source === 'SANDBOX', 'Source must remain SANDBOX in sandbox mode');
  console.log('✓ Test 2 Passed: Wrong registration number rejected.\n');

  // Wrong doctor name
  const res3 = await postVerify({
    fullName: 'Wrong Doctor Name',
    registrationNumber: '48217',
    medicalCouncil: 'SANDBOX TEST COUNCIL',
  });
  assert(res3.verified === false && res3.status === 'rejected', 'Wrong name must reject');
  console.log('✓ Test 3 Passed: Wrong doctor name rejected.\n');

  // Wrong medical council
  const res4 = await postVerify({
    fullName: 'Priyansh V Shah',
    registrationNumber: '48217',
    medicalCouncil: 'Wrong Medical Council',
  });
  assert(res4.verified === false && res4.status === 'rejected', 'Wrong council must reject');
  console.log('✓ Test 4 Passed: Wrong medical council rejected.\n');

  // --- SCENARIO 2: Sandbox Mode DISABLED (ENABLE_NMC_SANDBOX=false) ---
  console.log('--- SCENARIO 2: ENABLE_NMC_SANDBOX=false (Real NMC Mode) ---');
  process.env.ENABLE_NMC_SANDBOX = 'false';
  process.env.VITE_ENABLE_NMC_SANDBOX = 'false';

  const res5 = await postVerify({
    fullName: 'Priyansh V Shah',
    registrationNumber: '48217',
    medicalCouncil: 'SANDBOX TEST COUNCIL',
  });

  console.log('HTTP Response 5 (Real NMC Mode with Sandbox Record):', JSON.stringify(res5, null, 2));
  assert(res5.source === 'NMC', 'When sandbox disabled, source must be "NMC"');
  assert(res5.verified === false, 'Sandbox doctor must NOT be verified when sandbox is disabled');
  assert(res5.status === 'unavailable', 'External registry failure must return status="unavailable"');
  assert(
    res5.message === "Verification isn't available right now. Please try again later.",
    'Must return exact unavailable message'
  );
  console.log('✓ Test 5 Passed: Real NMC path is used when sandbox disabled, returns unavailable without sandbox fallback.\n');

  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });

  console.log('====================================================');
  console.log('ALL REAL HTTP ENDPOINT TESTS PASSED SUCCESSFULLY');
  console.log('====================================================');
}

runHttpTests().catch((err) => {
  console.error('HTTP tests failed:', err);
  process.exit(1);
});
