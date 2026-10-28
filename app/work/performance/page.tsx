"use client";

import { TrendingUp } from "lucide-react";
import { EmptyState } from "@/app/_components/empty-state";

export default function PerformancePage() {
  return (
    <div className="page-content performance-page">
      <section className="welcome-row">
        <div>
          <h1>Performance</h1>
          <p className="welcome-subtitle">Team performance, attendance, and activity records.</p>
        </div>
      </section>

      <EmptyState
        icon={<TrendingUp size={24} />}
        title="Work in progress"
        description="This section is currently under development. Performance tracking, attendance records, and team analytics will be available here."
      />
    </div>
  );
}
