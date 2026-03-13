"use client";

import { timeAgo } from "@/lib/format";

export default function RefreshIndicator({ lastUpdated }: { lastUpdated: string }) {
  return (
    <div className="text-sm text-gray-500">
      Last updated: {timeAgo(lastUpdated)}
    </div>
  );
}
