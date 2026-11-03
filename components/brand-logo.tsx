import Image from "next/image";
import { cn } from "@/lib/cn";

export function BrandLogo({ className, tagline = false }: { className?: string; tagline?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2 rounded-lg bg-brand-navy px-2 py-1.5 text-brand-lime", className)}>
      <Image src="/brand/mark.png" width={44} height={44} alt="" className="h-10 w-10 shrink-0 rounded" />
      <span className="flex flex-col gap-1.5">
        <span className="brand-wordmark text-xl">PickleUNLTD</span>
        {tagline && <span className="text-[8px] font-bold uppercase tracking-[0.1em]">Paddles | Apparel | Shoes | Accessories</span>}
      </span>
    </span>
  );
}
