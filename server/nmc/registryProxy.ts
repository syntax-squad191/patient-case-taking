import http from 'http';
import https from 'https';

export const NMC_REGISTRY_URL = 'https://www.nmc.org.in/information-desk/indian-medical-register/';
const TIMEOUT_MS = 6000;

export interface RegistryQuery {
  registrationNumber: string;
  fullName: string;
  medicalCouncil: string;
}

export interface RegistryResponse {
  status: 'verified' | 'rejected' | 'unavailable';
  registrationNumber: string;
  verifiedName?: string;
  medicalCouncil?: string;
  message: string;
}

/**
 * Proxies official National Medical Commission registry requests with strict 6s timeout.
 * If registry unreachable or times out: returns unavailable. Never auto-approves.
 */
export async function queryNMCRegistry(query: RegistryQuery): Promise<RegistryResponse> {
  const { registrationNumber, fullName, medicalCouncil } = query;

  return new Promise((resolve) => {
    let resolved = false;

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        resolve({
          status: 'unavailable',
          registrationNumber,
          verifiedName: fullName,
          medicalCouncil,
          message: "Verification isn't available right now. Please try again later.",
        });
      }
    }, TIMEOUT_MS);

    try {
      const client = NMC_REGISTRY_URL.startsWith('https') ? https : http;

      const req = client.get(NMC_REGISTRY_URL, { timeout: TIMEOUT_MS }, (res) => {
        if (resolved) return;

        // The public NMC portal provides an HTML page with search forms.
        // If the portal is reachable, report that automatic scraping/parsing
        // cannot definitively match without official NMC captcha API access.
        clearTimeout(timeout);
        resolved = true;

        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 400) {
          // Official portal reached, but public scraping without API token cannot verify
          resolve({
            status: 'unavailable',
            registrationNumber,
            medicalCouncil,
            message: "Verification isn't available right now. Please try again later.",
          });
        } else {
          resolve({
            status: 'unavailable',
            registrationNumber,
            medicalCouncil,
            message: "Verification isn't available right now. Please try again later.",
          });
        }
      });

      req.on('error', () => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          resolve({
            status: 'unavailable',
            registrationNumber,
            medicalCouncil,
            message: "Verification isn't available right now. Please try again later.",
          });
        }
      });

      req.on('timeout', () => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          req.destroy();
          resolve({
            status: 'unavailable',
            registrationNumber,
            medicalCouncil,
            message: "Verification isn't available right now. Please try again later.",
          });
        }
      });
    } catch {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        resolve({
          status: 'unavailable',
          registrationNumber,
          medicalCouncil,
          message: "Verification isn't available right now. Please try again later.",
        });
      }
    }
  });
}
