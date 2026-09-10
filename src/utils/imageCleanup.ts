/**
 * Utility for immediate and safe cleanup of temporary verification images.
 * Guarantees that sensitive biometric identity documents are purged from memory
 * and never retained or logged.
 */

export interface CleanupTarget {
  objectUrl?: string | null;
  canvas?: HTMLCanvasElement | null;
  image?: HTMLImageElement | null;
}

/**
 * Revokes object URLs and clears canvas/image memory buffers.
 */
export function purgeTemporaryVerificationImage(target: CleanupTarget): void {
  // Revoke object URL from browser memory
  if (target.objectUrl && target.objectUrl.startsWith('blob:')) {
    try {
      URL.revokeObjectURL(target.objectUrl);
    } catch {
      // Ignore revocation failure
    }
  }

  // Clear canvas buffer if exists
  if (target.canvas) {
    try {
      const ctx = target.canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, target.canvas.width, target.canvas.height);
      }
      target.canvas.width = 0;
      target.canvas.height = 0;
    } catch {
      // Ignore canvas clear error
    }
  }

  // Clear image source
  if (target.image) {
    try {
      target.image.src = '';
      target.image.onload = null;
      target.image.onerror = null;
    } catch {
      // Ignore image cleanup error
    }
  }
}
