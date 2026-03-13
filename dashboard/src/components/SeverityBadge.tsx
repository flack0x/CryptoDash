"use client";

const colors: Record<string, string> = {
  critical: "bg-red-600 text-white",
  high: "bg-red-500/20 text-red-400 border border-red-500/30",
  medium: "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30",
  low: "bg-gray-500/20 text-gray-400 border border-gray-500/30",
};

export default function SeverityBadge({ severity }: { severity: string }) {
  return (
    <span
      className={`inline-block rounded px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${colors[severity] ?? colors.low}`}
    >
      {severity}
    </span>
  );
}
