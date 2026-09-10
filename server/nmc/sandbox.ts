/**
 * PRAKRITI — Isolated NMC Sandbox Verification Service
 * 
 * STRICT COMPLIANCE RULES:
 * - Dedicated only to hackathon demo / sandbox mode
 * - Active ONLY when VITE_ENABLE_NMC_SANDBOX=true (or ENABLE_NMC_SANDBOX=true)
 * - Accepts ONLY the official demo doctor:
 *     Doctor: Priyansh V Shah
 *     Registration Number: 48217
 *     Medical Council: SANDBOX TEST COUNCIL
 * - Must match ALL THREE fields after safe normalization
 * - Explicitly identifies source as 'SANDBOX', never 'NMC'
 */

export interface SandboxDoctorQuery {
  registrationNumber: string;
  fullName: string;
  medicalCouncil: string;
}

export interface SandboxVerificationResponse {
  verified: boolean;
  status: 'verified' | 'rejected';
  source: 'SANDBOX';
  message: string;
  details?: {
    doctorName: string;
    registrationNumber: string;
    stateMedicalCouncil: string;
    qualification?: string;
  };
}

/**
 * Normalizes input text safely (case-insensitive, strips titles and excess whitespace).
 */
export function normalizeSandboxField(text: string): string {
  return (text || '')
    .toLowerCase()
    .replace(/^(dr\.?|doctor)\s+/i, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Performs isolated sandbox verification.
 * Strictly verifies only when:
 * 1. Name matches "Priyansh V Shah"
 * 2. Registration Number matches "48217"
 * 3. Medical Council matches "SANDBOX TEST COUNCIL"
 */
export function verifySandboxDoctor(
  query: SandboxDoctorQuery
): SandboxVerificationResponse {
  const normName = normalizeSandboxField(query.fullName);
  const normCouncil = normalizeSandboxField(query.medicalCouncil);
  const normReg = (query.registrationNumber || '').trim();

  const isNameMatch = normName === normalizeSandboxField('Priyansh V Shah');
  const isRegMatch = normReg === '48217';
  const isCouncilMatch =
    normCouncil === normalizeSandboxField('SANDBOX TEST COUNCIL');

  if (isNameMatch && isRegMatch && isCouncilMatch) {
    return {
      verified: true,
      status: 'verified',
      source: 'SANDBOX',
      message: 'Demo verification only. This is not an NMC registry result.',
      details: {
        doctorName: 'Priyansh V Shah',
        registrationNumber: '48217',
        stateMedicalCouncil: 'SANDBOX TEST COUNCIL',
        qualification: 'MBBS / BAMS (Demo Practitioner)',
      },
    };
  }

  // Construct specific rejection message based on mismatched field
  let reason = 'Sandbox registration not found.';
  if (!isNameMatch) {
    reason = 'Doctor Name does not match the demo sandbox record (Priyansh V Shah).';
  } else if (!isRegMatch) {
    reason = 'Medical Registration Number does not match the demo sandbox record (48217).';
  } else if (!isCouncilMatch) {
    reason = 'Medical Council does not match the demo sandbox record (SANDBOX TEST COUNCIL).';
  }

  return {
    verified: false,
    status: 'rejected',
    source: 'SANDBOX',
    message: `Sandbox verification failed: ${reason}`,
  };
}
