import React, { useState, useEffect } from 'react';
import { useLanguage } from './i18n/LanguageContext';
import { X, Truck, MapPin, DollarSign, Hash, Save, Package, Box } from 'lucide-react';
import axios from 'axios';

const ShipmentForm = ({ onSidebarClose, onSuccess }) => { 
    const { t } = useLanguage();
    const [partners, setPartners] = useState([]);
    const [supplyItems, setSupplyItems] = useState([]);

    // Selection States
    const [selectedItemId, setSelectedItemId] = useState('');
    const [selectedItem, setSelectedItem] = useState(null);

    const [stockList, setStockList] = useState([]);
    const [selectedStockId, setSelectedStockId] = useState('');

    const [formData, setFormData] = useState({
        logisticsId: '',
        originAddress: '',
        destinationAddress: '',
        totalValue: '',
        trackingNumber: '',
        shipmentQuantity: ''
    });
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        // Init
        const randomId = 'TRK-' + Math.random().toString(36).substr(2, 9).toUpperCase();
        setFormData(prev => ({ ...prev, trackingNumber: randomId }));

        const fetchData = async () => {
            try {
                const [pRes, iRes] = await Promise.all([
                    axios.get('/api/partners'),
                    axios.get('/api/items')
                ]);
                setPartners(pRes.data);
                setSupplyItems(iRes.data);
            } catch (e) { console.error(e); }
        };
        fetchData();
    }, []);

    // Handle Product Selection
    const handleProductChange = async (e) => {
        const itemId = e.target.value;
        setSelectedItemId(itemId);
        setSelectedStockId('');
        setStockList([]);
        setFormData(prev => ({ ...prev, shipmentQuantity: '', totalValue: '', originAddress: '' }));

        if (itemId) {
            const item = supplyItems.find(i => i.item_id === itemId);
            setSelectedItem(item);
            // Fetch Stock
            try {
                const res = await axios.get(`/api/items/${itemId}/inventory`);
                setStockList(res.data);
            } catch (e) { console.error(e); }
        } else {
            setSelectedItem(null);
        }
    };

    // Handle Stock Selection
    const handleStockChange = (e) => {
        const sId = e.target.value;
        setSelectedStockId(sId);

        const stock = stockList.find(s => s.stock_id === sId);
        if (stock) {
            setFormData(prev => ({ ...prev, originAddress: stock.warehouse_name }));
            // Recalc if qty exists
            if (formData.shipmentQuantity && selectedItem) {
                const cost = parseFloat(selectedItem.unit_cost) || 0;
                const qty = parseInt(formData.shipmentQuantity) || 0;
                const val = (cost * qty * 1.2).toFixed(2);
                setFormData(prev => ({ ...prev, totalValue: val }));
            }
        } else {
            setFormData(prev => ({ ...prev, originAddress: '' }));
        }
    };

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));

        // Auto Calc Value when Quantity changes
        if (name === 'shipmentQuantity' && selectedItem) {
            const cost = parseFloat(selectedItem.unit_cost) || 0;
            const qty = parseInt(value) || 0;
            const val = (cost * qty * 1.2).toFixed(2);
            setFormData(prev => ({ ...prev, totalValue: val }));
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!selectedStockId) return alert("Vui lòng chọn Kho xuất hàng (Nguồn)!");

        const stock = stockList.find(s => s.stock_id === selectedStockId);
        if (parseInt(formData.shipmentQuantity) > stock.quantity) {
            return alert(`{t('shipments.exportQuantity')} (${formData.shipmentQuantity}) vượt quá tồn kho (${stock.quantity}) tại ${stock.warehouse_name}!`);
        }

        setLoading(true);
        try {
            await axios.post('/api/shipments', {
                trackingNumber: formData.trackingNumber,
                logisticsId: formData.logisticsId,
                originAddress: formData.originAddress, // Auto-filled from Warehouse Name
                destinationAddress: formData.destinationAddress,
                totalValue: formData.totalValue,
                items: [{
                    itemId: selectedItem.item_id,
                    stockId: selectedStockId,
                    quantity: formData.shipmentQuantity,
                    unitValue: (parseFloat(selectedItem.unit_cost) * 1.2)
                }]
            });
            alert(`✅ Tạo vận đơn thành công!\nMã vận đơn: ${formData.trackingNumber}`);
            onSuccess();
            onSidebarClose();
        } catch (err) {
            alert('Lỗi khi tạo vận đơn: ' + (err.response?.data?.error || err.message));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center fade-in" style={{ zIndex: 1050, backgroundColor: 'rgba(0,0,0,0.8)' }}>
            <div className="glass border border-secondary border-opacity-25 rounded-3 shadow-lg d-flex flex-column" style={{ width: '800px', maxHeight: '90vh' }}>

                {/* Header */}
                <div className="p-4 border-bottom border-secondary border-opacity-10 d-flex justify-content-between align-items-center bg-black bg-opacity-20">
                    <div className="d-flex align-items-center gap-3">
                        <div className="p-2 bg-gold bg-opacity-10 rounded text-gold">
                            <Truck size={24} />
                        </div>
                        <div>
                            <h5 className="text-white fw-bold mb-0">{t('shipments.createNew')}</h5>
                            <small className="text-dim">{t('shipments.enterDetails')}</small>
                        </div>
                    </div>
                    <button className="btn btn-link text-dim p-0 hover-light" onClick={onSidebarClose}>
                        <X size={24} />
                    </button>
                </div>

                {/* Body */}
                <form onSubmit={handleSubmit} className="p-4 overflow-auto custom-scrollbar">
                    <div className="row g-4">
                        {/* Column 1 */}
                        <div className="col-md-6">
                            <h6 className="text-gold text-uppercase x-small fw-bold mb-3 border-bottom border-secondary border-opacity-10 pb-2">{t('shipments.partnerProductInfo')}</h6>

                            {/* Supplier Field Removed as per request */}
                            {/* 
                            <div className="mb-3">
                                <label className="form-label text-white small fw-semibold">Nhà cung cấp (Supplier)</label>
                                <select className="form-select bg-dark text-white border-secondary focus-ring-gold py-2" name="supplierId" onChange={handleChange} required>
                                    <option value="">-- Chọn nhà cung cấp --</option>
                                    {partners.filter(p => p.type === 'Supplier').map(p => (
                                        <option key={p.partner_id} value={p.partner_id}>{p.partner_name}</option>
                                    ))}
                                </select>
                            </div> 
                            */}

                            <div className="mb-3">
                                <label className="form-label text-white small fw-semibold">{t('shipments.productLabel')}</label>
                                <div className="input-group">
                                    <span className="input-group-text bg-dark border-secondary text-dim"><Package size={18} /></span>
                                    <select className="form-select bg-dark text-white border-secondary focus-ring-gold" value={selectedItemId} onChange={handleProductChange} required>
                                        <option value="">{t('shipments.selectProduct')}</option>
                                        {supplyItems.map(i => (
                                            <option key={i.item_id} value={i.item_id}>{i.item_name} (Tổng tồn: {i.quantity_in_stock})</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            {selectedItemId && (
                                <div className="mb-3 animate-fade-in">
                                    <label className="form-label text-white small fw-semibold">{t('shipments.sourceStock')}</label>
                                    <select className="form-select bg-dark text-success border-success focus-ring-success fw-semibold" value={selectedStockId} onChange={handleStockChange} required>
                                        <option value="">{t('shipments.selectSourceStock')}</option>
                                        {stockList.map(s => (
                                            <option key={s.stock_id} value={s.stock_id}>
                                                {s.warehouse_name} - {s.bin_location} (Tồn: {s.quantity})
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            <div className="mb-3">
                                <label className="form-label text-white small fw-semibold">{t('shipments.logisticsLabel')}</label>
                                <select className="form-select bg-dark text-white border-secondary focus-ring-gold py-2" name="logisticsId" onChange={handleChange} required>
                                    <option value="">{t('shipments.selectLogistics')}</option>
                                    {partners.filter(p => p.type === 'Logistics').map(p => (
                                        <option key={p.partner_id} value={p.partner_id}>{p.partner_name}</option>
                                    ))}
                                </select>
                            </div>

                        </div>

                        {/* Column 2 */}
                        <div className="col-md-6">
                            <h6 className="text-gold text-uppercase x-small fw-bold mb-3 border-bottom border-secondary border-opacity-10 pb-2">{t('shipments.routeQuantity')}</h6>

                            <div className="mb-3">
                                <label className="form-label text-white small fw-semibold">{t('shipments.trackingCodeAuto')}</label>
                                <div className="input-group">
                                    <span className="input-group-text bg-dark border-secondary text-dim"><Hash size={18} /></span>
                                    <input type="text" className="form-control bg-dark border-secondary text-gold fw-bold font-monospace" name="trackingNumber" value={formData.trackingNumber} readOnly />
                                </div>
                            </div>

                            <div className="mb-3">
                                <label className="form-label text-white small fw-semibold">{t('shipments.originAuto')}</label>
                                <div className="input-group">
                                    <span className="input-group-text bg-dark border-secondary text-dim"><MapPin size={18} /></span>
                                    <input type="text" className="form-control bg-dark text-white border-secondary text-dim" name="originAddress" value={formData.originAddress} readOnly placeholder={t('shipments.autoFillOrigin')} />
                                </div>
                            </div>

                            <div className="mb-3">
                                <label className="form-label text-white small fw-semibold">{t('shipments.destinationLabel')}</label>
                                <div className="input-group">
                                    <span className="input-group-text bg-dark border-secondary text-dim"><MapPin size={18} /></span>
                                    <input type="text" className="form-control bg-dark text-white border-secondary" name="destinationAddress" placeholder={t('shipments.destinationExample')} onChange={handleChange} required />
                                </div>
                            </div>

                            <div className="row">
                                <div className="col-6">
                                    <div className="mb-3">
                                        <label className="form-label text-white small fw-semibold">{t('shipments.exportQuantity')}</label>
                                        <div className="input-group">
                                            <span className="input-group-text bg-dark border-secondary text-dim"><Box size={18} /></span>
                                            <input type="number" className="form-control bg-dark text-white border-secondary fw-bold" name="shipmentQuantity" value={formData.shipmentQuantity} onChange={handleChange} placeholder="0" required min="1" />
                                        </div>
                                    </div>
                                </div>
                                <div className="col-6">
                                    <div className="mb-3">
                                        <label className="form-label text-white small fw-semibold">{t('shipments.totalValueUSD')}</label>
                                        <div className="input-group">
                                            <span className="input-group-text bg-dark border-secondary text-success"><DollarSign size={18} /></span>
                                            <input type="text" className="form-control bg-dark text-white border-secondary fw-bold" name="totalValue" value={formData.totalValue} readOnly placeholder="Auto (+20%)" />
                                        </div>
                                    </div>
                                </div>
                            </div>

                        </div>
                    </div>
                </form>

                {/* Footer */}
                <div className="p-4 bg-black bg-opacity-20 border-top border-secondary border-opacity-10 d-flex justify-content-between align-items-center">
                    <p className="small text-dim mb-0 d-flex align-items-center gap-2">
                        <Save size={14} />
                        Data encrypted with standard / Mã hóa chuẩn <strong>AES-256-GCM</strong>
                    </p>
                    <div className="d-flex gap-2">
                        <button className="btn btn-outline-secondary text-white hover-light px-4" onClick={onSidebarClose}>{t('common.cancel')}</button>
                        <button className="btn btn-gold bg-gradient px-4 shadow fw-bold d-flex align-items-center gap-2" onClick={handleSubmit} disabled={loading}>
                            {loading ? <span className="spinner-border spinner-border-sm"></span> : t('shipments.createBtn')}
                        </button>
                    </div>
                </div>

            </div>
        </div>
    );
};

export default ShipmentForm;
