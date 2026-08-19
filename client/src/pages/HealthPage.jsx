import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api.js';

export function HealthPage() {
  const [state, setState] = useState({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    api
      .health()
      .then((data) => !cancelled && setState({ status: 'ready', data }))
      .catch((err) => {
        if (cancelled) return;
        const message = err instanceof ApiError ? err.message : 'API unreachable';
        setState({ status: 'error', message });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === 'loading') return <p>Checking API…</p>;
  if (state.status === 'error') return <p role="alert">API error: {state.message}</p>;

  return (
    <dl>
      <dt>API</dt>
      <dd>{state.data.status}</dd>
      <dt>Database</dt>
      <dd>{state.data.db}</dd>
      <dt>Uptime</dt>
      <dd>{state.data.uptimeSeconds}s</dd>
    </dl>
  );
}
