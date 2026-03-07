import React from "react";
import { useLanguage } from "../i18n/LanguageContext";

const Footer = () => {
  const { t } = useLanguage();

  return (
    <footer className="text-center text-dim py-3 border-top border-secondary border-opacity-10 small">
      {t('footer.text')}
    </footer>
  );
};

export default Footer;
