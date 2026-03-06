import React from "react";
import { ShieldCheck } from "lucide-react";

const BlockchainStatus = () => {
  return (
    <div className="glass p-4 text-center">
      <ShieldCheck size={40} className="text-gold mb-3" />

      <h6 className="text-white">Trạng thái hạ tầng Blockchain</h6>

      <p className="text-dim small">
        Tất cả các nodes đang hoạt động ổn định với độ trễ thấp.
      </p>

      <span className="badge bg-success">ONLINE</span>
    </div>
  );
};

export default BlockchainStatus;
