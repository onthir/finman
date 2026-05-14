"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

// Vibrant, high-contrast palette tuned for a light background.
const COLORS = [
  "#6366f1", // indigo
  "#10b981", // emerald
  "#f59e0b", // amber
  "#ef4444", // red
  "#8b5cf6", // violet
  "#06b6d4", // cyan
  "#f97316", // orange
  "#ec4899", // pink
  "#84cc16", // lime
  "#14b8a6", // teal
];

const tooltipStyle = {
  background: "#ffffff",
  border: "1px solid #e7e5e4",
  borderRadius: 8,
  fontSize: 12,
  boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
  color: "#111111",
};

const fmt = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export function MonthlyBars({
  data,
  categories,
}: {
  data: Array<Record<string, number | string>>;
  categories: string[];
}) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
        <CartesianGrid stroke="#f1f0ec" vertical={false} />
        <XAxis
          dataKey="month"
          stroke="#a8a29e"
          fontSize={11}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          stroke="#a8a29e"
          fontSize={11}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => fmt.format(Number(v))}
        />
        <Tooltip
          contentStyle={tooltipStyle}
          cursor={{ fill: "#f5f5f4" }}
          formatter={(v: number) => fmt.format(v)}
        />
        <Legend
          wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
          iconType="circle"
        />
        {categories.map((c, i) => (
          <Bar
            key={c}
            dataKey={c}
            stackId="spend"
            fill={COLORS[i % COLORS.length]}
            radius={i === categories.length - 1 ? [6, 6, 0, 0] : 0}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function CategoryPie({
  data,
}: {
  data: Array<{ category: string; total: number }>;
}) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <PieChart>
        <Pie
          data={data}
          dataKey="total"
          nameKey="category"
          outerRadius={100}
          innerRadius={60}
          paddingAngle={2}
          stroke="#ffffff"
          strokeWidth={2}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(v: number) => fmt.format(v)}
        />
        <Legend
          wrapperStyle={{ fontSize: 11 }}
          iconType="circle"
          layout="vertical"
          align="right"
          verticalAlign="middle"
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
