import { Loader2 } from 'lucide-react';

export default function PMLoading() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-muted-foreground">Se incarca PM Dashboard...</p>
      </div>
    </div>
  );
}
