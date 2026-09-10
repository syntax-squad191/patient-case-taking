import fs from 'fs';
import path from 'path';
import { verifySandboxDoctor, SandboxDoctorQuery } from './sandbox';
import { queryNMCRegistry } from './registryProxy';

export interface NMCVerificationApiResponse {
  verified: boolean;
  status: 'verified' | 'rejected' | 'unavailable';
  source: 'SANDBOX' | 'NMC';
  message: string;
  details?: {
    doctorName?: string;
    registrationNumber?: string;
    stateMedicalCouncil?: string;
    qualification?: string;
  };
}

/**
 * Reads an environment variable from process.env, falling back to reading
 * .env.local and .env directly from the filesystem.
 * This guarantees server-side code reliably sees ENABLE_NMC_SANDBOX in all runtimes.
 */
function readEnvVar(name: string): string | undefined {
  if (process.env[name] !== undefined) {
    return process.env[name];
  }

  const envFiles = ['.env.local', '.env'];
  for (const file of envFiles) {
    const fullPath = path.resolve(process.cwd(), file);
    if (fs.existsSync(fullPath)) {
      try {
        const content = fs.readFileSync(fullPath, 'utf-8');
        const lines = content.split(/\r?\n/);
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
            const [k, ...v] = trimmed.split('=');
            if (k.trim() === name) {
              const val = v.join('=').trim().replace(/^["']|["']$/g, '');
              process.env[name] = val; // cache in process.env
              return val;
            }
          }
        }
      } catch {
        // ignore file read error
      }
    }
  }

  return undefined;
}

/**
 * Authoritative server-side sandbox check.
 * Checks ENABLE_NMC_SANDBOX=true (server-side var)
 * or VITE_ENABLE_NMC_SANDBOX=true.
 */
export function isServerSandboxEnabled(): boolean {
  const enableServer = readEnvVar('ENABLE_NMC_SANDBOX');
  if (enableServer !== undefined) {
    return enableServer === 'true';
  }

  const enableVite = readEnvVar('VITE_ENABLE_NMC_SANDBOX');
  if (enableVite !== undefined) {
    return enableVite === 'true';
  }

  return false;
}

/**
 * Backend controller for doctor verification.
 * The backend decides whether Sandbox or Real NMC mode is active.
 *
 * Rules:
 * - When sandbox enabled: only verifies matching demo doctor, returns source: 'SANDBOX'.
 * - When sandbox disabled: attempts real registry. If unreachable/timeout, returns status: 'unavailable'.
 * - Never converts 'unavailable' into 'verified'.
 */
export async function handleDoctorVerification(
  query: SandboxDoctorQuery
): Promise<NMCVerificationApiResponse> {
  const { registrationNumber, fullName, medicalCouncil } = query;

  if (!registrationNumber?.trim() || !fullName?.trim() || !medicalCouncil?.trim()) {
    return {
      verified: false,
      status: 'rejected',
      source: isServerSandboxEnabled() ? 'SANDBOX' : 'NMC',
      message: 'Full Name, Registration Number, and Medical Council are all required.',
    };
  }

  // 1. Sandbox Mode
  if (isServerSandboxEnabled()) {
    const sandboxResult = verifySandboxDoctor({
      registrationNumber: registrationNumber.trim(),
      fullName: fullName.trim(),
      medicalCouncil: medicalCouncil.trim(),
    });

    return {
      verified: sandboxResult.verified,
      status: sandboxResult.status,
      source: 'SANDBOX',
      message: sandboxResult.message,
      details: sandboxResult.details,
    };
  }

  // 2. Real NMC Registry Mode
  try {
    const registryResult = await queryNMCRegistry({
      registrationNumber: registrationNumber.trim(),
      fullName: fullName.trim(),
      medicalCouncil: medicalCouncil.trim(),
    });

    return {
      verified: registryResult.status === 'verified',
      status: registryResult.status,
      source: 'NMC',
      message: registryResult.message,
      details: registryResult.verifiedName
        ? {
            doctorName: registryResult.verifiedName,
            registrationNumber: registryResult.registrationNumber,
            stateMedicalCouncil: registryResult.medicalCouncil,
          }
        : undefined,
    };
  } catch {
    return {
      verified: false,
      status: 'unavailable',
      source: 'NMC',
      message: "Verification isn't available right now. Please try again later.",
    };
  }
}
