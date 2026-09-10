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
          <p>Last updated: September 10, 2026</p>
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
      <section>
        <h2>Information we handle</h2>
        <p>Account details, workspace content, Business DNA, uploaded media, connected-channel metadata, usage records, and technical diagnostics needed to operate the service.</p>
      </section>

      <section>
        <h2>Social media account connections</h2>
        <p>When you connect social media accounts (Facebook, Instagram, YouTube, LinkedIn, Slack, or others) to time2grow, we access and store specific data to enable content publishing and analytics features:</p>
        <ul>
          <li><strong>Authentication tokens:</strong> OAuth access tokens and refresh tokens are encrypted and stored securely on our servers to maintain your authorized connection without requiring repeated logins.</li>
          <li><strong>Account information:</strong> We retrieve basic account details such as account name, profile identifiers (Page IDs, Channel IDs, Business Account IDs), and available permissions to display your connected accounts and enable publishing to the correct destinations.</li>
          <li><strong>Publishing permissions:</strong> We request only the permissions necessary to publish content on your behalf (e.g., posting text, images, and videos to your connected pages, channels, or profiles).</li>
          <li><strong>Analytics and insights:</strong> If you use analytics features, we may retrieve public engagement metrics (views, likes, comments, shares) and post performance data from your connected accounts to display insights within time2grow.</li>
        </ul>
      </section>

      <section>
        <h2>How we use social media data</h2>
        <p>Data from connected social media accounts is used exclusively for the following purposes:</p>
        <ul>
          <li><strong>Content publishing:</strong> To post text, images, and videos to your connected Facebook Pages, Instagram Business accounts, YouTube Channels, LinkedIn Pages, and other platforms as you direct through the time2grow interface.</li>
          <li><strong>Connection management:</strong> To display which accounts are connected, verify connection status, and enable you to disconnect accounts at any time.</li>
          <li><strong>Analytics and reporting:</strong> To retrieve and display performance metrics for content you have published through time2grow, helping you understand engagement and reach.</li>
          <li><strong>Service functionality:</strong> To maintain active connections, refresh expired tokens automatically, and ensure publishing requests are delivered successfully.</li>
        </ul>
        <p><strong>We do not:</strong></p>
        <ul>
          <li>Access your personal social media feed, private messages, or friend lists</li>
          <li>Post content without your explicit instruction</li>
          <li>Share your social media data with third parties for advertising or marketing purposes</li>
          <li>Use your data to train AI models or for purposes unrelated to the time2grow service</li>
          <li>Sell or monetize your social media account data</li>
        </ul>
      </section>

      <section>
        <h2>Data storage and security</h2>
        <p>Social media access tokens are encrypted using industry-standard AES-256-GCM encryption and stored in isolated, access-controlled database tables. Only authorized time2grow backend services can decrypt tokens, and they are used exclusively to execute publishing actions you initiate. Tokens are never exposed to the browser or client-side code.</p>
        <p>Account metadata (account names, identifiers, connection status) is stored in your workspace database and isolated per organization. Workspace members with appropriate permissions can view connected accounts, but cannot access the underlying authentication tokens.</p>
      </section>

      <section>
        <h2>Your control over social media data</h2>
        <p>You maintain full control over your social media connections:</p>
        <ul>
          <li><strong>Disconnect anytime:</strong> You can disconnect any social media account from the Connections page. This immediately deletes stored tokens and prevents further publishing to that account.</li>
          <li><strong>Revoke platform permissions:</strong> You can revoke time2grow's access through your social media platform's settings (Facebook App Settings, Google Account Permissions, LinkedIn Apps, etc.). This will invalidate our stored tokens and require reconnection if you wish to resume publishing.</li>
          <li><strong>Workspace control:</strong> Workspace owners and administrators control which accounts are connected and can remove connections at any time.</li>
        </ul>
      </section>

      <section>
        <h2>Data retention for social media connections</h2>
        <p>When you disconnect a social media account, we immediately delete the associated authentication tokens. Historical publishing records (post content you created, publish timestamps, and success/failure status) are retained in your workspace's content history but disassociate from the specific account credentials.</p>
        <p>If you delete your time2grow workspace entirely, all social media tokens and connection metadata are permanently deleted within 30 days.</p>
      </section>

      <section>
        <h2>Third-party platform policies</h2>
        <p>Your use of connected social media accounts through time2grow is also subject to each platform's terms of service, data policies, and API usage policies:</p>
        <ul>
          <li>Meta (Facebook & Instagram): <a href="https://www.facebook.com/privacy/policy" target="_blank" rel="noopener noreferrer">Privacy Policy</a>, <a href="https://developers.facebook.com/terms" target="_blank" rel="noopener noreferrer">Platform Terms</a></li>
          <li>YouTube (Google): <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</a>, <a href="https://developers.google.com/youtube/terms/api-services-terms-of-service" target="_blank" rel="noopener noreferrer">API Terms</a></li>
          <li>LinkedIn: <a href="https://www.linkedin.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer">Privacy Policy</a></li>
          <li>Slack: <a href="https://slack.com/privacy-policy" target="_blank" rel="noopener noreferrer">Privacy Policy</a></li>
        </ul>
        <p>We comply with each platform's API usage requirements and data handling guidelines.</p>
      </section>

      <section>
        <h2>How we use other information</h2>
        <p>Beyond social media connections, we handle workspace content, Business DNA, uploaded media, usage records, and technical diagnostics to authenticate users, provide AI features, secure workspaces, enforce limits, troubleshoot failures, and improve the product.</p>
      </section>

      <section>
        <h2>Service providers</h2>
        <p>Selected data may be processed by infrastructure providers (hosting, databases), authentication providers, AI service providers, storage providers, and social platform APIs only as needed for requested features. We use service providers that meet industry security and privacy standards.</p>
      </section>

      <section>
        <h2>Control and retention</h2>
        <p>Workspace administrators control workspace content and connected accounts. Contact support to request access, correction, export, or deletion of your data. Some security and billing records may be retained where required by law or for fraud prevention.</p>
      </section>

      <section>
        <h2>Security</h2>
        <p>We use authenticated access, tenant isolation, encrypted credential storage, server-side token management, and usage controls. All social media API calls are made server-side to prevent token exposure. No internet service can guarantee absolute security, but we employ industry-standard practices to protect your data.</p>
      </section>

      <section>
        <h2>Changes to this policy</h2>
        <p>We may update this privacy policy as we add features or respond to regulatory requirements. Material changes will be communicated through the application or via email. Your continued use of time2grow after changes constitutes acceptance of the updated policy.</p>
      </section>

      <section>
        <h2>Contact</h2>
        <p>For privacy questions, data requests, or concerns about how we handle social media connection data, contact our support team through the Support page.</p>
      </section>
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