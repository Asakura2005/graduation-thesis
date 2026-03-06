import React from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const TransportChart = ({ shipments = [] }) => {
  const days = [
    { label: "T2", value: 1 },
    { label: "T3", value: 2 },
    { label: "T4", value: 3 },
    { label: "T5", value: 4 },
    { label: "T6", value: 5 },
    { label: "T7", value: 6 },
    { label: "CN", value: 0 },
  ];

  const data = days.map((day) => {
    const count = shipments.filter((s) => {
      if (!s.shipment_date) return false;

      const d = new Date(s.shipment_date).getDay();
      return d === day.value;
    }).length;

    return {
      day: day.label,
      shipments: count,
    };
  });
  return (
    <div className="glass p-4">
      <h6 className="text-white mb-3">Xu hướng vận chuyển tuần này</h6>

      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data}>
          <XAxis dataKey="day" stroke="#94a3b8" />
          <YAxis stroke="#94a3b8" />
          <Tooltip />
          <Line
            type="monotone"
            dataKey="shipments"
            stroke="#f59e0b"
            strokeWidth={3}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default TransportChart;
