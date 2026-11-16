"use client";

/** Small presentational pieces shared by both referral dashboards. */

export function Card({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-hairline bg-surface p-5">
      {title && <h2 className="text-sm font-semibold mb-4">{title}</h2>}
      {children}
    </section>
  );
}

export function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="rounded-xl border border-hairline bg-surface px-4 py-3">
      <p className="text-[11px] uppercase tracking-wide text-subtle">{label}</p>
      <p className="text-xl font-semibold mt-1 tabular-nums">{value}</p>
      {hint && <p className="text-[11px] text-subtle mt-0.5">{hint}</p>}
    </div>
  );
}

export function Table({ columns, rows }: { columns: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-left text-subtle">
            {columns.map((column) => (
              <th key={column} className="font-medium py-2 pr-4 whitespace-nowrap border-b border-hairline">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="py-6 text-center text-subtle">
                Nothing here yet.
              </td>
            </tr>
          )}
          {rows.map((row, index) => (
            <tr key={index} className="border-b border-hairline/60">
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className="py-2 pr-4 align-top whitespace-nowrap">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[11px] uppercase tracking-wide text-subtle mb-1">{label}</span>
      {children}
    </label>
  );
}

export const inputClass =
  "w-full rounded-lg px-3 py-2 text-sm bg-background border border-hairline text-foreground placeholder:text-subtle focus:outline-none focus:border-red-500/40";

export const buttonClass =
  "rounded-full bg-red-500 hover:bg-red-600 disabled:opacity-60 text-white text-sm font-semibold px-4 py-2 transition-colors";

export const secondaryButtonClass =
  "rounded-full border border-hairline hover:border-hairline-strong text-sm px-3 py-1.5 transition-colors";

/** Money comes from the API already formatted per currency. */
export function MoneyLines({ amounts }: { amounts: Record<string, number> }) {
  const entries = Object.entries(amounts);
  if (entries.length === 0) return <span className="text-subtle">0.00</span>;
  return (
    <span className="tabular-nums">
      {entries.map(([currency, minor]) => `${currency} ${(minor / 100).toFixed(2)}`).join(" · ")}
    </span>
  );
}

export function DateRangePicker({
  from,
  to,
  onChange,
}: {
  from: string;
  to: string;
  onChange: (next: { from: string; to: string }) => void;
}) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <Field label="From">
        <input
          type="date"
          value={from}
          onChange={(event) => onChange({ from: event.target.value, to })}
          className={inputClass}
        />
      </Field>
      <Field label="To">
        <input
          type="date"
          value={to}
          onChange={(event) => onChange({ from, to: event.target.value })}
          className={inputClass}
        />
      </Field>
    </div>
  );
}

export function ExportButtons({ onExport }: { onExport: (format: "csv" | "xlsx" | "pdf") => void }) {
  return (
    <div className="flex gap-2">
      {(["csv", "xlsx", "pdf"] as const).map((format) => (
        <button key={format} type="button" className={secondaryButtonClass} onClick={() => onExport(format)}>
          {format.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
