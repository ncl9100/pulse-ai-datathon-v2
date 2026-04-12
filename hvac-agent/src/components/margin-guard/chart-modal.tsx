"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Cell,
} from "recharts";

interface SOVLine {
  description: string;
  estimated: number;
  actual: number;
  variance: number;
}

interface ChartModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectName: string;
  projectId: string;
  sovLines: SOVLine[];
}

function formatCurrency(value: number): string {
  if (Math.abs(value) >= 1000000) {
    return `$${(value / 1000000).toFixed(1)}M`;
  }
  return `$${Math.round(value / 1000)}K`;
}

function truncateLabel(label: string, maxLength: number = 18): string {
  if (label.length <= maxLength) return label;
  return label.slice(0, maxLength - 1) + "\u2026";
}

export function ChartModal({
  isOpen,
  onClose,
  projectName,
  projectId,
  sovLines,
}: ChartModalProps) {
  const sortedLines = [...sovLines]
    .sort((a, b) => b.variance - a.variance)
    .slice(0, 5);

  const chartData = sortedLines.map((line) => ({
    name: truncateLabel(line.description),
    fullName: line.description,
    estimated: line.estimated,
    actual: line.actual,
    isOverBudget: line.actual > line.estimated,
  }));

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "auto";
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-white/80 backdrop-blur-sm transition-opacity duration-300 ease-in-out"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-2xl mx-4 bg-white rounded-xl shadow-2xl p-8 transition-all duration-300 ease-in-out">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 text-gray-400 hover:text-gray-600 transition-colors rounded-md hover:bg-gray-100"
        >
          <X className="h-5 w-5" />
        </button>
        <div className="mb-6">
          <h2 className="text-xl font-semibold text-foreground pr-8">
            {projectId} | {projectName}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Budget vs Actual — Top Variances
          </p>
        </div>
        <div className="flex items-center justify-end gap-6 mb-4 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-sm bg-gray-300" />
            <span className="text-muted-foreground">Estimated</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-sm bg-rose-400" />
            <span className="text-muted-foreground">Actual (over budget)</span>
          </div>
        </div>
        <div className="h-80 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              margin={{ top: 10, right: 10, left: 10, bottom: 60 }}
              barCategoryGap="20%"
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 11, fill: "#6b7280" }}
                tickLine={false}
                axisLine={{ stroke: "#e5e7eb" }}
                angle={-35}
                textAnchor="end"
                height={60}
                interval={0}
              />
              <YAxis
                tickFormatter={formatCurrency}
                tick={{ fontSize: 11, fill: "#6b7280" }}
                tickLine={false}
                axisLine={false}
                width={60}
              />
              <Bar dataKey="estimated" fill="#d1d5db" radius={[4, 4, 0, 0]} name="Estimated" />
              <Bar dataKey="actual" radius={[4, 4, 0, 0]} name="Actual">
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.isOverBudget ? "#fb7185" : "#374151"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
