"use client";

import type { MarketMood as MarketMoodType } from "@/lib/types";
import { timeAgo } from "@/lib/format";

function getMoodColor(value: number): string {
  if (value <= 25) return "bg-red-500";
  if (value <= 45) return "bg-orange-500";
  if (value <= 55) return "bg-gray-400";
  if (value <= 75) return "bg-green-500";
  return "bg-emerald-400";
}

function getMoodTextColor(value: number): string {
  if (value <= 25) return "text-red-400";
  if (value <= 45) return "text-orange-400";
  if (value <= 55) return "text-gray-400";
  if (value <= 75) return "text-green-400";
  return "text-emerald-300";
}

function getMoodEmphasis(value: number): string {
  if (value <= 20) return "border-red-500/40";
  if (value >= 80) return "border-emerald-500/40";
  return "border-gray-800";
}

export default function MarketMood({ mood }: { mood: MarketMoodType | null }) {
  if (!mood) {
    return (
      <div className="rounded-lg border border-gray-800 bg-gray-900 p-5">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-gray-400">
          Market Mood (Fear & Greed)
        </h2>
        <p className="text-gray-500">Waiting for data...</p>
      </div>
    );
  }

  const pct = mood.value;
  const color = getMoodColor(pct);
  const textColor = getMoodTextColor(pct);
  const borderColor = getMoodEmphasis(pct);

  return (
    <div className={`rounded-lg border ${borderColor} bg-gray-900 p-5`}>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400">
          Market Mood (Fear & Greed)
        </h2>
        <span className="text-xs text-gray-600">{timeAgo(mood.ts)}</span>
      </div>
      <div className="flex items-center gap-5">
        <div className="flex flex-col items-center">
          <span className={`text-4xl font-bold tabular-nums ${textColor}`}>{pct}</span>
          <span className="text-xs text-gray-500 mt-0.5">/ 100</span>
        </div>
        <div className="flex-1">
          <span className={`text-lg font-semibold ${textColor}`}>{mood.label}</span>
          <div className="mt-2.5 h-3 w-full rounded-full bg-gray-800 overflow-hidden">
            <div
              className={`h-3 rounded-full ${color} transition-all duration-700 ease-out`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="mt-1 flex justify-between text-xs text-gray-600">
            <span>Extreme Fear</span>
            <span>Extreme Greed</span>
          </div>
        </div>
      </div>
    </div>
  );
}
