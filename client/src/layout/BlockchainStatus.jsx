import React from "react";
import { ShieldCheck } from "lucide-react";
import { useLanguage } from "../i18n/LanguageContext";

const BlockchainStatus = () => {
  const { t } = useLanguage();

  return (
    <div className="glass p-4 text-center">
      <ShieldCheck size={40} className="text-gold mb-3" />

      <h6 className="text-white">{t('blockchain.title')}</h6>

      <p className="text-dim small">
        {t('blockchain.description')}
      </p>

      <span className="badge bg-success">ONLINE</span>
    </div>
  );
};

export default BlockchainStatus;
