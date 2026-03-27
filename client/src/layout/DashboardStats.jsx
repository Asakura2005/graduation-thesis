import React, { useMemo } from "react";
import { Boxes, TrendingUp, CheckCircle2, AlertTriangle } from "lucide-react";
import { useLanguage } from "../i18n/LanguageContext";

/**
 * shipments: array các vận đơn
 */
const DashboardStats = ({ shipments = [] }) => {
  const { t } = useLanguage();

  const stats = useMemo(() => {
    const totalValue = shipments.reduce(
      (acc, s) => acc + Number.parseFloat(s.total_value || 0),
      0,
    );

    const pendingApprovalCount = shipments.filter(
      (s) => s.status === "Pending Approval",
    ).length;

    const approvedCount = shipments.filter(
      (s) => s.status === "Approved",
    ).length;

    const deliveredCount = shipments.filter(
      (s) => s.status === "Delivered",
    ).length;

    const warningStatuses = new Set([
      "Issue",
      "Failed",
      "Problem",
      "Delayed",
      "Error",
      "Rejected",
      "Gặp sự cố",
      "Sự cố",
    ]);
    const warningCount = shipments.filter((s) =>
      warningStatuses.has(String(s.status || "").trim()),
    ).length;

    return {
      pendingApprovalCount,
      approvedCount,
      totalValue,
      deliveredCount,
      warningCount,
    };
  }, [shipments]);

  const kpiList = [
    {
      label: t('stats.activeShipments') || 'Chờ duyệt',
      val: stats.pendingApprovalCount,
      delta: "",
      icon: Boxes,
      color: "#ffb24a",
      extraRight: null,
      isWarning: false,
    },
    {
      label: t('stats.totalValue'),
      val: `$${stats.totalValue.toLocaleString()}`,
      delta: "",
      icon: TrendingUp,
      color: "#ffb24a",
      extraRight: <MiniBars />,
      isWarning: false,
    },
    {
      label: t('stats.delivered'),
      val: stats.deliveredCount,
      delta: "+18%",
      icon: CheckCircle2,
      color: "#3dde86",
      extraRight: null,
      isWarning: false,
    },
    {
      label: t('stats.warnings'),
      val: stats.warningCount,
      delta: t('stats.processing'),
      icon: AlertTriangle,
      color: "#ff5d5d",
      extraRight: null,
      isWarning: true,
    },
  ];

  return (
    <div className="row g-4 mb-4">
      {kpiList.map((stat, i) => (
        <div key={i} className="col-12 col-md-6 col-xl-3">
          <div className="glass p-3 d-flex align-items-center justify-content-between gap-2 h-100">
            <div className="d-flex align-items-center gap-2">
              <div
                className="p-2 rounded-circle flex-shrink-0"
                style={{
                  background: `${stat.color}15`,
                  border: `1px solid ${stat.color}30`,
                }}
              >
                <stat.icon style={{ color: stat.color }} size={18} />
              </div>

              <div>
                <p className="text-dim mb-1 text-uppercase fw-semibold"
                   style={{ fontSize: '0.65rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '140px' }}>
                  {stat.label}
                </p>

                <div className="d-flex align-items-end gap-2">
                  <h5 className="mb-0 fw-bold">{stat.val}</h5>

                  {stat.delta ? (
                    <span
                      className="fw-semibold"
                      style={{
                        fontSize: '0.7rem',
                        color: stat.isWarning
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
