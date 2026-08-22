import { Construction } from "lucide-react";

export default function Placeholder({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="panel grid min-h-[420px] place-items-center rounded-3xl p-8 text-center">
      <div>
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[#eaf6fd] text-[#2f6f95]">
          <Construction size={22} />
        </div>
        <p className="mono-label mt-5 text-[#2f6f95]">Drishti module</p>
        <h1 className="mt-3 font-display text-5xl">{title}</h1>
        <p className="mx-auto mt-4 max-w-md text-sm leading-6 text-[#6b8190]">
          {description}
        </p>
      </div>
    </div>
  );
}
