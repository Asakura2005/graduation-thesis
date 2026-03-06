import React, { useMemo } from "react";
import { Boxes, TrendingUp, CheckCircle2, AlertTriangle } from "lucide-react";

/**
 * shipments: array các vận đơn
 * Mình cố gắng đoán structure:
 * - s.status (string): Delivered / In Transit / Pending / ...
 * - s.total_value (string/number)
 */
const DashboardStats = ({ shipments = [] }) => {
  const stats = useMemo(() => {
    const totalValue = shipments.reduce(
      (acc, s) => acc + Number.parseFloat(s.total_value || 0),
      0,
    );

    // “Vận đơn hoạt động” = chưa Delivered (giống logic cũ)
    const activeCount = shipments.filter(
      (s) => s.status !== "Delivered",
    ).length;

    // “Giao hàng thành công” = Delivered
    const deliveredCount = shipments.filter(
      (s) => s.status === "Delivered",
    ).length;

    // “Cảnh báo hệ thống” = các status lỗi/issue (bạn chỉnh list này theo backend của bạn)
    const warningStatuses = new Set([
      "Issue",
      "Failed",
      "Problem",
      "Delayed",
      "Error",
      "Gặp sự cố",
      "Sự cố",
    ]);
    const warningCount = shipments.filter((s) =>
      warningStatuses.has(String(s.status || "").trim()),
    ).length;

    return {
      activeCount,
      totalValue,
      deliveredCount,
      warningCount,
    };
  }, [shipments]);

  // % tăng/giảm: mẫu bạn muốn có +12%, +18%...
  // Nếu bạn có dữ liệu theo ngày (createdAt) mình sẽ tính thật.
  // Hiện tại mình để mock để UI giống mẫu.
  const kpiList = [
    {
      label: "Vận đơn hoạt động",
      val: stats.activeCount,
      delta: "+12%",
      icon: Boxes,
      color: "#ffb24a", // amber
      extraRight: null,
    },
    {
      label: "Tổng giá trị (Mã hóa)",
      val: `$${stats.totalValue.toLocaleString()}`,
      delta: "",
      icon: TrendingUp,
      color: "#ffb24a", // amber
      // mini bar chart giống mẫu
      extraRight: <MiniBars />,
    },
    {
      label: "Giao hàng thành công",
      val: stats.deliveredCount,
      delta: "+18%",
      icon: CheckCircle2,
      color: "#3dde86", // green
      extraRight: null,
    },
    {
      label: "Cảnh báo hệ thống",
      val: stats.warningCount,
      delta: "Đang xử lý",
      icon: AlertTriangle,
      color: "#ff5d5d", // red
      extraRight: null,
    },
  ];

  return (
    <div className="row g-4 mb-4">
      {kpiList.map((stat, i) => (
        <div key={i} className="col-12 col-md-6 col-xl-3">
          <div className="glass p-4 d-flex align-items-center justify-content-between gap-3 h-100">
            <div className="d-flex align-items-center gap-3">
              <div
                className="p-3 rounded-circle"
                style={{
                  background: `${stat.color}15`,
                  border: `1px solid ${stat.color}30`,
                }}
              >
                <stat.icon style={{ color: stat.color }} size={24} />
              </div>

              <div>
                <p className="text-dim small mb-1 text-uppercase fw-semibold">
                  {stat.label}
                </p>

                <div className="d-flex align-items-end gap-2">
                  <h3 className="mb-0 fw-bold">{stat.val}</h3>

                  {stat.delta ? (
                    <span
                      className="fw-bold small"
                      style={{
                        color:
                          stat.label === "Cảnh báo hệ thống"
                            ? "rgba(244,239,230,.65)"
                            : "#3dde86",
                      }}
                    >
                      {stat.delta}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>

            {stat.extraRight ? (
              <div className="d-none d-sm-flex">{stat.extraRight}</div>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
};

function MiniBars() {
  // mini bar chart (decor) giống mẫu
  const bars = [10, 16, 12, 22, 18, 28, 20];
  return (
    <div className="kpi-mini-bars" aria-hidden="true">
      {bars.map((h, idx) => (
        <span key={idx} style={{ height: `${h}px` }} />
      ))}
    </div>
  );
}

export default DashboardStats;
