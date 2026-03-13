import React from "react";
import { LogOut, Bell, Settings, User, Search, Grid } from "lucide-react";
import { useLanguage } from "../i18n/LanguageContext";
import NotificationPanel from "./NotificationPanel";

const Header = ({ user, handleLogout, setActiveTab }) => {
  const { t } = useLanguage();

  return (
    <header
      className="d-flex justify-content-between align-items-center py-3 px-4 glass border-0 rounded-0 mb-4"
      style={{ zIndex: 900 }}
    >
      {/* LEFT */}
      <div className="d-flex align-items-center gap-3">
        <h4 className="mb-0 fw-bold text-white">{t('sidebar.dashboard')}</h4>
      </div>

      {/* RIGHT */}
      <div className="d-flex align-items-center gap-4">
        {/* SEARCH */}
        <div className="position-relative d-none d-md-block">
          <Search
            size={18}
            className="position-absolute search-icon"
            style={{
              left: 12,
              top: "50%",
              transform: "translateY(-50%)",
              color: "rgba(255,255,255,0.5)",
              pointerEvents: "none",
              zIndex: 2,
            }}
          />
          <input
            type="text"
            placeholder={t('dashboard.searchPlaceholder')}
            className="form-control search-input"
            style={{
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.1)",
              color: "white",
              width: 260,
              borderRadius: 12,
            }}
          />
        </div>

        {/* ICONS */}
        <div className="d-flex gap-2">
          <NotificationPanel user={user} />

          <button className="btn btn-link text-dim p-2 hover-light rounded-circle">
            <Grid size={20} />
          </button>

          <button className="btn btn-link text-dim p-2 hover-light rounded-circle">
            <Settings size={20} />
          </button>
        </div>

        <div className="border-start border-secondary border-opacity-25 h-50 mx-2"></div>

        {/* USER */}
        <div className="dropdown">
          <button
            className="btn d-flex align-items-center gap-2 p-1 border-0 bg-transparent"
            type="button"
            data-bs-toggle="dropdown"
            aria-expanded="false"
          >
            <div className="bg-gold bg-opacity-25 p-2 rounded-circle text-gold">
              <User size={20} />
            </div>

            <div className="text-start d-none d-md-block">
              <div className="fw-bold text-white small">{user.username}</div>
              <div className="text-dim x-small">{user.role}</div>
            </div>
          </button>

          <ul className="dropdown-menu dropdown-menu-dark dropdown-menu-end shadow-lg border-0 glass mt-2">
            <li>
              <button
                className="dropdown-item d-flex align-items-center gap-2 py-2"
                onClick={() => setActiveTab && setActiveTab('settings')}
              >
                <User size={16} /> {t('settings.tabs.profile')}
              </button>
            </li>

            <li>
              <button
                className="dropdown-item d-flex align-items-center gap-2 py-2"
                onClick={() => setActiveTab && setActiveTab('settings')}
              >
                <Settings size={16} /> {t('sidebar.settings')}
              </button>
            </li>

            <li>
              <hr className="dropdown-divider border-secondary border-opacity-25" />
            </li>

            <li>
              <button
                className="dropdown-item d-flex align-items-center gap-2 py-2 text-danger"
                onClick={handleLogout}
              >
                <LogOut size={16} /> {t('header.logout')}
              </button>
            </li>
          </ul>
        </div>
      </div>
    </header>
  );
};

export default Header;
