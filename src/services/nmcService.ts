import { NMCVerificationResult } from '../types/verification';

/**
 * Strict maximum timeout for registry requests (6 seconds).
 */
const NMC_REQUEST_TIMEOUT_MS = 6000;

/**
 * Checks if sandbox mode is active from the environment variable.
 */
export function isNMCSandboxEnabled(): boolean {
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    return import.meta.env.VITE_ENABLE_NMC_SANDBOX === 'true';
  }
  if (typeof process !== 'undefined' && process.env) {
    return process.env.VITE_ENABLE_NMC_SANDBOX === 'true';
  }
  return false;
}

/**
 * Verifies medical practitioner registration by calling the backend verification endpoint.
 *
 * ARCHITECTURAL RULE:
 * - The frontend does NOT contain the actual verification decision.
 * - React calls POST /api/nmc/verify with { fullName, registrationNumber, medicalCouncil }.
 * - The backend decides whether Sandbox or Real NMC mode is active.
 * - Distinguishes: NMC verified, NMC not found/rejected, NMC unavailable, SANDBOX verified.
 */
export async function verifyNMCRegistration(
  registrationNumber: string,
  enteredDoctorName: string,
  medicalCouncil: string
): Promise<NMCVerificationResult> {
  const trimmedReg = registrationNumber.trim();
  const trimmedName = enteredDoctorName.trim();
  const trimmedCouncil = medicalCouncil.trim();
  const timestamp = new Date().toISOString();

  if (!trimmedReg || !trimmedName || !trimmedCouncil) {
    return {
      status: 'rejected',
      registrationNumber: trimmedReg,
      medicalCouncil: trimmedCouncil,
      source: isNMCSandboxEnabled() ? 'SANDBOX' : 'NMC',
      message: 'Doctor Full Name, Medical Registration Number, and Medical Council are all required.',
      timestamp,
    };
  }

  const endpoint =
    (typeof import.meta !== 'undefined' && import.meta.env?.VITE_NMC_API_ENDPOINT) ||
    (typeof process !== 'undefined' ? process.env?.VITE_NMC_API_ENDPOINT : undefined) ||
    '/api/nmc/verify';

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), NMC_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        registrationNumber: trimmedReg,
        fullName: trimmedName,
        medicalCouncil: trimmedCouncil,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return {
        status: 'unavailable',
        registrationNumber: trimmedReg,
        medicalCouncil: trimmedCouncil,
        source: 'NMC',
        message: "Verification isn't available right now. Please try again later.",
        timestamp,
      };
    }

    const data = await response.json();

    const isSandbox = data.source === 'SANDBOX';
    const verifiedStatus = data.status === 'verified' ? 'verified' : data.status === 'unavailable' ? 'unavailable' : 'rejected';

    return {
      status: verifiedStatus,
      registrationNumber: trimmedReg,
      verifiedName: data.details?.doctorName || data.verifiedName || trimmedName,
      medicalCouncil: data.details?.stateMedicalCouncil || trimmedCouncil,
      source: isSandbox ? 'SANDBOX' : 'NMC',
      isSandbox,
      details: data.details,
      message: data.message || (isSandbox ? 'Demo verification only. This is not an NMC registry result.' : 'Registration verified with national registry.'),
      timestamp,
    };
  } catch {
    clearTimeout(timeoutId);
    return {
      status: 'unavailable',
      registrationNumber: trimmedReg,
      medicalCouncil: trimmedCouncil,
      source: 'NMC',
      message: "Verification isn't available right now. Please try again later.",
      timestamp,
    };
  }
}
