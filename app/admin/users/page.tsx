import { redirect } from 'next/navigation';

export default function AdminUsersPage() {
  redirect('/admin?tab=surse-date&section=roluri');
}
