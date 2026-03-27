import React, { useState, useEffect } from 'react';
import { Package, Truck, CheckCircle, Clock, ArrowLeft, XCircle } from 'lucide-react';
import axios from 'axios';

const TrackingPage = ({ trackingNumber }) => {
    const [shipment, setShipment] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        const fetchShipment = async () => {
            try {
                const res = await axios.get(`/api/tracking/${trackingNumber}`);
                setShipment(res.data);
            } catch (err) {
                setError('Không tìm thấy thông tin vận đơn hoặc có lỗi xảy ra.');
            } finally {
                setLoading(false);
            }
        };
        fetchShipment();
    }, [trackingNumber]);

    const statusFlow = ['Pending Approval', 'Approved', 'In Transit', 'Customs Check', 'Delivered'];

    if (loading) return (
        <div className="d-flex h-100vh w-100 justify-content-center align-items-center bg-black">
            <div className="spinner-border text-gold" />
        </div>
    );

    if (error || !shipment) return (
        <div className="d-flex h-100vh w-100 justify-content-center align-items-center bg-black text-center text-white p-5">
            <div>
                <Package size={64} className="text-secondary mb-3" />
                <h4 className="text-danger">Lỗi Truy Xuất</h4>
                <p>{error}</p>
                <a href="/" className="btn btn-outline-gold mt-3">Quay Lại</a>
            </div>
        </div>
    );

    const currentStepIndex = statusFlow.indexOf(shipment.status) !== -1 ? statusFlow.indexOf(shipment.status) : 0;

    return (
        <div className="d-flex flex-column h-100vh w-100 bg-black text-white p-4 align-items-center overflow-auto">
            <div style={{ maxWidth: '800px', width: '100%' }}>
                <a href="/" className="btn btn-outline-light d-inline-flex align-items-center gap-2 mb-4 hover-gold">
                    <ArrowLeft size={16} /> Trang chủ Dashboard
                </a>

                <div className="glass p-5 rounded-4 border-gold shadow-lg position-relative">
                    <div className="text-center mb-5">
                        <Package size={48} className="text-gold mb-2" />
                        <h2 className="fw-bold mb-1 tracking-h2">TRUY XUẤT VẬN ĐƠN</h2>
                        <h5 className="text-dim mt-2 fw-semibold">Mã tracking: <span className="text-white bg-dark px-2 rounded">{shipment.tracking_number}</span></h5>
                    </div>

                    <div className="row g-4 mb-5 pb-4 border-bottom border-light border-opacity-10">
                        <div className="col-md-6 border-end border-light border-opacity-10">
                            <p className="small text-dim text-uppercase fw-bold mb-1">Nơi Gửi (Origin)</p>
                            <h5 className="text-white">{shipment.origin_address}</h5>
                            <p className="mt-3 small text-dim text-uppercase fw-bold mb-1">Đơn vị Vận Chuyển</p>
                            <h6 className="text-gold">{shipment.logistics_name}</h6>
                        </div>
                        <div className="col-md-6 text-end">
                            <p className="small text-dim text-uppercase fw-bold mb-1">Nơi Nhận (Destination)</p>
                            <h5 className="text-white">{shipment.destination_address}</h5>

                        </div>
                    </div>

                    <div className="position-relative mt-4">
                        <h6 className="text-dim text-uppercase fw-bold x-small mb-4">Tiến Độ Giao Hàng</h6>

                        {shipment.status === 'Rejected' ? (
                            /* REJECTED: Special 2-step flow */
                            <>
                                <div className="d-flex justify-content-between position-relative">
                                    <div className="position-absolute top-50 start-0 w-100 bg-danger bg-opacity-50" style={{ height: '3px', transform: 'translateY(-50%)', zIndex: 0 }}></div>

                                    {/* Step 1: Pending Approval */}
                                    <div className="position-relative d-flex flex-column align-items-center" style={{ zIndex: 2 }}>
                                        <div className="rounded-circle d-flex align-items-center justify-content-center bg-success text-white shadow-sm" style={{ width: '36px', height: '36px' }}>
                                            <CheckCircle size={20} />
                                        </div>
                                        <div className="mt-2 fw-semibold text-center x-small text-success">Pending Approval</div>
                                    </div>

                                    {/* Step 2: Rejected */}
                                    <div className="position-relative d-flex flex-column align-items-center" style={{ zIndex: 2 }}>
                                        <div className="rounded-circle d-flex align-items-center justify-content-center bg-danger text-white shadow-lg" style={{ width: '44px', height: '44px', border: '3px solid rgba(255,93,93,0.5)' }}>
                                            <XCircle size={24} />
                                        </div>
                                        <div className="mt-2 fw-semibold text-center x-small text-danger">Từ chối</div>
                                    </div>
                                </div>

                                <div className="mt-4 p-3 rounded-3 bg-danger bg-opacity-10 border border-danger border-opacity-25 text-center">
                                    <XCircle size={20} className="text-danger mb-1" />
                                    <p className="text-danger fw-bold mb-1">Vận đơn đã bị từ chối</p>
                                    <p className="text-dim small mb-0">Vận đơn này không được phê duyệt bởi Quản lý Kho.</p>
                                </div>
                            </>
                        ) : (
                            /* NORMAL: Standard 5-step flow */
                            <div className="d-flex justify-content-between position-relative">
                                <div className="position-absolute top-50 start-0 w-100 bg-secondary" style={{ height: '3px', transform: 'translateY(-50%)', zIndex: 0 }}></div>

                                <div className="position-absolute top-50 start-0 bg-success transition-all" style={{ height: '3px', transform: 'translateY(-50%)', zIndex: 1, width: `${(currentStepIndex / (statusFlow.length - 1)) * 100}%` }}></div>

                                {statusFlow.map((step, index) => {
                                    const isCompleted = index <= currentStepIndex;
                                    const isCurrent = index === currentStepIndex;

                                    return (
                                        <div key={step} className="position-relative d-flex flex-column align-items-center" style={{ zIndex: 2 }}>
                                            <div className={`rounded-circle d-flex align-items-center justify-content-center transition-all ${isCompleted ? 'bg-success text-white scale-up' : 'bg-dark text-secondary border border-secondary'} shadow-sm`}
                                                style={{ width: '36px', height: '36px', borderWidth: isCurrent ? '4px !important' : '1px' }}>
                                                {isCompleted ? <CheckCircle size={20} /> : <Clock size={16} />}
                                            </div>
                                            <div className={`mt-2 fw-semibold text-center x-small ${isCurrent ? 'text-white' : (isCompleted ? 'text-success' : 'text-dim')}`}>
                                                {step}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default TrackingPage;
