export default function PageHeading({
  description,
  eyebrow = "Vista operativa",
  title
}: {
  description: string;
  eyebrow?: string;
  title: string;
}) {
  return (
    <header className="rounded-md border border-sky-400/15 bg-[#07111f] p-4 sm:p-5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-300">{eyebrow}</p>
      <h1 className="mt-1 text-xl font-bold tracking-tight sm:text-2xl">{title}</h1>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">{description}</p>
    </header>
  );
}
