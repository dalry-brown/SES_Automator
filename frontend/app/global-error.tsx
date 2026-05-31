'use client';

export default function GlobalError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', background: '#f8fafc' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', gap: 16, padding: 32, textAlign: 'center' }}>
          <p style={{ fontSize: 64, fontWeight: 900, color: '#e2e8f0', margin: 0, lineHeight: 1 }}>!</p>
          <p style={{ fontSize: 20, fontWeight: 700, color: '#1e293b', margin: 0 }}>Something went wrong</p>
          <p style={{ fontSize: 14, color: '#64748b', margin: 0, maxWidth: 360 }}>
            {error.message || 'An unexpected error occurred. Please try again.'}
          </p>
          <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
            <button
              onClick={reset}
              style={{ padding: '8px 20px', background: '#1b3a6b', color: 'white', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 600 }}
            >
              Try again
            </button>
            <a
              href="/home"
              style={{ padding: '8px 20px', background: 'white', color: '#475569', borderRadius: 8, border: '1px solid #e2e8f0', cursor: 'pointer', fontSize: 14, fontWeight: 500, textDecoration: 'none' }}
            >
              Back to home
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
