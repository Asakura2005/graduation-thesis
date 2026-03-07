import React from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useLanguage } from "../i18n/LanguageContext";

const TransportChart = ({ shipments = [] }) => {
  const { t } = useLanguage();

  const dayValues = [1, 2, 3, 4, 5, 6, 0]; // Mon-Sun
  const dayLabels = t('chart.days');

  const data = dayValues.map((dayVal, idx) => {
    const count = shipments.filter((s) => {
      if (!s.shipment_date) return false;
      const d = new Date(s.shipment_date).getDay();
      return d === dayVal;
    }).length;

    return {
      day: Array.isArray(dayLabels) ? dayLabels[idx] : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][idx],
      shipments: count,
    };
  });

  return (
    <div className="glass p-4">
      <h6 className="text-white mb-3">{t('chart.title')}</h6>

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
