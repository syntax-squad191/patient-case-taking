import React from 'react';
import { DoctorVerification } from './components/verification/DoctorVerification';
import { Database, Sun, Moon, Globe } from 'lucide-react';
import { isSupabaseConfigured } from './lib/supabase';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import { LanguageProvider, useTranslation } from './context/LanguageContext';

const AppContent: React.FC = () => {
  const { theme, toggleTheme } = useTheme();
  const { language, setLanguage, t } = useTranslation();
  const dbConnected = isSupabaseConfigured();

  const handleLanguageToggle = () => {
    setLanguage(language === 'en' ? 'hi' : 'en');
  };

  return (
    <div className="app-layout">
      {/* Navigation Bar */}
      <header className="app-navbar">
        <div className="navbar-container">
          <div className="navbar-brand">
            <span className="brand-symbol">प्र</span>
            <div className="brand-titles">
              <h1>{t('app.title')}</h1>
              <span className="brand-subtitle">{t('app.subtitle')}</span>
            </div>
          </div>

          <div className="navbar-actions">
            {/* Supabase Status */}
            <div className={`db-status-badge ${dbConnected ? 'connected' : ''}`}>
              <Database size={13} />
              <span>{dbConnected ? 'Supabase Connected' : 'Local Sandbox Mode'}</span>
            </div>

            {/* Language Switcher */}
            <button
              type="button"
              className="control-btn"
              onClick={handleLanguageToggle}
              title={t('language.select')}
              aria-label={t('language.select')}
            >
              <Globe size={14} />
              <span>{language === 'en' ? 'हिन्दी' : 'English'}</span>
            </button>

            {/* Theme Switcher */}
            <button
              type="button"
              className="control-btn"
              onClick={toggleTheme}
              title={t('theme.toggle')}
              aria-label={t('theme.toggle')}
            >
              {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
              <span>{theme === 'dark' ? t('theme.light') : t('theme.dark')}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Verification Content */}
      <main className="main-content-container">
        <DoctorVerification />
      </main>

      {/* Footer */}
      <footer className="app-footer">
        <div className="footer-inner">
          <p>
            <strong>{t('app.title')}</strong> — {t('app.subtitle')}
          </p>
          <p className="footer-sub">
            {t('verification.idDocument.privacyNotice')}
          </p>
        </div>
      </footer>
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <ThemeProvider>
      <LanguageProvider>
        <AppContent />
      </LanguageProvider>
    </ThemeProvider>
  );
};

export default App;
