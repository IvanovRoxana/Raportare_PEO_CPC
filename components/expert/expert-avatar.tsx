'use client';

import { useEffect, useState } from 'react';
import { getUrl } from 'aws-amplify/storage';
import { cn } from '@/lib/utils';
import { getExpertAvatarSource, getExpertInitials } from '@/lib/expert-avatar-utils';
import type { Expert } from '@/lib/types';

type ExpertAvatarProps = {
  expert: Pick<Expert, 'id' | 'name' | 'avatarUrl'>;
  className?: string;
  imageClassName?: string;
  fallbackClassName?: string;
};

function isDirectImageSource(value: string) {
  return value.startsWith('/') || value.startsWith('http://') || value.startsWith('https://') || value.startsWith('data:');
}

export function ExpertAvatar({ expert, className, imageClassName, fallbackClassName }: ExpertAvatarProps) {
  const source = getExpertAvatarSource(expert);
  const [resolvedSource, setResolvedSource] = useState(source && isDirectImageSource(source) ? source : undefined);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);

    if (!source) {
      setResolvedSource(undefined);
      return;
    }

    if (isDirectImageSource(source)) {
      setResolvedSource(source);
      return;
    }

    let cancelled = false;
    getUrl({ path: source })
      .then((result) => {
        if (!cancelled) setResolvedSource(result.url.toString());
      })
      .catch(() => {
        if (!cancelled) setResolvedSource(undefined);
      });

    return () => {
      cancelled = true;
    };
  }, [source]);

  return (
    <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#eaf3fb] text-xs font-bold text-primary', className)}>
      {resolvedSource && !failed ? (
        <img
          src={resolvedSource}
          alt={expert.name}
          className={cn('h-full w-full object-cover', imageClassName)}
          onError={() => setFailed(true)}
        />
      ) : (
        <span className={fallbackClassName}>{getExpertInitials(expert.name)}</span>
      )}
    </span>
  );
}
