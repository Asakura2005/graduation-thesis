import React, { useState, useEffect } from 'react';
import { ArrowLeft, Package, MapPin, Calendar, DollarSign, Truck, CheckCircle, AlertCircle, Clock, Edit, Trash2, Save, X, XCircle, Download, Search, Activity, User } from 'lucide-react';
import axios from 'axios';
import html2pdf from 'html2pdf.js';
import { QRCodeSVG } from 'qrcode.react';
import { useLanguage } from './i18n/LanguageContext';

const ShipmentDetails = ({ shipment, user, onBack, onUpdate }) => {
    const { t } = useLanguage();
    const [loading, setLoading] = useState(false);

    // States for Editing
    const [isEditing, setIsEditing] = useState(false);
    const [items, setItems] = useState([]);
    const [supplyItems, setSupplyItems] = useState([]);
    const [stockList, setStockList] = useState([]);
    const [partners, setPartners] = useState([]);
    const [auditLogs, setAuditLogs] = useState([]);
    const [logsLoading, setLogsLoading] = useState(true);


    const [editData, setEditData] = useState({
        originAddress: shipment.origin_address,
        destinationAddress: shipment.destination_address,
        supplierId: shipment.supplier_id,
        logisticsId: shipment.logistics_id,
        totalValue: shipment.total_value,
        items: [] // Will hold current items for editing
    });

    useEffect(() => {
        const fetchDetails = async () => {
            try {
                const token = localStorage.getItem('token');
                const [itemsRes, partnersRes, supplyItemsRes, logsRes] = await Promise.all([
                    axios.get(`/api/shipments/${shipment.shipment_id}/items`, {
                        headers: { Authorization: `Bearer ${token}` }
                    }),
                    axios.get('/api/partners', { headers: { Authorization: `Bearer ${token}` } }),
                    axios.get('/api/items', { headers: { Authorization: `Bearer ${token}` } }),
                    axios.get('/api/audit-logs', { headers: { Authorization: `Bearer ${token}` } })
                ]);
                setItems(itemsRes.data);
                setPartners(partnersRes.data);
                setSupplyItems(supplyItemsRes.data);

                // Filter logs related to this shipment
                const relevantLogs = (logsRes.data || []).filter(log =>
                    log.details?.shipmentId === shipment.shipment_id ||
                    log.details?.trackingNumber === shipment.tracking_number
                );
                setAuditLogs(relevantLogs);
            } catch (e) {
                console.error("Error fetching shipment details:", e);
            } finally {
                setLogsLoading(false);
            }
        };
        fetchDetails();
    }, [shipment.shipment_id]);

    const startEditing = () => {
        setEditData({
            originAddress: shipment.origin_address,
            destinationAddress: shipment.destination_address,
            supplierId: shipment.supplier_id,
            logisticsId: shipment.logistics_id,
            totalValue: shipment.total_value,
            items: items.map(i => ({
                itemId: i.item_id,
                stockId: i.stock_id,
                quantity: i.quantity,
                unitValue: (i.subtotal / i.quantity) || 0,
                item_name: i.item_name,
                warehouse_name: i.warehouse_name
            }))
        });
        setIsEditing(true);
    };

    const handleItemChange = async (index, field, value) => {
        const newItems = [...editData.items];
        newItems[index][field] = value;

        if (field === 'itemId') {
            const prod = supplyItems.find(p => p.item_id === value);
            newItems[index].item_name = prod?.item_name || '';
            newItems[index].unitValue = (parseFloat(prod?.unit_cost) * 1.2) || 0;
            // Fetch stock for this item
            try {
                const res = await axios.get(`/api/items/${value}/inventory`);
                setStockList(res.data);
            } catch (e) { }
        }

        if (field === 'stockId') {
            const stock = stockList.find(s => s.stock_id === value);
            newItems[index].warehouse_name = stock?.warehouse_name || '';
        }

        // Auto recalc total value
        const total = newItems.reduce((sum, i) => sum + (parseFloat(i.unitValue || 0) * (parseInt(i.quantity) || 0)), 0);
        setEditData({ ...editData, items: newItems, totalValue: total.toFixed(2) });
    };

    // Status flow with new approval workflow
    const statusFlow = ['Pending Approval', 'Approved', 'In Transit', 'Delivered'];

    const validNextStatus = () => {
        // Rejected/Cancelled shipments cannot advance
        if (shipment.status === 'Rejected' || shipment.status === 'Cancelled') return null;
        const currentIndex = statusFlow.indexOf(shipment.status);
        if (currentIndex === -1) return null; // Unknown status, don't allow advancement
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
        if (!confirm(t('shipmentDetails.deleteConfirm'))) return;
        setLoading(true);
        try {
            const token = localStorage.getItem('token');
            await axios.delete(`/api/shipments/${shipment.shipment_id}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            alert(t('shipmentDetails.deleteSuccess'));
            onUpdate();
            onBack();
        } catch (err) {
            alert(`${t('shipmentDetails.deleteError')} ` + (err.response?.data?.error || err.message));
            setLoading(false);
        }
    };

    const handleSaveEdit = async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('token');
            await axios.put(`/api/shipments/${shipment.shipment_id}`, editData, {
                headers: { Authorization: `Bearer ${token}` }
            });
            alert(t('shipmentDetails.updateSuccess'));
            setIsEditing(false);
            onUpdate();
        } catch (err) {
            alert(`${t('shipmentDetails.updateError')} ` + (err.response?.data?.error || err.message));
        } finally {
            setLoading(false);
        }
    };

    const handleUpdateStatus = async (newStatus) => {
        if (!confirm(`${t('shipmentDetails.statusConfirm')} "${t(`dashboard.statusMap.${newStatus}`) || newStatus}"?`)) return;
        setLoading(true);
        try {
            const token = localStorage.getItem('token');
            const config = {
                headers: { Authorization: `Bearer ${token}` }
            };

            await axios.put(`/api/shipments/${shipment.shipment_id}/status`, { status: newStatus }, config);

            alert(t('shipmentDetails.statusSuccess'));
            onUpdate(); // Reload data
            onBack();   // Go back to list
        } catch (err) {
            console.error("Update Error:", err);
            alert(`${t('shipmentDetails.statusError')} ` + (err.response?.data?.error || err.message));
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
                                    {t(`dashboard.statusMap.${shipment.status}`) || shipment.status}
                                </span>
                            </h4>
                            <small className="text-dim">{t('shipmentDetails.titleSub')}</small>
                        </div>
                    </div>

                    {/* Quản lý quyền Admin */}
                    <div className="d-flex align-items-center gap-2">
                        <button className="btn btn-sm btn-outline-light d-flex align-items-center gap-1" onClick={handleDownloadPDF} disabled={isEditing}>
                            <Download size={16} /> {t('shipmentDetails.exportPdf')}
                        </button>
                        {user?.role === 'Admin' && (
                            <>
                                {shipment.status === 'Pending Approval' ? (
                                    <>
                                        {isEditing ? (
                                            <>
                                                <button className="btn btn-sm btn-success d-flex align-items-center gap-1" onClick={handleSaveEdit} disabled={loading}>
                                                    <Save size={16} /> {t('shipmentDetails.save')}
                                                </button>
                                                <button className="btn btn-sm btn-secondary d-flex align-items-center gap-1" onClick={() => setIsEditing(false)} disabled={loading}>
                                                    <X size={16} /> {t('shipmentDetails.cancel')}
                                                </button>
                                            </>
                                        ) : (
                                            <button className="btn btn-sm btn-outline-info d-flex align-items-center gap-1" onClick={startEditing}>
                                                <Edit size={16} /> {t('shipmentDetails.edit')}
                                            </button>
                                        )}
                                        <button className="btn btn-sm btn-outline-danger d-flex align-items-center gap-1" onClick={handleDelete} disabled={loading}>
                                            <Trash2 size={16} /> {t('shipmentDetails.delete')}
                                        </button>
                                    </>
                                ) : (
                                    <span className="badge bg-secondary bg-opacity-25 text-dim border border-secondary px-3 py-2 ms-2 d-flex align-items-center gap-2">
                                        <AlertCircle size={14} /> {t('shipmentDetails.locked')}
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
                                <h6 className="text-gold fw-bold mb-3 d-flex align-items-center gap-2"><Package size={16} /> {t('shipmentDetails.cargoInfo')}</h6>


                                <div className="mb-3">
                                    <div className="text-dim x-small text-uppercase">{t('shipmentDetails.logistics')}</div>
                                    <div className="fw-semibold text-white">{shipment.logistics_name}</div>
                                </div>
                                <div className="mb-3">
                                    <div className="text-dim x-small text-uppercase">{t('shipmentDetails.value')}</div>
                                    {isEditing ? (
                                        <>
                                            <input
                                                type="number" className="form-control form-control-sm bg-dark text-white border-secondary mt-1 opacity-75"
                                                value={editData.totalValue} readOnly
                                            />
                                            <small className="text-dim x-small">{t('shipmentDetails.calcNote')}</small>
                                        </>
                                    ) : (
                                        <div className="fw-bold text-success d-flex align-items-center gap-1">
                                            <DollarSign size={14} />
                                            {parseFloat(shipment.total_value).toLocaleString()} USD
                                        </div>
                                    )}
                                </div>
                                <div>
                                    <div className="text-dim x-small text-uppercase">{t('shipmentDetails.createdDate')}</div>
                                    <div className="d-flex align-items-center gap-2 text-white">
                                        <Calendar size={14} />
                                        {new Date(shipment.shipment_date).toLocaleString()}
                                    </div>
                                </div>
                            </div>

                            {/* Route Card */}
                            <div className="p-3 rounded-3 bg-black bg-opacity-20 border border-light border-opacity-10">
                                <h6 className="text-gold fw-bold mb-3 d-flex align-items-center gap-2"><MapPin size={16} /> {t('shipmentDetails.route')}</h6>

                                <div className="position-relative ps-3 my-2 border-start border-secondary border-opacity-50 ms-2">
                                    <div className="mb-4 position-relative">
                                        <div className="position-absolute top-0 start-0 translate-middle-x bg-gold rounded-circle border border-dark" style={{ width: '12px', height: '12px', left: '-1px' }}></div>
                                        <div className="text-dim x-small">{t('shipmentDetails.origin')}</div>
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
                                        <div className="text-dim x-small">{t('shipmentDetails.destination')}</div>
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
                                    <Package size={16} /> {t('shipmentDetails.productList')}
                                </h6>
                                <div className="text-start">
                                    {isEditing ? (
                                        <div className="d-flex flex-column gap-2">
                                            {editData.items.map((item, idx) => (
                                                <div key={idx} className="p-2 border border-secondary rounded bg-dark bg-opacity-25">
                                                    <div className="mb-2">
                                                        <label className="x-small text-dim">{t('shipmentDetails.itemLabel')}</label>
                                                        <select
                                                            className="form-select form-select-sm bg-dark text-white border-secondary"
                                                            value={item.itemId}
                                                            onChange={(e) => handleItemChange(idx, 'itemId', e.target.value)}
                                                        >
                                                            <option value="">{t('shipmentDetails.selectItem')}</option>
                                                            {supplyItems.map(p => <option key={p.item_id} value={p.item_id}>{p.item_name}</option>)}
                                                        </select>
                                                    </div>
                                                    <div className="mb-2">
                                                        <label className="x-small text-dim">{t('shipmentDetails.stockLabel')}</label>
                                                        <select
                                                            className="form-select form-select-sm bg-dark text-success border-success"
                                                            value={item.stockId}
                                                            onFocus={() => {
                                                                // Refresh stock list for current item
                                                                axios.get(`/api/items/${item.itemId}/inventory`).then(res => setStockList(res.data));
                                                            }}
                                                            onChange={(e) => handleItemChange(idx, 'stockId', e.target.value)}
                                                        >
                                                            <option value="">{t('shipmentDetails.selectStock')}</option>
                                                            {stockList.map(s => <option key={s.stock_id} value={s.stock_id}>{s.warehouse_name} ({s.quantity})</option>)}
                                                            {/* Fallback for current stock if not in list */}
                                                            {!stockList.find(s => s.stock_id === item.stockId) && <option value={item.stockId}>{item.warehouse_name} {t('shipmentDetails.currentStock')}</option>}
                                                        </select>
                                                    </div>
                                                    <div>
                                                        <label className="x-small text-dim">{t('shipmentDetails.qtyLabel')}</label>
                                                        <input
                                                            type="number"
                                                            className="form-control form-control-sm bg-dark text-white border-secondary"
                                                            value={item.quantity}
                                                            onChange={(e) => handleItemChange(idx, 'quantity', e.target.value)}
                                                        />
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="d-flex flex-column gap-2">
                                            {items.map((item, idx) => (
                                                <div key={idx} className="p-2 border border-light border-opacity-10 rounded d-flex justify-content-between align-items-center">
                                                    <div>
                                                        <div className="text-white small fw-bold">{item.item_name}</div>
                                                        <div className="x-small text-dim">{t('shipmentDetails.warehouse')} {item.warehouse_name}</div>
                                                    </div>
                                                    <div className="text-gold fw-bold">x{item.quantity}</div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="p-3 rounded-3 bg-black bg-opacity-20 border border-light border-opacity-10 text-center mt-3">
                                <h6 className="text-gold fw-bold mb-3 d-flex justify-content-center align-items-center gap-2">
                                    <Package size={16} /> {t('shipmentDetails.qrCode')}
                                </h6>
                                <div className="bg-white p-3 d-inline-block rounded-3 shadow-sm mx-auto mb-2">
                                    <QRCodeSVG
                                        value={`http://localhost:3000/tracking/${shipment.tracking_number}`}
                                        size={120}
                                        level="H"
                                        includeMargin={true}
                                    />
                                </div>
                                <div className="text-dim x-small mb-2">{t('shipmentDetails.scanNote')}</div>
                                <div className="mt-2 text-truncate">
                                    <a href={`/tracking/${shipment.tracking_number}`} target="_blank" rel="noopener noreferrer" className="btn btn-sm btn-outline-gold text-decoration-none d-inline-flex gap-1 align-items-center">
                                        <Search size={14} /> {t('shipmentDetails.openTrack')}
                                    </a>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Cột Phải: Timeline & Actions */}
                    <div className="col-md-8">
                        <div className="p-4 rounded-3 bg-black bg-opacity-20 border border-light border-opacity-10 h-100 position-relative">
                            <h6 className="text-gold fw-bold mb-4 d-flex align-items-center gap-2"><Clock size={16} /> {t('shipmentDetails.progress')}</h6>

                            {/* Timeline Visualization */}
                            {shipment.status === 'Rejected' ? (
                                /* REJECTED TIMELINE: Special 2‑step flow */
                                <div className="d-flex justify-content-between align-items-center position-relative mb-5 px-4">
                                    <div className="position-absolute top-50 start-0 w-100 translate-middle-y bg-danger bg-opacity-25" style={{ height: '4px', zIndex: 0 }}></div>
                                    
                                    {/* Step 1: Pending Approval (completed) */}
                                    <div className="position-relative z-1 text-center" style={{ width: '120px' }}>
                                        <div className="rounded-circle d-flex align-items-center justify-content-center mx-auto mb-2 shadow-lg bg-gold text-dark" style={{ width: '40px', height: '40px' }}>
                                            <CheckCircle size={20} />
                                        </div>
                                        <div className="x-small fw-bold text-white">{t('dashboard.statusMap.Pending Approval')}</div>
                                        {shipment.shipment_date && (
                                            <div className="text-dim x-small mt-1" style={{ fontSize: '0.65rem', lineHeight: '1.2' }}>
                                                {new Date(shipment.shipment_date).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}<br />
                                                {new Date(shipment.shipment_date).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })}
                                            </div>
                                        )}
                                    </div>

                                    {/* Step 2: Rejected */}
                                    <div className="position-relative z-1 text-center" style={{ width: '120px' }}>
                                        <div className="rounded-circle d-flex align-items-center justify-content-center mx-auto mb-2 shadow-lg bg-danger text-white" style={{ width: '48px', height: '48px', border: '3px solid rgba(255,93,93,0.5)' }}>
                                            <XCircle size={24} />
                                        </div>
                                        <div className="x-small fw-bold text-danger">{t('dashboard.statusMap.Rejected')}</div>
                                        <div className="badge bg-danger bg-opacity-25 text-danger mt-1 shadow-sm" style={{ fontSize: '0.6rem' }}>{t('dashboard.statusMap.Rejected')}</div>
                                    </div>
                                </div>
                            ) : (
                                /* NORMAL TIMELINE: Standard 5-step flow */
                                <div className="d-flex justify-content-between align-items-center position-relative mb-5 px-4">
                                    {/* Line connector */}
                                    <div className="position-absolute top-50 start-0 w-100 translate-middle-y bg-secondary bg-opacity-25" style={{ height: '4px', zIndex: 0 }}></div>

                                    {statusFlow.map((step, index) => {
                                        const active = statusFlow.indexOf(shipment.status) >= index;
                                        const isCurrent = shipment.status === step;

                                        // Find timestamp if active
                                        const statusLog = active ? auditLogs.find(l =>
                                            l.action === 'UPDATE_SHIPMENT_STATUS' && l.details?.status === step
                                        ) : null;
                                        // Special case for 'Pending Approval' - use shipment_date if no log found
                                        const initialTime = (step === 'Pending Approval' && shipment.shipment_date) ? shipment.shipment_date : null;
                                        const displayTime = statusLog ? statusLog.timestamp : initialTime;

                                        return (
                                            <div key={step} className="position-relative z-1 text-center" style={{ width: '80px' }}>
                                                <div
                                                    className={`rounded-circle d-flex align-items-center justify-content-center mx-auto mb-2 shadow-lg transition-all
                                                    ${active ? 'bg-gold text-dark' : 'bg-dark border border-secondary text-dim'}`}
                                                    style={{ width: '40px', height: '40px' }}
                                                >
                                                    {active ? <CheckCircle size={20} /> : <div style={{ width: '10px', height: '10px' }} className="rounded-circle bg-secondary opacity-50"></div>}
                                                </div>
                                                <div className={`x-small fw-bold ${active ? 'text-white' : 'text-dim'}`}>{t('dashboard.statusMap.' + step) || step}</div>
                                                {active && displayTime && (
                                                    <div className="text-dim x-small mt-1" style={{ fontSize: '0.65rem', lineHeight: '1.2' }}>
                                                        {new Date(displayTime).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}<br />
                                                        {new Date(displayTime).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })}
                                                    </div>
                                                )}
                                                {isCurrent && <div className="badge bg-primary text-white mt-1 shadow-sm" style={{ fontSize: '0.6rem' }}>{t('shipmentDetails.current')}</div>}
                                            </div>
                                        );

                                    })}
                                </div>
                            )}

                            {/* Action Area */}
                            {validNextStatus() && (
                                <div id="action-area" className="mt-5 pt-4 border-top border-light border-opacity-10">
                                    <h6 className="text-white mb-3">{t('shipmentDetails.nextStatus')}</h6>
                                    <button
                                        className="btn btn-gold py-3 px-4 fw-bold shadow-lg d-flex align-items-center gap-2"
                                        onClick={() => handleUpdateStatus(validNextStatus())}
                                        disabled={loading}
                                    >
                                        {loading ? t('shipmentDetails.processing') : (
                                            <>
                                                <Truck size={20} />
                                                {t('shipmentDetails.advanceTo')} {t('dashboard.statusMap.' + validNextStatus()) || validNextStatus()}
                                            </>
                                        )}
                                    </button>
                                    <p className="text-dim x-small mt-2">
                                        {t('shipmentDetails.auditNote')}
                                    </p>
                                </div>
                            )}

                            {!validNextStatus() && shipment.status === 'Delivered' && (
                                <div className="mt-5 pt-4 border-top border-light border-opacity-10 text-center">
                                    <div className="d-inline-flex flex-column align-items-center text-success">
                                        <CheckCircle size={48} className="mb-2" />
                                        <h5 className="fw-bold">{t('shipmentDetails.completed')}</h5>
                                    </div>
                                </div>
                            )}

                            {shipment.status === 'Rejected' && (
                                <div className="mt-4 p-3 rounded-3 bg-danger bg-opacity-10 border border-danger border-opacity-25">
                                    <div className="d-flex align-items-center gap-2 text-danger fw-bold mb-1">
                                        <XCircle size={18} /> {t('shipmentDetails.rejected')}
                                    </div>
                                    <p className="text-dim small mb-0">
                                        {t('shipmentDetails.rejectedDesc')}
                                    </p>
                                </div>
                            )}

                            {/* Activity Logs Section */}
                            <div className="mt-5 pt-4 border-top border-light border-opacity-10">
                                <h6 className="text-gold fw-bold mb-4 d-flex align-items-center gap-2">
                                    <Activity size={16} /> {t('shipmentDetails.activityLogs')}
                                </h6>

                                {logsLoading ? (
                                    <div className="text-center py-3">
                                        <div className="spinner-border spinner-border-sm text-gold" />
                                    </div>
                                ) : auditLogs.length === 0 ? (
                                    <div className="text-dim x-small italic p-3 text-center border border-dashed border-light border-opacity-10 rounded">
                                        {t('shipmentDetails.noLogs')}
                                    </div>
                                ) : (
                                    <div className="d-flex flex-column gap-3">
                                        {auditLogs.map((log, idx) => (
                                            <div key={log.log_id || idx} className="p-3 rounded-3 bg-black bg-opacity-25 border border-light border-opacity-5 position-relative">
                                                <div className="d-flex justify-content-between align-items-start mb-2">
                                                    <span className="badge bg-gold bg-opacity-10 text-gold border border-gold border-opacity-25 x-small">
                                                        {log.action}
                                                    </span>
                                                    <div className="d-flex align-items-center gap-1 text-dim x-small">
                                                        <Clock size={12} />
                                                        {new Date(log.timestamp).toLocaleString('vi-VN')}
                                                    </div>
                                                </div>
                                                <div className="d-flex align-items-center gap-2 mb-1">
                                                    <div className="bg-secondary bg-opacity-10 p-1 rounded">
                                                        <User size={12} className="text-secondary" />
                                                    </div>
                                                    <span className="text-white small fw-semibold">{log.username || 'System'}</span>
                                                </div>
                                                {log.details && (
                                                    <div className="mt-2 pt-2 border-top border-light border-opacity-5">
                                                        {log.action === 'UPDATE_SHIPMENT_STATUS' ? (
                                                            <div className="text-info x-small d-flex align-items-center gap-2">
                                                                <Truck size={12} /> {t('shipmentDetails.statusUpdated')} <strong>{t('dashboard.statusMap.' + log.details.status) || log.details.status}</strong>
                                                            </div>
                                                        ) : log.action === 'CREATE_SHIPMENT' ? (
                                                            <div className="x-small d-flex flex-column gap-1">
                                                                <div className="d-flex align-items-center gap-2 text-success">
                                                                    <Package size={12} />
                                                                    <span>{t('shipmentDetails.newShipment')}</span>
                                                                </div>
                                                                {log.details.trackingNumber && (
                                                                    <div className="text-dim ps-4">{t('shipmentDetails.trackingNum')} <strong className="text-white">{log.details.trackingNumber}</strong></div>
                                                                )}
                                                                {log.details.itemCount != null && (
                                                                    <div className="text-dim ps-4">{t('shipmentDetails.itemCount')} <strong className="text-white">{log.details.itemCount}</strong></div>
                                                                )}
                                                            </div>
                                                        ) : log.action === 'UPDATE_SHIPMENT' ? (
                                                            <div className="x-small d-flex flex-column gap-1">
                                                                <div className="d-flex align-items-center gap-2 text-warning mb-1">
                                                                    <Edit size={12} />
                                                                    <span>{t('shipmentDetails.edited')}</span>
                                                                </div>
                                                                {log.details.changes && log.details.changes.length > 0 ? (
                                                                    log.details.changes.map((change, ci) => (
                                                                        <div key={ci} className="ps-4 d-flex flex-column gap-0 mb-1">
                                                                            <div className="text-secondary fw-semibold" style={{ fontSize: '0.7rem' }}>{change.field}:</div>
                                                                            <div className="d-flex align-items-center gap-2 ps-2">
                                                                                <span className="text-danger text-decoration-line-through" style={{ fontSize: '0.7rem' }}>{change.from || t('shipmentDetails.empty')}</span>
                                                                                <span className="text-dim">→</span>
                                                                                <span className="text-success fw-bold" style={{ fontSize: '0.7rem' }}>{change.to || t('shipmentDetails.empty')}</span>
                                                                            </div>
                                                                        </div>
                                                                    ))
                                                                ) : (
                                                                    <>
                                                                        {log.details.originAddress && (
                                                                            <div className="text-dim ps-4">{t('shipmentDetails.origin')}: <strong className="text-white">{log.details.originAddress}</strong></div>
                                                                        )}
                                                                        {log.details.destinationAddress && (
                                                                            <div className="text-dim ps-4">{t('shipmentDetails.destination')}: <strong className="text-white">{log.details.destinationAddress}</strong></div>
                                                                        )}
                                                                    </>
                                                                )}
                                                            </div>
                                                        ) : log.action === 'DELETE_SHIPMENT' ? (
                                                            <div className="x-small d-flex align-items-center gap-2 text-danger">
                                                                <Trash2 size={12} />
                                                                <span>{t('shipmentDetails.deletedLog')} {log.details.trackingNumber && <strong>{log.details.trackingNumber}</strong>}</span>
                                                            </div>
                                                        ) : (
                                                            <div className="x-small d-flex flex-column gap-1">
                                                                {Object.entries(log.details)
                                                                    .filter(([key]) => key !== 'timestamp')
                                                                    .map(([key, value]) => (
                                                                        <div key={key} className="d-flex align-items-start gap-2 text-dim">
                                                                            <span className="text-secondary text-capitalize" style={{ minWidth: '100px' }}>
                                                                                {key.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').trim()}:
                                                                            </span>
                                                                            <span className="text-white fw-semibold text-break">
                                                                                {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                                                                            </span>
                                                                        </div>
                                                                    ))
                                                                }
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div >

            {/* BẢN MẪU IN HÓA ĐƠN PDF CHUYÊN NGHIỆP (Ẩn khỏi giao diện web, chỉ dùng cho html2pdf) */}
            <div style={{ position: 'absolute', top: '-9999px', left: '-9999px', width: '800px', backgroundColor: '#fff' }}>
                <div id="pdf-invoice-export" style={{ padding: '40px', fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif', color: '#333' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #333', paddingBottom: '20px', marginBottom: '30px' }}>
                        <div>
                            <h1 style={{ margin: 0, fontSize: '28px', color: '#1a1a1a', textTransform: 'uppercase', letterSpacing: '2px' }}>SHIPPING INVOICE</h1>
                            <p style={{ margin: '5px 0 0', fontSize: '14px', color: '#666' }}>Invoice Number: <strong>{shipment.tracking_number}</strong></p>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                            <h3 style={{ margin: 0, fontSize: '20px', color: '#1a1a1a' }}>SecureChain Logistics</h3>
                            <p style={{ margin: '5px 0 0', fontSize: '12px', color: '#666' }}>Blockchain & AES-256 Secured</p>
                        </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '40px' }}>
                        <div style={{ flex: 1, paddingRight: '20px' }}>
                            <h4 style={{ margin: '0 0 10px', fontSize: '14px', color: '#666', textTransform: 'uppercase' }}>Partner Information</h4>

                            <p style={{ margin: '0 0 5px' }}><strong>Logistics Provider:</strong> {shipment.logistics_name}</p>
                            <p style={{ margin: '0 0 5px' }}><strong>Order Date:</strong> {new Date(shipment.shipment_date).toLocaleDateString('en-US')}</p>
                        </div>
                        <div style={{ flex: 1, textAlign: 'right' }}>
                            <h4 style={{ margin: '0 0 10px', fontSize: '14px', color: '#666', textTransform: 'uppercase' }}>Route / Value</h4>
                            <p style={{ margin: '0 0 5px' }}><strong>Kho Gửi:</strong> {shipment.origin_address}</p>
                            <p style={{ margin: '0 0 5px' }}><strong>Kho Nhận:</strong> {shipment.destination_address}</p>
                            <p style={{ margin: '0 0 5px' }}><strong>Total Value:</strong> ${parseFloat(shipment.total_value).toLocaleString('en-US')}</p>
                        </div>
                    </div>

                    <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '40px' }}>
                        <thead>
                            <tr style={{ backgroundColor: '#f5f5f5' }}>
                                <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #ddd' }}>Current Status</th>
                                <th style={{ padding: '12px', textAlign: 'right', borderBottom: '2px solid #ddd' }}>Reference Cost</th>
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
                            <h5 style={{ margin: '0 0 10px', fontSize: '16px' }}>Customer Tracking</h5>
                            <p style={{ margin: '0 0 5px', fontSize: '13px', color: '#555' }}>Please scan the QR Code to track the shipment in real-time or visit the link below:</p>
                            <a href={`http://localhost:3000/tracking/${shipment.tracking_number}`} style={{ color: '#0056b3', textDecoration: 'none', fontSize: '13px' }}>http://localhost:3000/tracking/{shipment.tracking_number}</a>
                        </div>
                    </div>

                    <div style={{ marginTop: '40px', borderTop: '1px dotted #ccc', paddingTop: '20px', textAlign: 'center', fontSize: '11px', color: '#888' }}>
                        <p style={{ margin: '0' }}>Auto-generated from SecureChain System V1.2.0 • Zero Trust.</p>
                        <p style={{ margin: '0' }}>Legally valid and verified on high-security Envelope Encryption platform.</p>
                    </div>
                </div>
            </div>
        </>
    );
};

export default ShipmentDetails;
