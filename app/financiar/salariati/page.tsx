import { Suspense } from 'react';
import { FinancialEmployeesDashboard } from '@/components/financial/financial-employees-dashboard';

export default function FinancialEmployeesPage() {
  return (
    <Suspense fallback={null}>
      <FinancialEmployeesDashboard />
    </Suspense>
  );
}
