"use client";

import type { MarketMood as MarketMoodType } from "@/lib/types";

function getMoodColor(value: number): string {
  if (value <= 25) return "bg-red-500";
  if (value <= 45) return "bg-yellow-500";
  if (value <= 55) return "bg-gray-400";
  if (value <= 75) return "bg-green-500";
  return "bg-green-400";
}

function getMoodTextColor(value: number): string {
  if (value <= 25) return "text-red-400";
  if (value <= 45) return "text-yellow-400";
  if (value <= 55) return "text-gray-400";
  if (value <= 75) return "text-green-400";
  return "text-green-300";
}

export default function MarketMood({ mood }: { mood: MarketMoodType | null }) {
  if (!mood) {
    return (
      <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-gray-400">
          Market Mood (Fear & Greed)
        </h2>
        <p className="text-gray-500">No data yet</p>
      </div>
    );
  }

  const pct = mood.value;
  const color = getMoodColor(pct);
  const textColor = getMoodTextColor(pct);

  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-400">
        Market Mood (Fear & Greed)
      </h2>
      <div className="flex items-center gap-4">
        <span className={`text-3xl font-bold ${textColor}`}>{pct}</span>
        <div className="flex-1">
          <span className={`text-lg font-medium ${textColor}`}>{mood.label}</span>
          <div className="mt-2 h-3 w-full rounded-full bg-gray-800">
            <div
              className={`h-3 rounded-full ${color} transition-all duration-500`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
