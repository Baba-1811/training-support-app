import Image from "next/image";
import Link from "next/link";

// Training hub entry to the Exercise Library. Deliberately a quiet white row: starting / resuming a workout stays the primary action.
export function ExerciseLibraryLink() {
  return <Link href="/exercises" className="flex min-h-16 items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm active:bg-slate-50">
    <span className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-slate-100">
      <Image src="/images/muscles/body.jpg" alt="" fill sizes="44px" className="object-cover" />
    </span>
    <span className="min-w-0 flex-1">
      <span className="block text-base font-semibold text-slate-900">種目を探す</span>
      <span className="block truncate text-xs text-slate-500">部位から選んで、やり方を確認できます</span>
    </span>
    <span aria-hidden className="shrink-0 text-slate-300">›</span>
  </Link>;
}
