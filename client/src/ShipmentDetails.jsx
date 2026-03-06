import React, { useState } from 'react';
import { ArrowLeft, Package, MapPin, Calendar, DollarSign, Truck, CheckCircle, AlertCircle, Clock, Edit, Trash2, Save, X, Download, Search } from 'lucide-react';
import axios from 'axios';
import html2pdf from 'html2pdf.js';
import { QRCodeSVG } from 'qrcode.react';

const ShipmentDetails = ({ shipment, user, onBack, onUpdate }) => {
    const [loading, setLoading] = useState(false);

    // States for Editing
    const [isEditing, setIsEditing] = useState(false);
    const [editData, setEditData] = useState({
        originAddress: shipment.origin_address,
        destinationAddress: shipment.destination_address,
        supplierId: shipment.supplier_id,
        logisticsId: shipment.logistics_id,
        totalValue: shipment.total_value
    });

    // Fake status flow
    const statusFlow = ['Pending', 'In Transit', 'Customs Check', 'Delivered'];

    const validNextStatus = () => {
        const currentIndex = statusFlow.indexOf(shipment.status);
        if (currentIndex < statusFlow.length - 1) return statusFlow[currentIndex + 1];
        return null;
    };

    const handleDownloadPDF = () => {
        const element = document.getElementById('pdf-invoice-export');

        const opt = {
            margin: 0.5,
            filename: `Shipment_Invoice_${shipment.tracking_number}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true },
            jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' }
        };

        html2pdf().set(opt).from(element).save();
    };

    const handleDelete = async () => {
        if (!confirm('CẢNH BÁO: Xóa đơn hàng sẽ vĩnh viễn không thể khôi phục. Bạn có chắc chắn?')) return;
        setLoading(true);
        try {
            const token = localStorage.getItem('token');
            await axios.delete(`http://localhost:5001/api/shipments/${shipment.shipment_id}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            alert('Đã xóa vận đơn thành công!');
            onUpdate();
            onBack();
        } catch (err) {
            alert('Lỗi khi xóa: ' + (err.response?.data?.error || err.message));
            setLoading(false);
        }
    };

    const handleSaveEdit = async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('token');
            await axios.put(`http://localhost:5001/api/shipments/${shipment.shipment_id}`, editData, {
                headers: { Authorization: `Bearer ${token}` }
            });
            alert('Đã cập nhật thông tin vận đơn!');
            setIsEditing(false);
            onUpdate();
        } catch (err) {
            alert('Lỗi cập nhật: ' + (err.response?.data?.error || err.message));
        } finally {
            setLoading(false);
        }
    };

    const handleUpdateStatus = async (newStatus) => {
        if (!confirm(`Bạn có chắc muốn cập nhật trạng thái thành "${newStatus}"?`)) return;
        setLoading(true);
        try {
            const token = localStorage.getItem('token');
            const config = {
                headers: { Authorization: `Bearer ${token}` }
            };

            await axios.put(`http://localhost:5001/api/shipments/${shipment.shipment_id}/status`, { status: newStatus }, config);

            alert("Cập nhật trạng thái thành công!");
            onUpdate(); // Reload lại dữ liệu
            onBack();   // Quay lại danh sách
        } catch (err) {
            console.error("Update Error:", err);
            alert("Lỗi cập nhật trạng thái: " + (err.response?.data?.error || err.message));
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
            <div className="glass p-4 fade-in-up h-100 d-flex flex-column">
                {/* Header */}
                <div className="d-flex align-items-center justify-content-between mb-4 border-bottom border-light border-opacity-10 pb-4">
                    <div className="d-flex align-items-center gap-3">
                        <button className="btn btn-outline-light border-0 p-2 rounded-circle hover-bg-light" onClick={onBack}>
                            <ArrowLeft size={24} />
                        </button>
                        <div>
                            <h4 className="mb-0 fw-bold text-gold d-flex align-items-center gap-2">
                                {shipment.tracking_number}
                                <span className={`badge fs-6 ${shipment.status === 'Delivered' ? 'bg-success' : 'bg-warning'} bg-opacity-25 text-white border border-light border-opacity-25 ms-2`}>
                                    {shipment.status}
                                </span>
                            </h4>
                            <small className="text-dim">Chi tiết vận đơn & Lịch sử hành trình</small>
                        </div>
                    </div>

                    {/* Quản lý quyền Admin */}
                    <div className="d-flex align-items-center gap-2">
                        <button className="btn btn-sm btn-outline-light d-flex align-items-center gap-1" onClick={handleDownloadPDF} disabled={isEditing}>
                            <Download size={16} /> Xuất PDF
                        </button>
                        {user?.role === 'Admin' && (
                            <>
                                {shipment.status === 'Pending' ? (
                                    <>
                                        {isEditing ? (
                                            <>
                                                <button className="btn btn-sm btn-success d-flex align-items-center gap-1" onClick={handleSaveEdit} disabled={loading}>
                                                    <Save size={16} /> Lưu
                                                </button>
                                                <button className="btn btn-sm btn-secondary d-flex align-items-center gap-1" onClick={() => setIsEditing(false)} disabled={loading}>
                                                    <X size={16} /> Hủy
                                                </button>
                                            </>
                                        ) : (
                                            <button className="btn btn-sm btn-outline-info d-flex align-items-center gap-1" onClick={() => setIsEditing(true)}>
                                                <Edit size={16} /> Sửa
                                            </button>
                                        )}
                                        <button className="btn btn-sm btn-outline-danger d-flex align-items-center gap-1" onClick={handleDelete} disabled={loading}>
                                            <Trash2 size={16} /> Xóa
                                        </button>
                                    </>
                                ) : (
                                    <span className="badge bg-secondary bg-opacity-25 text-dim border border-secondary px-3 py-2 ms-2 d-flex align-items-center gap-2">
                                        <AlertCircle size={14} /> Khóa cập nhật (Đã rời kho)
                                    </span>
                                )}
                            </>
                        )}
                    </div>
                </div>

                <div id="invoice-content" className="row g-4 overflow-auto custom-scrollbar flex-grow-1 p-2">
                    {/* Cột Trái: Thông tin chính */}
                    <div className="col-md-4">
                        <div className="d-flex flex-column gap-3">
                            {/* Info Card */}
                            <div className="p-3 rounded-3 bg-black bg-opacity-20 border border-light border-opacity-10">
                                <h6 className="text-gold fw-bold mb-3 d-flex align-items-center gap-2"><Package size={16} /> THÔNG TIN HÀNG HÓA</h6>

                                <div className="mb-3">
                                    <div className="text-dim x-small text-uppercase">Nhà cung cấp</div>
                                    <div className="fw-semibold text-white">{shipment.supplier_name}</div>
                                </div>
                                <div className="mb-3">
                                    <div className="text-dim x-small text-uppercase">Đơn vị vận chuyển</div>
                                    <div className="fw-semibold text-white">{shipment.logistics_name}</div>
                                </div>
                                <div className="mb-3">
                                    <div className="text-dim x-small text-uppercase">Giá trị lô hàng</div>
                                    {isEditing ? (
                                        <input
                                            type="number" className="form-control form-control-sm bg-dark text-white border-secondary mt-1"
                                            value={editData.totalValue} onChange={(e) => setEditData({ ...editData, totalValue: e.target.value })}
                                        />
                                    ) : (
                                        <div className="fw-bold text-success d-flex align-items-center gap-1">
                                            <DollarSign size={14} />
                                            {parseFloat(shipment.total_value).toLocaleString()} USD
                                        </div>
                                    )}
                                </div>
                                <div>
                                    <div className="text-dim x-small text-uppercase">Ngày tạo</div>
                                    <div className="d-flex align-items-center gap-2 text-white">
                                        <Calendar size={14} />
                                        {new Date(shipment.shipment_date).toLocaleString()}
                                    </div>
                                </div>
                            </div>

                            {/* Route Card */}
                            <div className="p-3 rounded-3 bg-black bg-opacity-20 border border-light border-opacity-10">
                                <h6 className="text-gold fw-bold mb-3 d-flex align-items-center gap-2"><MapPin size={16} /> LỘ TRÌNH VẬN CHUYỂN</h6>

                                <div className="position-relative ps-3 my-2 border-start border-secondary border-opacity-50 ms-2">
                                    <div className="mb-4 position-relative">
                                        <div className="position-absolute top-0 start-0 translate-middle-x bg-gold rounded-circle border border-dark" style={{ width: '12px', height: '12px', left: '-1px' }}></div>
                                        <div className="text-dim x-small">Điểm đi (Origin)</div>
                                        {isEditing ? (
                                            <input
                                                type="text" className="form-control form-control-sm bg-dark text-white border-secondary mt-1"
                                                value={editData.originAddress} onChange={(e) => setEditData({ ...editData, originAddress: e.target.value })}
                                            />
                                        ) : (
                                            <div className="fw-bold text-white">{shipment.origin_address}</div>
                                        )}
                                    </div>
                                    <div className="position-relative">
                                        <div className="position-absolute top-0 start-0 translate-middle-x bg-info rounded-circle border border-dark" style={{ width: '12px', height: '12px', left: '-1px' }}></div>
                                        <div className="text-dim x-small">Điểm đến (Destination)</div>
                                        {isEditing ? (
                                            <input
                                                type="text" className="form-control form-control-sm bg-dark text-white border-secondary mt-1"
                                                value={editData.destinationAddress} onChange={(e) => setEditData({ ...editData, destinationAddress: e.target.value })}
                                            />
                                        ) : (
                                            <div className="fw-bold text-white">{shipment.destination_address}</div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* QRCode Card */}
                            <div className="p-3 rounded-3 bg-black bg-opacity-20 border border-light border-opacity-10 text-center mt-3">
                                <h6 className="text-gold fw-bold mb-3 d-flex justify-content-center align-items-center gap-2">
                                    <Package size={16} /> MÃ QUÉT TRUY XUẤT (QR CODE)
                                </h6>
                                <div className="bg-white p-3 d-inline-block rounded-3 shadow-sm mx-auto mb-2">
                                    <QRCodeSVG
                                        value={`http://localhost:3000/tracking/${shipment.tracking_number}`}
                                        size={120}
                                        level="H"
                                        includeMargin={true}
                                    />
                                </div>
                                <div className="text-dim x-small mb-2">Quét để theo dõi hành trình mọi lúc mọi nơi</div>
                                <div className="mt-2 text-truncate">
                                    <a href={`/tracking/${shipment.tracking_number}`} target="_blank" rel="noopener noreferrer" className="btn btn-sm btn-outline-gold text-decoration-none d-inline-flex gap-1 align-items-center">
                                        <Search size={14} /> Mở Trực Tiếp
                                    </a>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Cột Phải: Timeline & Actions */}
                    <div className="col-md-8">
                        <div className="p-4 rounded-3 bg-black bg-opacity-20 border border-light border-opacity-10 h-100 position-relative">
                            <h6 className="text-gold fw-bold mb-4 d-flex align-items-center gap-2"><Clock size={16} /> TIẾN ĐỘ VẬN CHUYỂN</h6>

                            {/* Timeline Visualization */}
                            <div className="d-flex justify-content-between align-items-center position-relative mb-5 px-4">
                                {/* Line connector */}
                                <div className="position-absolute top-50 start-0 w-100 translate-middle-y bg-secondary bg-opacity-25" style={{ height: '4px', zIndex: 0 }}></div>

                                {statusFlow.map((step, index) => {
                                    const active = statusFlow.indexOf(shipment.status) >= index;
                                    const isCurrent = shipment.status === step;

                                    return (
                                        <div key={step} className="position-relative z-1 text-center" style={{ width: '80px' }}>
                                            <div
                                                className={`rounded-circle d-flex align-items-center justify-content-center mx-auto mb-2 shadow-lg transition-all
                                                ${active ? 'bg-gold text-dark' : 'bg-dark border border-secondary text-dim'}`}
                                                style={{ width: '40px', height: '40px' }}
                                            >
                                                {active ? <CheckCircle size={20} /> : <div style={{ width: '10px', height: '10px' }} className="rounded-circle bg-secondary opacity-50"></div>}
                                            </div>
                                            <div className={`x-small fw-bold ${active ? 'text-white' : 'text-dim'}`}>{step}</div>
                                            {isCurrent && <div className="badge bg-primary text-white mt-1 shadow-sm">Hiện tại</div>}
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Action Area */}
                            {validNextStatus() && (
                                <div id="action-area" className="mt-5 pt-4 border-top border-light border-opacity-10">
                                    <h6 className="text-white mb-3">Cập nhật trạng thái tiếp theo:</h6>
                                    <button
                                        className="btn btn-gold py-3 px-4 fw-bold shadow-lg d-flex align-items-center gap-2"
                                        onClick={() => handleUpdateStatus(validNextStatus())}
                                        disabled={loading}
                                    >
                                        {loading ? 'Đang xử lý...' : (
                                            <>
                                                <Truck size={20} />
                                                Chuyển sang: {validNextStatus()}
                                            </>
                                        )}
                                    </button>
                                    <p className="text-dim x-small mt-2">
                                        * Hành động này sẽ được ghi vào <strong>Nhật ký hệ thống (Audit Logs)</strong> để truy vết.
                                    </p>
                                </div>
                            )}

                            {!validNextStatus() && shipment.status === 'Delivered' && (
                                <div className="mt-5 pt-4 border-top border-light border-opacity-10 text-center">
                                    <div className="d-inline-flex flex-column align-items-center text-success">
                                        <CheckCircle size={48} className="mb-2" />
                                        <h5 className="fw-bold">Đơn hàng đã hoàn tất</h5>
                                    </div>
                                </div>
                            )}

                        </div>
                    </div>
                </div>
            </div >

            {/* BẢN MẪU IN HÓA ĐƠN PDF CHUYÊN NGHIỆP (Ẩn khỏi giao diện web, chỉ dùng cho html2pdf) */}
            <div style={{ position: 'absolute', top: '-9999px', left: '-9999px', width: '800px', backgroundColor: '#fff' }}>
                <div id="pdf-invoice-export" style={{ padding: '40px', fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif', color: '#333' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #333', paddingBottom: '20px', marginBottom: '30px' }}>
                        <div>
                            <h1 style={{ margin: 0, fontSize: '28px', color: '#1a1a1a', textTransform: 'uppercase', letterSpacing: '2px' }}>HÓA ĐƠN VẬN CHUYỂN</h1>
                            <p style={{ margin: '5px 0 0', fontSize: '14px', color: '#666' }}>Mã Hóa Đơn: <strong>{shipment.tracking_number}</strong></p>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                            <h3 style={{ margin: 0, fontSize: '20px', color: '#1a1a1a' }}>SecureChain Logistics</h3>
                            <p style={{ margin: '5px 0 0', fontSize: '12px', color: '#666' }}>Bảo mật Blockchain & AES-256</p>
                        </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '40px' }}>
                        <div style={{ flex: 1, paddingRight: '20px' }}>
                            <h4 style={{ margin: '0 0 10px', fontSize: '14px', color: '#666', textTransform: 'uppercase' }}>Thông Tin Đối Tác</h4>
                            <p style={{ margin: '0 0 5px' }}><strong>Nhà Cung Cấp:</strong> {shipment.supplier_name}</p>
                            <p style={{ margin: '0 0 5px' }}><strong>Đơn Vị Vận Chuyển:</strong> {shipment.logistics_name}</p>
                            <p style={{ margin: '0 0 5px' }}><strong>Ngày Tạo Đơn:</strong> {new Date(shipment.shipment_date).toLocaleDateString('vi-VN')}</p>
                        </div>
                        <div style={{ flex: 1, textAlign: 'right' }}>
                            <h4 style={{ margin: '0 0 10px', fontSize: '14px', color: '#666', textTransform: 'uppercase' }}>Lộ Trình / Giá Trị</h4>
                            <p style={{ margin: '0 0 5px' }}><strong>Kho Gửi:</strong> {shipment.origin_address}</p>
                            <p style={{ margin: '0 0 5px' }}><strong>Kho Nhận:</strong> {shipment.destination_address}</p>
                            <p style={{ margin: '0 0 5px' }}><strong>Tổng Giá Trị:</strong> ${parseFloat(shipment.total_value).toLocaleString('en-US')}</p>
                        </div>
                    </div>

                    <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '40px' }}>
                        <thead>
                            <tr style={{ backgroundColor: '#f5f5f5' }}>
                                <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #ddd' }}>Trạng Thái Hiện Tại</th>
                                <th style={{ padding: '12px', textAlign: 'right', borderBottom: '2px solid #ddd' }}>Chi Phí Tham Khảo</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td style={{ padding: '15px 12px', borderBottom: '1px solid #ddd', fontSize: '16px', fontWeight: 'bold' }}>{shipment.status}</td>
                                <td style={{ padding: '15px 12px', borderBottom: '1px solid #ddd', textAlign: 'right', fontWeight: 'bold' }}>${parseFloat(shipment.total_value).toLocaleString('en-US')}</td>
                            </tr>
                        </tbody>
                    </table>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '20px', padding: '20px', backgroundColor: '#f9f9f9', borderRadius: '8px', border: '1px solid #eee' }}>
                        <div>
                            <QRCodeSVG value={`http://localhost:3000/tracking/${shipment.tracking_number}`} size={100} level="H" />
                        </div>
                        <div>
                            <h5 style={{ margin: '0 0 10px', fontSize: '16px' }}>Tra Cứu Khách Hàng (Tracking)</h5>
                            <p style={{ margin: '0 0 5px', fontSize: '13px', color: '#555' }}>Quý khách vui lòng quét mã QR Code để tra cứu lộ trình trực tuyến thời gian thực hoặc truy cập địa chỉ bên dưới:</p>
                            <a href={`http://localhost:3000/tracking/${shipment.tracking_number}`} style={{ color: '#0056b3', textDecoration: 'none', fontSize: '13px' }}>http://localhost:3000/tracking/{shipment.tracking_number}</a>
                        </div>
                    </div>

                    <div style={{ marginTop: '40px', borderTop: '1px dotted #ccc', paddingTop: '20px', textAlign: 'center', fontSize: '11px', color: '#888' }}>
                        <p style={{ margin: '0' }}>Văn bản xuất tự động từ hệ thống SecureChain V1.2.0 • Zero Trust.</p>
                        <p style={{ margin: '0' }}>Có giá trị pháp lý và xác minh dựa trên nền tảng Mã Hóa Envelope bảo mật cấp cao.</p>
                    </div>
                </div>
            </div>
        </>
    );
};

export default ShipmentDetails;
