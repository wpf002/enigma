'use client';

import { ErrorPanel } from '@/components/ui';

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div>
      <ErrorPanel title="This page could not load" message={error.message || 'The API did not answer.'} />
      <button type="button" className="btn mt-4" onClick={reset}>Try again</button>
    </div>
  );
}
