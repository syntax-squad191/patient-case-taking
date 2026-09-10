import React, { useState, useRef } from 'react';
import {
  ShieldCheck,
  Check,
  AlertCircle,
  Upload,
  UserCheck,
  RotateCcw,
  Camera,
  Loader2,
  Lock,
} from 'lucide-react';
import { DoctorVerificationState } from '../../types/verification';
import { verifyNMCRegistration, isNMCSandboxEnabled } from '../../services/nmcService';
import { verifyFacesWithFaceNet } from '../../services/facenetService';
import { purgeTemporaryVerificationImage } from '../../utils/imageCleanup';
import { CameraLiveness } from './CameraLiveness';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { useTranslation } from '../../context/LanguageContext';

const INITIAL_STATE: DoctorVerificationState = {
  step: 'details',
  fullName: '',
  registrationNumber: '',
  medicalCouncil: '',
  nmcResult: null,
  identityPhotoFile: null,
  identityPhotoUrl: null,
  liveSnapshotBlob: null,
  liveSnapshotUrl: null,
  livenessVerified: false,
  faceNetResult: null,
  finalStatus: null,
  verificationSource: null,
  errorMessage: null,
  isProcessing: false,
};

export const DoctorVerification: React.FC = () => {
  const { t } = useTranslation();
  const [state, setState] = useState<DoctorVerificationState>(INITIAL_STATE);
  const [dbSyncStatus, setDbSyncStatus] = useState<string | null>(null);

  const idImageRef = useRef<HTMLImageElement | null>(null);
  const liveImageRef = useRef<HTMLImageElement | null>(null);

  const sandboxActive = isNMCSandboxEnabled();

  // STEP 1: Handle NMC / Medical Council Verification
  const handleVerifyNMC = async (e: React.FormEvent) => {
    e.preventDefault();

    if (
      !state.fullName.trim() ||
      !state.registrationNumber.trim() ||
      !state.medicalCouncil.trim()
    ) {
      setState((prev) => ({
        ...prev,
        errorMessage: t('verification.errors.requiredFields'),
      }));
      return;
    }

    setState((prev) => ({ ...prev, isProcessing: true, errorMessage: null }));

    try {
      const result = await verifyNMCRegistration(
        state.registrationNumber,
        state.fullName,
        state.medicalCouncil
      );

      if (result.status === 'verified') {
        const source = result.isSandbox ? 'SANDBOX' : 'NMC';
        setState((prev) => ({
          ...prev,
          nmcResult: result,
          verificationSource: source,
          step: 'photo',
          isProcessing: false,
          errorMessage: null,
        }));
      } else if (result.status === 'unavailable') {
        setState((prev) => ({
          ...prev,
          nmcResult: result,
          finalStatus: 'unavailable',
          verificationSource: null,
          step: 'result',
          isProcessing: false,
          errorMessage: t('verification.nmc.unavailable'),
        }));
        await syncDoctorStatusToSupabase('unavailable', 'NMC Registry (Unavailable / Timeout)');
      } else {
        setState((prev) => ({
          ...prev,
          nmcResult: result,
          finalStatus: 'rejected',
          verificationSource: null,
          step: 'result',
          isProcessing: false,
          errorMessage: result.message || t('verification.nmc.notFound'),
        }));
        await syncDoctorStatusToSupabase('rejected', result.message);
      }
    } catch {
      setState((prev) => ({
        ...prev,
        finalStatus: 'unavailable',
        step: 'result',
        isProcessing: false,
        errorMessage: t('verification.nmc.unavailable'),
      }));
    }
  };

  // STEP 2: Handle Temporary Identity Photo Upload
  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setState((prev) => ({
        ...prev,
        errorMessage: 'Please select a valid image file (JPEG, PNG, or WebP).',
      }));
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setState((prev) => ({
        ...prev,
        errorMessage: 'Image size must be less than 10MB.',
      }));
      return;
    }

    if (state.identityPhotoUrl) {
      purgeTemporaryVerificationImage({ objectUrl: state.identityPhotoUrl });
    }

    const objectUrl = URL.createObjectURL(file);

    setState((prev) => ({
      ...prev,
      identityPhotoFile: file,
      identityPhotoUrl: objectUrl,
      errorMessage: null,
    }));
  };

  const proceedToLiveness = () => {
    if (!state.identityPhotoFile || !state.identityPhotoUrl) {
      setState((prev) => ({
        ...prev,
        errorMessage: t('verification.errors.uploadDocument'),
      }));
      return;
    }

    setState((prev) => ({
      ...prev,
      step: 'liveness',
      errorMessage: null,
    }));
  };

  // STEP 3: Liveness Succeeded -> Auto Captured Live Snapshot
  const handleLivenessSuccess = (
    snapshotBlob: Blob,
    snapshotUrl: string,
    snapshotCanvas: HTMLCanvasElement
  ) => {
    setState((prev) => ({
      ...prev,
      liveSnapshotBlob: snapshotBlob,
      liveSnapshotUrl: snapshotUrl,
      livenessVerified: true,
      step: 'comparison',
      isProcessing: true,
      errorMessage: null,
    }));

    // Step 4: Execute FaceNet comparison
    executeFaceNetComparison(snapshotCanvas);
  };

  // STEP 4: FaceNet Embedding Inference & Distance Comparison
  const executeFaceNetComparison = async (liveCanvas: HTMLCanvasElement) => {
    if (!state.identityPhotoUrl) {
      setState((prev) => ({
        ...prev,
        step: 'result',
        finalStatus: 'rejected',
        isProcessing: false,
        errorMessage: t('verification.errors.uploadDocument'),
      }));
      return;
    }

    try {
      const idImg = new Image();
      idImg.crossOrigin = 'anonymous';

      await new Promise<void>((resolve, reject) => {
        idImg.onload = () => resolve();
        idImg.onerror = () =>
          reject(new Error('Failed to load identity image for verification.'));
        idImg.src = state.identityPhotoUrl!;
      });

      idImageRef.current = idImg;

      // Run actual FaceNet Inception-ResNet-v1 model inference
      const result = await verifyFacesWithFaceNet(idImg, liveCanvas);

      const isVerified = result.matched;
      const finalStatus = isVerified ? 'verified' : 'rejected';
      const finalSource = isVerified ? state.verificationSource || 'NMC' : null;

      setState((prev) => ({
        ...prev,
        faceNetResult: result,
        finalStatus,
        verificationSource: finalSource,
        step: 'result',
        isProcessing: false,
        errorMessage: isVerified ? null : (result.message || t('verification.faceMatch.noMatch')),
      }));

      // Sync result to Supabase public.doctors table
      await syncDoctorStatusToSupabase(
        finalStatus,
        finalSource || 'FaceNet Verification Failed'
      );
    } catch (err: unknown) {
      const error = err as Error;
      setState((prev) => ({
        ...prev,
        step: 'result',
        finalStatus: 'rejected',
        faceNetResult: null,
        isProcessing: false,
        errorMessage: error.message || t('verification.errors.unexpected'),
      }));
    } finally {
      // REQUIREMENT 14: Immediately delete and clear temporary identity image buffers
      if (state.identityPhotoUrl) {
        purgeTemporaryVerificationImage({
          objectUrl: state.identityPhotoUrl,
          image: idImageRef.current,
        });
      }
      if (state.liveSnapshotUrl) {
        purgeTemporaryVerificationImage({
          objectUrl: state.liveSnapshotUrl,
          canvas: liveCanvas,
        });
      }
    }
  };

  // STEP 5: Sync Doctor Verification Status to Supabase
  const syncDoctorStatusToSupabase = async (
    status: 'verified' | 'rejected' | 'unavailable',
    source: string
  ) => {
    if (!isSupabaseConfigured()) {
      setDbSyncStatus('Database unconfigured in local mode. Status verified in memory.');
      return;
    }

    try {
      setDbSyncStatus('Updating doctor verification record in Supabase...');

      const {
        data: { user },
      } = await supabase.auth.getUser();

      const profileId = user?.id || null;

      const { data: existingDoctor } = await supabase
        .from('doctors')
        .select('id, profile_id')
        .or(
          `registration_number.eq.${state.registrationNumber}${
            profileId ? `,profile_id.eq.${profileId}` : ''
          }`
        )
        .maybeSingle();

      if (existingDoctor) {
        const { error: updateError } = await supabase
          .from('doctors')
          .update({
            verification_status: status,
            verification_source: source,
            full_name: state.fullName,
            ...(profileId && !existingDoctor.profile_id ? { profile_id: profileId } : {}),
          })
          .eq('id', existingDoctor.id);

        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await supabase.from('doctors').insert({
          profile_id: profileId,
          registration_number: state.registrationNumber,
          full_name: state.fullName,
          verification_status: status,
          verification_source: source,
        });

        if (insertError) throw insertError;
      }

      setDbSyncStatus('Doctor verification status successfully updated in Supabase.');
    } catch (err: unknown) {
      const error = err as Error;
      setDbSyncStatus(`Supabase notice: ${error.message}`);
    }
  };

  const handleReset = () => {
    if (state.identityPhotoUrl) {
      purgeTemporaryVerificationImage({ objectUrl: state.identityPhotoUrl });
    }
    if (state.liveSnapshotUrl) {
      purgeTemporaryVerificationImage({ objectUrl: state.liveSnapshotUrl });
    }
    setState(INITIAL_STATE);
    setDbSyncStatus(null);
  };

  return (
    <div className="doctor-verification-wrapper">
      {/* Header Section */}
      <section className="verification-header" aria-labelledby="verification-heading">
        <h2 id="verification-heading">{t('verification.title')}</h2>
        <p>{t('verification.description')}</p>
      </section>

      {/* 5-Step Stepper Component */}
      <nav className="stepper-nav" aria-label="Verification progress">
        {/* Step 1: Doctor Details */}
        <div
          className={`stepper-step ${
            state.step === 'details' ? 'active' : 'completed'
          }`}
          aria-current={state.step === 'details' ? 'step' : undefined}
        >
          <span className="stepper-number">
            {state.step !== 'details' ? <Check size={12} strokeWidth={3} /> : t('verification.stepNumbers.step1')}
          </span>
          <span className="stepper-label">{t('verification.steps.doctorDetails')}</span>
        </div>

        <div className="stepper-divider" />

        {/* Step 2: ID Document */}
        <div
          className={`stepper-step ${
            state.step === 'photo'
              ? 'active'
              : ['liveness', 'comparison', 'result'].includes(state.step)
              ? 'completed'
              : ''
          }`}
          aria-current={state.step === 'photo' ? 'step' : undefined}
        >
          <span className="stepper-number">
            {['liveness', 'comparison', 'result'].includes(state.step) ? (
              <Check size={12} strokeWidth={3} />
            ) : (
              t('verification.stepNumbers.step2')
            )}
          </span>
          <span className="stepper-label">{t('verification.steps.idDocument')}</span>
        </div>

        <div className="stepper-divider" />

        {/* Step 3: Live Liveness */}
        <div
          className={`stepper-step ${
            state.step === 'liveness'
              ? 'active'
              : ['comparison', 'result'].includes(state.step)
              ? 'completed'
              : ''
          }`}
          aria-current={state.step === 'liveness' ? 'step' : undefined}
        >
          <span className="stepper-number">
            {['comparison', 'result'].includes(state.step) ? (
              <Check size={12} strokeWidth={3} />
            ) : (
              t('verification.stepNumbers.step3')
            )}
          </span>
          <span className="stepper-label">{t('verification.steps.liveness')}</span>
        </div>

        <div className="stepper-divider" />

        {/* Step 4: FaceNet Match */}
        <div
          className={`stepper-step ${
            state.step === 'comparison'
              ? 'active'
              : state.step === 'result'
              ? 'completed'
              : ''
          }`}
          aria-current={state.step === 'comparison' ? 'step' : undefined}
        >
          <span className="stepper-number">
            {state.step === 'result' ? (
              <Check size={12} strokeWidth={3} />
            ) : (
              t('verification.stepNumbers.step4')
            )}
          </span>
          <span className="stepper-label">{t('verification.steps.faceMatch')}</span>
        </div>

        <div className="stepper-divider" />

        {/* Step 5: Outcome */}
        <div
          className={`stepper-step ${state.step === 'result' ? 'active' : ''}`}
          aria-current={state.step === 'result' ? 'step' : undefined}
        >
          <span className="stepper-number">{t('verification.stepNumbers.step5')}</span>
          <span className="stepper-label">{t('verification.steps.outcome')}</span>
        </div>
      </nav>

      {/* Error Alert Display */}
      {state.errorMessage && (
        <div className="alert-box error" role="alert">
          <AlertCircle className="alert-icon" />
          <span>{state.errorMessage}</span>
        </div>
      )}

      {/* STEP 1: Doctor Information */}
      {state.step === 'details' && (
        <div className="verification-panel">
          <div className="panel-title-area">
            <h3>{t('verification.doctorDetails.title')}</h3>
            <p>{t('verification.doctorDetails.description')}</p>
          </div>

          {sandboxActive && (
            <div className="sandbox-banner">
              <strong>DEMO SANDBOX:</strong>
              <span>{t('verification.doctorDetails.sandboxNotice')}</span>
            </div>
          )}

          <form onSubmit={handleVerifyNMC} className="clean-form">
            <div className="form-field">
              <label htmlFor="fullName">{t('verification.doctorDetails.name')} *</label>
              <input
                id="fullName"
                type="text"
                className="form-input"
                value={state.fullName}
                onChange={(e) =>
                  setState((prev) => ({ ...prev, fullName: e.target.value }))
                }
                placeholder={sandboxActive ? 'Priyansh V Shah' : t('verification.doctorDetails.namePlaceholder')}
                required
              />
              <span className="field-description">Must match official registration name.</span>
            </div>

            <div className="form-field">
              <label htmlFor="regNum">{t('verification.doctorDetails.registrationNumber')} *</label>
              <input
                id="regNum"
                type="text"
                className="form-input"
                value={state.registrationNumber}
                onChange={(e) =>
                  setState((prev) => ({
                    ...prev,
                    registrationNumber: e.target.value,
                  }))
                }
                placeholder={sandboxActive ? '48217' : t('verification.doctorDetails.registrationNumberPlaceholder')}
                required
              />
              <span className="field-description">Official registration number as registered.</span>
            </div>

            <div className="form-field">
              <label htmlFor="council">{t('verification.doctorDetails.medicalCouncil')} *</label>
              <input
                id="council"
                type="text"
                className="form-input"
                value={state.medicalCouncil}
                onChange={(e) =>
                  setState((prev) => ({
                    ...prev,
                    medicalCouncil: e.target.value,
                  }))
                }
                placeholder={sandboxActive ? 'SANDBOX TEST COUNCIL' : t('verification.doctorDetails.medicalCouncilPlaceholder')}
                required
              />
              <span className="field-description">State medical council or board name.</span>
            </div>

            <div className="form-actions-row">
              <button
                type="submit"
                className="btn btn-primary"
                disabled={state.isProcessing}
              >
                {state.isProcessing ? (
                  <>
                    <Loader2 size={16} className="spinner" /> {t('verification.actions.verifying')}
                  </>
                ) : (
                  <>
                    <UserCheck size={16} /> {t('verification.actions.verify')}
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* STEP 2: Identity Photo Upload */}
      {state.step === 'photo' && (
        <div className="verification-panel">
          <div className="panel-title-area">
            {state.verificationSource === 'SANDBOX' ? (
              <div className="status-pill">
                <strong>{t('verification.outcome.sandboxBadge')}</strong> — {t('verification.outcome.sandboxDisclaimer')}
              </div>
            ) : (
              <div className="status-pill">
                <Check size={14} /> <strong>{t('verification.nmc.verified')}</strong>
              </div>
            )}
            <h3>{t('verification.idDocument.title')}</h3>
            <p>{t('verification.idDocument.description')}</p>
          </div>

          <div className="dropzone-container">
            <input
              type="file"
              id="idPhotoInput"
              accept="image/jpeg,image/png,image/webp"
              onChange={handlePhotoUpload}
              style={{ display: 'none' }}
            />
            <label htmlFor="idPhotoInput" className="dropzone-box" tabIndex={0}>
              <Upload className="dropzone-icon" />
              <span className="dropzone-title">
                {state.identityPhotoFile
                  ? state.identityPhotoFile.name
                  : t('verification.idDocument.uploadPrompt')}
              </span>
              <span className="dropzone-hint">JPEG, PNG, WebP (Max 10MB)</span>
            </label>
          </div>

          {state.identityPhotoUrl && (
            <div className="photo-preview-box">
              <p className="photo-preview-label">{t('verification.idDocument.fileSelected')}:</p>
              <div className="photo-preview-frame">
                <img
                  src={state.identityPhotoUrl}
                  alt="Identity document preview"
                />
              </div>
            </div>
          )}

          <div className="privacy-notice">
            <Lock size={14} style={{ flexShrink: 0, marginTop: '2px' }} />
            <span>{t('verification.idDocument.privacyNotice')}</span>
          </div>

          <div className="form-actions-row space-between">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setState((prev) => ({ ...prev, step: 'details' }))}
            >
              {t('verification.actions.back')}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!state.identityPhotoFile}
              onClick={proceedToLiveness}
            >
              <Camera size={16} /> {t('verification.actions.continue')}
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: Camera & Eye-Blink Liveness Detection */}
      {state.step === 'liveness' && (
        <div className="verification-panel">
          <CameraLiveness
            onLivenessSuccess={handleLivenessSuccess}
            onCancel={() => setState((prev) => ({ ...prev, step: 'photo' }))}
          />
        </div>
      )}

      {/* STEP 4: FaceNet Comparison in Progress */}
      {state.step === 'comparison' && (
        <div className="verification-panel">
          <div className="processing-card">
            <Loader2 size={36} className="spinner" />
            <h3>{t('verification.faceMatch.processing')}</h3>
            <p>{t('verification.faceMatch.comparing')}</p>
          </div>
        </div>
      )}

      {/* STEP 5: Final Verification Outcome */}
      {state.step === 'result' && (
        <div className="verification-panel">
          {state.finalStatus === 'verified' && (
            <div className="result-panel">
              <div className="result-icon-wrapper">
                <ShieldCheck size={32} />
              </div>
              <h2 className="result-title">
                {state.verificationSource === 'SANDBOX'
                  ? t('verification.outcome.sandboxBadge')
                  : t('verification.outcome.successTitle')}
              </h2>
              <p className="result-subtitle">
                {state.verificationSource === 'SANDBOX'
                  ? t('verification.outcome.sandboxDisclaimer')
                  : t('verification.outcome.successSubtitle')}
              </p>

              <div className="result-table">
                <div className="result-table-row">
                  <span className="result-table-key">{t('verification.outcome.doctorId')}</span>
                  <span className="result-table-value">{state.registrationNumber}</span>
                </div>
                <div className="result-table-row">
                  <span className="result-table-key">{t('verification.doctorDetails.name')}</span>
                  <span className="result-table-value">{state.fullName}</span>
                </div>
                <div className="result-table-row">
                  <span className="result-table-key">{t('verification.outcome.verificationSource')}</span>
                  <span className="result-table-value">
                    {state.verificationSource === 'SANDBOX'
                      ? 'DEMO SANDBOX (Non-Registry Demonstration)'
                      : 'NMC Registry'}
                  </span>
                </div>
                <div className="result-table-row">
                  <span className="result-table-key">{t('verification.steps.liveness')}</span>
                  <span className="result-table-value">{t('verification.liveness.livenessPassed')}</span>
                </div>
                <div className="result-table-row">
                  <span className="result-table-key">{t('verification.steps.faceMatch')}</span>
                  <span className="result-table-value">
                    {state.faceNetResult
                      ? `${t('verification.faceMatch.match')} (d: ${state.faceNetResult.distance} < ${state.faceNetResult.threshold})`
                      : t('verification.faceMatch.match')}
                  </span>
                </div>
              </div>

              {dbSyncStatus && (
                <p style={{ fontSize: '0.75rem', color: 'var(--muted)', marginBottom: '1.25rem' }}>
                  {dbSyncStatus}
                </p>
              )}

              <div className="result-actions">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => alert('Doctor verified. Ready for clinical workflow.')}
                >
                  {t('verification.outcome.proceedToDashboard')}
                </button>
              </div>
            </div>
          )}

          {state.finalStatus === 'unavailable' && (
            <div className="result-panel">
              <div className="result-icon-wrapper">
                <AlertCircle size={32} />
              </div>
              <h2 className="result-title">{t('verification.status.unavailable')}</h2>
              <p className="result-subtitle">
                {t('verification.nmc.unavailable')}
              </p>

              {dbSyncStatus && (
                <p style={{ fontSize: '0.75rem', color: 'var(--muted)', margin: '1rem 0' }}>
                  {dbSyncStatus}
                </p>
              )}

              <div className="result-actions" style={{ marginTop: '1.5rem' }}>
                <button type="button" className="btn btn-secondary" onClick={handleReset}>
                  <RotateCcw size={16} /> {t('verification.actions.retry')}
                </button>
              </div>
            </div>
          )}

          {state.finalStatus === 'rejected' && (
            <div className="result-panel">
              <div className="result-icon-wrapper">
                <AlertCircle size={32} />
              </div>
              <h2 className="result-title">{t('verification.outcome.failedTitle')}</h2>
              <p className="result-subtitle">
                {state.errorMessage || t('verification.outcome.failedSubtitle')}
              </p>

              {state.faceNetResult && !state.faceNetResult.matched && (
                <div className="result-table" style={{ marginTop: '1rem' }}>
                  <div className="result-table-row">
                    <span className="result-table-key">{t('verification.faceMatch.distance')}</span>
                    <span className="result-table-value">{state.faceNetResult.distance}</span>
                  </div>
                  <div className="result-table-row">
                    <span className="result-table-key">{t('verification.faceMatch.threshold')}</span>
                    <span className="result-table-value">&lt; {state.faceNetResult.threshold}</span>
                  </div>
                </div>
              )}

              {dbSyncStatus && (
                <p style={{ fontSize: '0.75rem', color: 'var(--muted)', margin: '1rem 0' }}>
                  {dbSyncStatus}
                </p>
              )}

              <div className="result-actions" style={{ marginTop: '1.5rem' }}>
                <button type="button" className="btn btn-secondary" onClick={handleReset}>
                  <RotateCcw size={16} /> {t('verification.outcome.retry')}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Hidden elements for memory rendering without showing in DOM */}
      <img ref={idImageRef} style={{ display: 'none' }} alt="Hidden ID Element" />
      <img ref={liveImageRef} style={{ display: 'none' }} alt="Hidden Live Element" />
    </div>
  );
};
