"use client";

import { useState } from "react";
import Image from "next/image";
import { ImageIcon } from "lucide-react";

export function ProductThumbnail({ src, name }: { src: string | null; name: string }) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  return (
    <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-stone-200 bg-stone-50">
      {src && failedSrc !== src ? (
        <Image
          src={src}
          alt={name}
          width={48}
          height={48}
          unoptimized
          className="h-full w-full object-contain"
          onError={() => setFailedSrc(src)}
        />
      ) : (
        <span role="img" aria-label={`No image for ${name}`} className="flex h-full w-full items-center justify-center text-stone-400">
          <ImageIcon className="h-6 w-6" aria-hidden="true" />
        </span>
      )}
    </span>
  );
}
