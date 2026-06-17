import type { ReactNode } from "react";

type Row = Record<string, unknown>;

function value(row: Row, key: string) {
  const item = row[key];
  if (item === null || item === undefined) return "-";
  if (typeof item === "object") return JSON.stringify(item);
  return String(item);
}

export function DataTable({ columns, rows }: { columns: Array<[string, string]>; rows: Row[] }) {
  return (
    <>
      <div className="space-y-2 md:hidden">
        {rows.length ? rows.slice(0, 30).map((row, index) => (
          <article key={String(row.id ?? index)} className="rounded border border-sky-400/10 bg-slate-950/45 p-3">
            <dl className="space-y-2">
              {columns.map(([key, label]) => (
                <div key={key} className="grid grid-cols-[minmax(90px,0.8fr)_minmax(0,1.2fr)] gap-3 text-xs">
                  <dt className="text-slate-500">{label}</dt>
                  <dd className="break-words text-right text-slate-300" title={value(row, key)}>{value(row, key)}</dd>
                </div>
              ))}
            </dl>
          </article>
        )) : <p className="rounded border border-sky-400/10 px-3 py-6 text-center text-xs text-slate-500">Sin datos todavía</p>}
      </div>
      <div className="hidden overflow-x-auto rounded border border-sky-400/10 md:block">
        <table className="w-full min-w-[720px] text-left text-xs">
        <thead className="bg-slate-950/70 text-slate-500"><tr>{columns.map(([key, label]) => <th key={key} className="px-3 py-2">{label}</th>)}</tr></thead>
        <tbody>{rows.length ? rows.slice(0, 30).map((row, index) => <tr key={String(row.id ?? index)} className="border-t border-sky-400/10">{columns.map(([key]) => <td key={key} className="max-w-[360px] truncate px-3 py-2 text-slate-300" title={value(row, key)}>{value(row, key)}</td>)}</tr>) : <tr><td colSpan={columns.length} className="px-3 py-6 text-center text-slate-500">Sin datos todavía</td></tr>}</tbody>
        </table>
      </div>
    </>
  );
}

export function ViewSection({ children, description, id, title }: { children: ReactNode; description: string; id?: string; title: string }) {
  return <section id={id} className="scroll-mt-4 rounded-md border border-sky-400/15 bg-[#07111f] p-3 sm:p-4"><h2 className="text-base font-semibold">{title}</h2><p className="mb-4 mt-1 max-w-3xl text-xs leading-5 text-slate-500">{description}</p>{children}</section>;
}

export function stringRows(rows: string[][], keys: string[]) {
  return rows.map((row, index) => Object.fromEntries([["id", row[0] || index], ...keys.map((key, itemIndex) => [key, row[itemIndex]])]));
}
