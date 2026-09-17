import { redirect } from 'next/navigation';

export default function AdminHistoricalImportPage() {
  redirect('/admin?tab=surse-date&section=import');
}
