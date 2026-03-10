import React, { useState, useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Area,
  AreaChart,
} from "recharts";
import { ChevronLeft, ChevronRight, Calendar } from "lucide-react";
import { useLanguage } from "../i18n/LanguageContext";

const TransportChart = ({ shipments = [] }) => {
  const { t, language } = useLanguage();

  // weekOffset: 0 = tuần hiện tại, -1 = tuần trước
  const [weekOffset, setWeekOffset] = useState(0);

  // Tính ngày bắt đầu & kết thúc của tuần được chọn (Thứ 2 → Chủ Nhật)
  const { weekStart, weekEnd, weekDays } = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Tìm thứ 2 của tuần hiện tại
    const dayOfWeek = today.getDay(); // 0=CN, 1=T2, ...
    const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const mondayThisWeek = new Date(today);
    mondayThisWeek.setDate(today.getDate() + diffToMonday);

    // Áp dụng offset tuần
    const weekStart = new Date(mondayThisWeek);
    weekStart.setDate(mondayThisWeek.getDate() + weekOffset * 7);

    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);

    // Tạo 7 ngày trong tuần
    const weekDays = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart);
      d.setDate(weekStart.getDate() + i);
      weekDays.push(d);
    }

    return { weekStart, weekEnd, weekDays };
  }, [weekOffset]);

  // Tạo data cho biểu đồ
  const data = useMemo(() => {
    const dayLabels = t("chart.days");
    const shortDays = Array.isArray(dayLabels)
      ? dayLabels
      : ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

    return weekDays.map((date, idx) => {
      const dateStr = `${date.getDate().toString().padStart(2, "0")}/${(date.getMonth() + 1).toString().padStart(2, "0")}`;

      // Đếm vận đơn trong ngày này
      const count = shipments.filter((s) => {
        if (!s.shipment_date) return false;
        const sd = new Date(s.shipment_date);
        return (
          sd.getFullYear() === date.getFullYear() &&
          sd.getMonth() === date.getMonth() &&
          sd.getDate() === date.getDate()
        );
      }).length;

      return {
        label: `${shortDays[idx]}\n${dateStr}`,
        shortDay: shortDays[idx],
        date: dateStr,
        fullDate: date.toLocaleDateString(language === "vi" ? "vi-VN" : "en-US", {
          weekday: "long",
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        }),
        shipments: count,
      };
    });
  }, [weekDays, shipments, t, language]);

  // Format nhãn tuần
  const weekLabel = useMemo(() => {
    const fmt = (d) =>
      `${d.getDate().toString().padStart(2, "0")}/${(d.getMonth() + 1).toString().padStart(2, "0")}`;
    return `${fmt(weekStart)} - ${fmt(weekEnd)}`;
  }, [weekStart, weekEnd]);

  // Chỉ cho phép xem tuần trước (max 1 tuần trước = -1)
  const canGoPrev = weekOffset > -1;
  const canGoNext = weekOffset < 0;

  // Custom Tooltip
  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const item = payload[0].payload;
    return (
      <div
        style={{
          background: "rgba(15, 23, 42, 0.95)",
          border: "1px solid rgba(245, 158, 11, 0.3)",
          borderRadius: 10,
          padding: "10px 14px",
          backdropFilter: "blur(10px)",
        }}
      >
        <div style={{ color: "#94a3b8", fontSize: 11, marginBottom: 4 }}>
          {item.fullDate}
        </div>
        <div style={{ color: "#f59e0b", fontSize: 16, fontWeight: 700 }}>
          {item.shipments}{" "}
          <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 400 }}>
            {language === "vi" ? "vận đơn" : "shipments"}
          </span>
        </div>
      </div>
    );
  };

  // Custom X-axis tick to show day name + date on 2 lines
  const CustomXAxisTick = ({ x, y, payload }) => {
    const parts = payload.value.split("\n");
    return (
      <g transform={`translate(${x},${y})`}>
        <text
          x={0}
          y={0}
          dy={12}
          textAnchor="middle"
          fill="#94a3b8"
          fontSize={12}
          fontWeight={600}
        >
          {parts[0]}
        </text>
        <text
          x={0}
          y={0}
          dy={27}
          textAnchor="middle"
          fill="#64748b"
          fontSize={10}
        >
          {parts[1]}
        </text>
      </g>
    );
  };

  return (
    <div className="glass p-4">
      {/* Header with navigation */}
      <div className="d-flex align-items-center justify-content-between mb-3">
        <div className="d-flex align-items-center gap-2">
          <Calendar size={16} className="text-gold" />
          <h6 className="text-white mb-0 fw-bold">{t("chart.title")}</h6>
        </div>

        <div className="d-flex align-items-center gap-2">
          {/* Nút trang trước */}
          <button
            className="btn btn-sm d-flex align-items-center justify-content-center"
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: canGoPrev
                ? "rgba(245, 158, 11, 0.1)"
                : "rgba(255,255,255,0.03)",
              border: `1px solid ${canGoPrev ? "rgba(245, 158, 11, 0.3)" : "rgba(255,255,255,0.06)"}`,
              color: canGoPrev ? "#f59e0b" : "#475569",
              cursor: canGoPrev ? "pointer" : "not-allowed",
              transition: "all 0.2s ease",
            }}
            onClick={() => canGoPrev && setWeekOffset((o) => o - 1)}
            disabled={!canGoPrev}
            title={t("chart.prevWeek")}
          >
            <ChevronLeft size={16} />
          </button>

          {/* Label tuần */}
          <div
            className="px-3 py-1 d-flex align-items-center gap-2"
            style={{
              background: "rgba(245, 158, 11, 0.08)",
              border: "1px solid rgba(245, 158, 11, 0.2)",
              borderRadius: 8,
              minWidth: 140,
              justifyContent: "center",
            }}
          >
            <span
              style={{
                color: "#f59e0b",
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: 0.3,
              }}
            >
              {weekLabel}
            </span>
          </div>

          {/* Nút trang sau */}
          <button
            className="btn btn-sm d-flex align-items-center justify-content-center"
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: canGoNext
                ? "rgba(245, 158, 11, 0.1)"
                : "rgba(255,255,255,0.03)",
              border: `1px solid ${canGoNext ? "rgba(245, 158, 11, 0.3)" : "rgba(255,255,255,0.06)"}`,
              color: canGoNext ? "#f59e0b" : "#475569",
              cursor: canGoNext ? "pointer" : "not-allowed",
              transition: "all 0.2s ease",
            }}
            onClick={() => canGoNext && setWeekOffset((o) => o + 1)}
            disabled={!canGoNext}
            title={t("chart.nextWeek")}
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* Week indicator */}
      <div className="mb-3 d-flex align-items-center gap-2">
        <span
          className="badge"
          style={{
            background:
              weekOffset === 0
                ? "rgba(16, 185, 129, 0.15)"
                : "rgba(99, 102, 241, 0.15)",
            color: weekOffset === 0 ? "#10b981" : "#818cf8",
            border: `1px solid ${weekOffset === 0 ? "rgba(16, 185, 129, 0.3)" : "rgba(99, 102, 241, 0.3)"}`,
            padding: "4px 10px",
            borderRadius: 6,
            fontSize: 11,
            fontWeight: 600,
          }}
        >
          {weekOffset === 0 ? t("chart.thisWeek") : t("chart.lastWeek")}
        </span>
        <span style={{ color: "#64748b", fontSize: 11 }}>
          {t("chart.totalShipments")}: {data.reduce((sum, d) => sum + d.shipments, 0)}
        </span>
      </div>

      {/* Chart */}
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={data}>
          <defs>
            <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.25} />
              <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="rgba(255,255,255,0.04)"
            vertical={false}
          />
          <XAxis
            dataKey="label"
            stroke="#94a3b8"
            tick={<CustomXAxisTick />}
            height={45}
            tickLine={false}
            axisLine={{ stroke: "rgba(255,255,255,0.08)" }}
          />
          <YAxis
            stroke="#94a3b8"
            fontSize={11}
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
          />
          <Tooltip content={<CustomTooltip />} />
          <Area
            type="monotone"
            dataKey="shipments"
            stroke="#f59e0b"
            strokeWidth={2.5}
            fill="url(#chartGradient)"
            dot={{
              r: 4,
              fill: "#0f172a",
              stroke: "#f59e0b",
              strokeWidth: 2,
            }}
            activeDot={{
              r: 6,
              fill: "#f59e0b",
              stroke: "#0f172a",
              strokeWidth: 2,
            }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

export default TransportChart;
