import Image from "next/image";
import Link from "next/link";
import { EXERCISE_CATEGORIES, type CategoryFilter as Filter } from "@/lib/exercises/categories";

// Plain links (`/exercises`, `/exercises?muscle=chest`): the selection lives in the URL and the list is filtered on the
// server, so this needs no client state. Two compact rows of four keep all seven choices visible on a phone.
export function CategoryFilter({ selected }: { selected: Filter }) {
  return <nav aria-label="部位で絞り込む">
    <ul className="grid grid-cols-4 gap-2">
      {EXERCISE_CATEGORIES.map((category) => {
        const isSelected = category.slug === selected;
        return <li key={category.slug}>
          <Link href={category.slug === "all" ? "/exercises" : `/exercises?muscle=${category.slug}`}
            aria-current={isSelected ? "page" : undefined}
            className={`flex min-h-[4.5rem] flex-col items-center justify-center gap-1 rounded-xl border p-1.5 ${isSelected
              ? "border-primary bg-primary text-white shadow-sm"
              : "border-slate-200 bg-white text-slate-700 active:bg-slate-50"}`}>
            <span className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-slate-100">
              <Image src={category.imageSrc} alt="" fill sizes="44px" className="object-cover" />
            </span>
            <span className="text-xs font-semibold leading-none">{category.label}</span>
          </Link>
        </li>;
      })}
    </ul>
  </nav>;
}
