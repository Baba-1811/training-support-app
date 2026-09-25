import Image from "next/image";
import type { ExerciseImage as ExerciseImageData } from "@/lib/exercises/assets";

// The caller sets size / aspect ratio / rounding through `className`. Exercise photos are landscape and fill the frame;
// muscle-chart fallbacks are portrait, so they are shown whole (contain) on a neutral background rather than stretched or cropped.
export function ExerciseImage({ image, alt = "", sizes, priority = false, className = "" }: {
  image: ExerciseImageData; alt?: string; sizes: string; priority?: boolean; className?: string;
}) {
  return <div className={`relative overflow-hidden bg-slate-100 ${className}`}>
    <Image src={image.src} alt={alt} fill sizes={sizes} priority={priority}
      className={image.kind === "muscle" ? "object-contain" : "object-cover"} />
  </div>;
}
