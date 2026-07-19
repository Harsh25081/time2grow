import { Link } from 'react-router-dom';
import { env } from '../lib/env';

type PageKind = 'privacy' | 'terms' | 'support';

export function PublicInfoPage({ kind }: { kind: PageKind }) {
  return (
    <main className="auth-screen">
      <article className="auth-card public-info-page">
        <header>
          <Link to="/" className="brand-lockup compact">
            <span className="brand-mark">t2g</span>
            <strong>time2grow</strong>
          </Link>
          <h1>{titleFor(kind)}</h1>
          <p>Last updated: July 19, 2026</p>
        </header>
        {kind === 'privacy' ? <PrivacyContent /> : null}
        {kind === 'terms' ? <TermsContent /> : null}
        {kind === 'support' ? <SupportContent /> : null}
        <footer className="public-info-links">
          <Link to="/privacy">Privacy</Link>
          <Link to="/terms">Terms</Link>
          <Link to="/support">Support</Link>
          <Link to="/auth">Sign in</Link>
        </footer>
      </article>
    </main>
  );
}

function PrivacyContent() {
  return (
    <div className="public-info-content">
      <section><h2>Information we handle</h2><p>Account details, workspace content, Business DNA, uploaded media, connected-channel metadata, usage records, and technical diagnostics needed to operate the service.</p></section>
      <section><h2>How we use it</h2><p>To authenticate users, provide AI and publishing features, secure workspaces, enforce limits, troubleshoot failures, and improve the product.</p></section>
      <section><h2>Service providers</h2><p>Selected data may be processed by infrastructure, authentication, AI, storage, and social-platform providers only as needed for requested features.</p></section>
      <section><h2>Control and retention</h2><p>Workspace administrators control workspace content. Contact support to request access, correction, export, or deletion. Some security and billing records may be retained where required.</p></section>
      <section><h2>Security</h2><p>We use authenticated access, tenant isolation, server-side credentials, and usage controls. No internet service can guarantee absolute security.</p></section>
    </div>
  );
}

function TermsContent() {
  return (
    <div className="public-info-content">
      <section><h2>Using time2grow</h2><p>You must provide accurate account information, protect access credentials, and use the service only for lawful business and marketing activity.</p></section>
      <section><h2>Workspace responsibility</h2><p>Workspace owners are responsible for members, connected accounts, content approvals, and confirming they have rights to uploaded or published material.</p></section>
      <section><h2>AI-generated material</h2><p>AI output can be incomplete or inaccurate. Review claims, spelling, pricing, legal language, and brand details before publishing.</p></section>
      <section><h2>Third-party platforms</h2><p>Social networks and other integrations have their own terms, availability, review processes, and limits. Their decisions may affect publishing.</p></section>
      <section><h2>Availability and suspension</h2><p>Features may change or be interrupted. Access may be limited for abuse, security risk, non-payment, or violation of these terms.</p></section>
    </div>
  );
}

function SupportContent() {
  const configured = !env.supportEmail.endsWith('.example');
  return (
    <div className="public-info-content">
      <section><h2>Get help</h2><p>Include your workspace name, the affected feature, what you expected, and the approximate time of the problem.</p></section>
      <section><h2>Contact</h2>{configured ? <p><a href={'mailto:' + env.supportEmail}>{env.supportEmail}</a></p> : <p>Support email configuration is pending. Workspace owners should set VITE_SUPPORT_EMAIL before public launch.</p>}</section>
      <section><h2>Security reports</h2><p>Do not include passwords, access tokens, or private customer data in support messages.</p></section>
    </div>
  );
}

function titleFor(kind: PageKind) {
  if (kind === 'privacy') return 'Privacy Policy';
  if (kind === 'terms') return 'Terms of Service';
  return 'Support';
}