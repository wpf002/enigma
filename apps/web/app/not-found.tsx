import Link from 'next/link';
import { Empty } from '@/components/ui';

export default function NotFound() {
  return <Empty title="Not Found"><Link className="link" href="/contradictions">Contradictions</Link></Empty>;
}
