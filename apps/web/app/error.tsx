'use client';

import { ErrorPanel } from '@/components/ui';

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div>
      <ErrorPanel title="Page Failed to Load" message={error.message || 'No response from the API.'} />
      <button type="button" className="btn mt-4" onClick={reset}>Retry</button>
    </div>
  );
}
