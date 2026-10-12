import Link from 'next/link';
import { Empty } from '@/components/ui';

export default function NotFound() {
  return (
    <Empty title="Nothing at this address">
      The record may belong to an older snapshot. <Link className="link" href="/contradictions">Browse contradictions</Link>.
    </Empty>
  );
}
