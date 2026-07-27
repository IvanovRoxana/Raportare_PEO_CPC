import { isStagingEnvironment } from '@/lib/runtime-environment';

export function StagingEnvironmentBanner() {
  if (!isStagingEnvironment()) return null;

  return (
    <div
      role="status"
      className="sticky top-0 z-[100] border-b border-amber-700 bg-amber-300 px-4 py-2 text-center text-sm font-bold tracking-wide text-amber-950 shadow-sm"
    >
      MEDIU DE TEST – DATELE NU SUNT OFICIALE
    </div>
  );
}
