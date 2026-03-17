"use client";

import { useState } from "react";
import type { SystemHealth as SystemHealthType } from "@/lib/types";
import { timeAgo } from "@/lib/format";

const statusDot: Record<string, string> = {
  green: "bg-green-400",
  yellow: "bg-yellow-400",
  red: "bg-red-400",
};

const statusText: Record<string, string> = {
  green: "Pipeline healthy",
  yellow: "Some sources delayed",
  red: "Sources stale",
};

export default function SystemHealth({ health }: { health: SystemHealthType }) {
  const [open, setOpen] = useState(false);

  const staleCount = health.sources.filter((s) => s.status !== "green").length;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-md bg-gray-800/50 px-2.5 py-1.5 text-xs text-gray-400 hover:bg-gray-800 transition-colors"
      >
        <span className={`inline-block h-2 w-2 rounded-full ${statusDot[health.overallStatus]} ${health.overallStatus !== "green" ? "animate-pulse" : ""}`} />
        <span>
          {staleCount > 0 ? `${staleCount} source${staleCount > 1 ? "s" : ""} stale` : statusText[health.overallStatus]}
        </span>
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-72 rounded-lg border border-gray-700 bg-gray-900 p-3 shadow-xl">
          <div className="mb-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">
            Data Pipeline
          </div>
          <div className="space-y-1.5">
            {health.sources.map((src) => (
              <div key={src.name} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className={`inline-block h-1.5 w-1.5 rounded-full ${statusDot[src.status]}`} />
                  <span className="text-gray-300">{src.name}</span>
                </div>
                <span className="text-gray-500 tabular-nums">
                  {src.lastTs ? timeAgo(src.lastTs) : "never"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
