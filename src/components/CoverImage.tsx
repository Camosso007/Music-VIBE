import { useState } from 'react';
import { Disc3 } from 'lucide-react';

interface CoverImageProps {
  src?: string;
  alt: string;
  className?: string;
}

export function CoverImage({ src, alt, className = '' }: CoverImageProps) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div
        className={`flex items-center justify-center bg-gradient-to-br from-[#18181B] via-[#27272A] to-[#09090B] text-zinc-500 ${className}`}
        aria-label={alt}
      >
        <Disc3 className="w-1/3 h-1/3 opacity-60 text-[#8B5CF6]" />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={className}
    />
  );
}
