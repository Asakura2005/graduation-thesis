import React, { useState, useEffect } from "react";
import { useLanguage } from "../i18n/LanguageContext";
import axios from "axios";
import {
  Package,
  Search,
  Plus,
  Save,
  Tag,
  DollarSign,
  Box,
  Edit,
  Trash2,
  X,
  ShieldCheck,
  Layers,
  ArrowLeft,
  MapPin,
  Database,
  Server,
} from "lucide-react";

// --- SUB-COMPONENT: MASTER DATA (Danh mục hàng hóa + Nhập kho) ---
const MasterData = () => {
  const { t } = useLanguage();
  const [formData, setFormData] = useState({
    itemName: "",
    unitCost: "",
    category: "Electronics",
    quantity: "0",
    warehouseId: "",
    binLocation: "Shelf 1",
    supplierId: "",
  });
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [partners, setPartners] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");

  const CATEGORIES = [
    "Electronics",
    "Medicine",
    "Raw Materials",
    "Food",
    "Luxury Goods",
  ];

  // Helper: Generate list shelves for selected warehouse
  const getShelvesList = () => {
    if (!formData.warehouseId) return [];
    const wh = warehouses.find(
      (w) => w.warehouse_id === formData.warehouseId,
    );
    if (!wh) return [];
    return Array.from(
      { length: wh.total_shelves || 50 },
      (_, i) => `Shelf ${i + 1}`,
    );
  };

  const [existingStock, setExistingStock] = useState([]);
  const [editStockId, setEditStockId] = useState(null);
  const [editStockData, setEditStockData] = useState({
    quantity: 0,
    binLocation: "",
  });

  const deleteStock = async (stockId) => {
    if (!window.confirm("Bạn có chắc chắn muốn xóa bản ghi tồn kho này?"))
      return;
    try {
      await axios.delete(`/api/inventory/${stockId}`);
      setExistingStock((prev) => prev.filter((s) => s.stock_id !== stockId));
      fetchItems();
    } catch (err) {
      alert("Lỗi xóa tồn kho: " + (err.response?.data?.error || err.message));
    }
  };

  const startEditStock = (stock) => {
    setEditStockId(stock.stock_id);
    setEditStockData({
      quantity: stock.quantity,
      binLocation: stock.bin_location,
    });
  };

  const cancelEditStock = () => {
    setEditStockId(null);
    setEditStockData({ quantity: 0, binLocation: "" });
  };

  const saveStock = async (stockId) => {
    try {
      await axios.put(
        `/api/inventory/${stockId}`,
        editStockData,
      );
      setExistingStock((prev) =>
        prev.map((s) =>
          s.stock_id === stockId ? { ...s, ...editStockData } : s,
        ),
      );
      setEditStockId(null);
      fetchItems();
    } catch (err) {
      alert(
        "Lỗi cập nhật tồn kho: " + (err.response?.data?.error || err.message),
      );
    }
  };

  useEffect(() => {
    fetchItems();
    fetchWarehouses();
    fetchPartners();
  }, []);

  useEffect(() => {
    if (editingId) {
      axios
        .get(`/api/items/${editingId}/inventory`)
        .then((res) => setExistingStock(res.data))
        .catch((err) => console.error(err));
    } else {
      setExistingStock([]);
    }
  }, [editingId]);

  const fetchItems = async () => {
    try {
      const res = await axios.get("/api/items");
      setItems(res.data);
    } catch (err) {
      console.error(err);
    }
  };
  const fetchWarehouses = async () => {
    try {
      const res = await axios.get("/api/warehouses");
      setWarehouses(res.data);
    } catch (err) {
      console.error(err);
    }
  };
  const fetchPartners = async () => {
    try {
      const res = await axios.get("/api/partners");
      setPartners(res.data);
    } catch (e) {
      console.error(e);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (editingId) {
        await axios.put(
          `/api/items/${editingId}`,
          formData,
        );
      } else {
        // Create Item + Auto Stock In
        await axios.post("/api/items", formData);
      }
      setEditingId(null);
      setFormData({
        itemName: "",
        unitCost: "",
        category: "Electronics",
        quantity: "0",
        warehouseId: "",
        binLocation: "Shelf 1",
      });
      fetchItems();
      alert(editingId ? "Cập nhật thành công!" : "Thành công!");
    } catch (err) {
      alert(err.response?.data?.error || "Lỗi lưu");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm("Bạn có chắc chắn muốn xóa sản phẩm này?")) return;
    try {
      await axios.delete(`/api/items/${id}`);
      fetchItems();
    } catch (e) {
      alert(e.response?.data?.error);
    }
  };

  const filteredItems = items.filter((i) =>
    i.item_name.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  return (
    <div className="d-flex gap-4 h-100 fade-in-up">
      <div
        className="glass p-4 flex-grow-1 d-flex flex-column"
        style={{ flex: 7 }}
      >
        {/* ===== KPI DASHBOARD ===== */}
        <div className="row g-3 mb-3">
          <div className="col-md-3">
            <div className="glass kpi-card">
              <div className="kpi-label">TOTAL ITEMS</div>
              <div className="kpi-value text-gold">{items.length}</div>
            </div>
          </div>

          <div className="col-md-3">
            <div className="glass kpi-card">
              <div className="kpi-label">TOTAL STOCK</div>
              <div className="kpi-value text-info">
                {items.reduce((sum, i) => sum + (i.quantity_in_stock || 0), 0)}
              </div>
            </div>
          </div>

          <div className="col-md-3">
            <div className="glass kpi-card">
              <div className="kpi-label">CATEGORIES</div>
              <div className="kpi-value text-success">
                {new Set(items.map((i) => i.category)).size}
              </div>
            </div>
          </div>

          <div className="col-md-3">
            <div className="glass kpi-card">
              <div className="kpi-label">SUPPLIERS</div>
              <div className="kpi-value text-warning">{partners.length}</div>
            </div>
          </div>
        </div>
        <div className="d-flex justify-content-between mb-3">
          <h6 className="fw-bold text-gold">
            <Database size={18} />{t('inventory.masterDataTitle')}</h6>
          <input
            className="form-control w-auto bg-transparent text-white border-secondary"
            placeholder={t('inventory.search')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="table-responsive flex-grow-1 custom-scrollbar">
          <table className="table table-hover align-middle mb-0 text-white">
            <thead>
              <tr>
                <th>{t('inventory.name')}</th>
                <th>{t('inventory.category')}</th>
                <th>{t('inventory.supplier')}</th>
                <th>{t('inventory.totalStock')}</th>
                <th>{t('inventory.unitCost')}</th>
                <th className="text-end">#</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan="6" className="text-center py-3 text-dim">
                    {t('inventory.emptyList')}
                  </td>
                </tr>
              ) : (
                filteredItems.map((i) => (
                  <tr
                    key={i.item_id}
                    className={
                      editingId === i.item_id ? "bg-light bg-opacity-10" : ""
                    }
                  >
                    <td>
                      <div className="d-flex align-items-center gap-2">
                        <Package size={16} className="text-gold" />
                        <div className="fw-bold">{i.item_name}</div>
                      </div>
                      <div className="text-dim x-small">ID: {i.item_id}</div>
                    </td>
                    <td>
                      <span className="badge category-badge">{i.category}</span>
                    </td>
                    <td className="text-info x-small">
                      {partners.find((p) => p.partner_id === i.supplier_id)
                        ?.partner_name || <span className="text-dim">-</span>}
                    </td>
                    <td>{i.quantity_in_stock}</td>
                    <td className="text-success fw-bold font-monospace">
                      ${parseFloat(i.unit_cost).toLocaleString()}
                    </td>
                    <td className="text-end">
                      <button
                        className="btn btn-sm btn-outline-light border-0 text-primary hover-bg-light"
                        onClick={() => {
                          setEditingId(i.item_id);
                          setFormData({
                            itemName: i.item_name,
                            unitCost: i.unit_cost,
                            category: i.category,
                            quantity: 0,
                            warehouseId: "",
                            binLocation: "Shelf 1",
                            supplierId: i.supplier_id || "", // Add this
                          });
                        }}
                        title="Sửa"
                      >
                        <Edit size={16} />
                      </button>
                      <button
                        className="btn btn-sm btn-outline-light border-0 text-danger hover-bg-light"
                        onClick={() => handleDelete(i.item_id)}
                        title="Xóa"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      <div className="glass p-4 d-flex flex-column" style={{ flex: 3 }}>
        <h6 className="fw-bold text-gold mb-3">
          {editingId ? t('inventory.updateInfo') : t('inventory.addNewImport')}
        </h6>
        <form
          onSubmit={handleSubmit}
          className="d-flex flex-column gap-3 overflow-auto custom-scrollbar pe-2"
        >
          <div>
            <label className="form-label text-dim x-small text-uppercase fw-bold">{t('inventory.productName')}</label>
            <input
              className="form-control bg-transparent text-white border-secondary"
              placeholder={t('inventory.productExample')}
              value={formData.itemName}
              onChange={(e) =>
                setFormData({ ...formData, itemName: e.target.value })
              }
              required
            />
          </div>
          <div>
            <label className="form-label text-dim x-small text-uppercase fw-bold">{t('inventory.supplierLabel')}</label>
            <select
              className="form-select bg-dark text-white border-secondary"
              value={formData.supplierId || ""}
              onChange={(e) =>
                setFormData({ ...formData, supplierId: e.target.value })
              }
              required
            >
              <option value="">{t('inventory.selectSupplier')}</option>
              {partners
                .filter((p) => p.type === "Supplier")
                .map((p) => (
                  <option key={p.partner_id} value={p.partner_id}>
                    {p.partner_name}
                  </option>
                ))}
            </select>
          </div>
          <div className="row g-2">
            <div className="col-6">
              <label className="form-label text-dim x-small text-uppercase fw-bold">{t('inventory.unitCost')}</label>
              <input
                type="number"
                className="form-control bg-transparent text-white border-secondary"
                placeholder="0.00"
                value={formData.unitCost}
                onChange={(e) =>
                  setFormData({ ...formData, unitCost: e.target.value })
                }
                required
                min="0"
              />
            </div>
            <div className="col-6">
              <label className="form-label text-dim x-small text-uppercase fw-bold">{t('inventory.quantity')}</label>
              <input
                type="number"
                className="form-control bg-transparent text-white border-secondary"
                placeholder="0"
                value={formData.quantity}
                onChange={(e) =>
                  setFormData({ ...formData, quantity: e.target.value })
                }
                required
                min="0"
              />
            </div>
          </div>
          <div>
            <label className="form-label text-dim x-small text-uppercase fw-bold">{t('inventory.categoryLabel')}</label>
            <select
              className="form-select bg-dark text-white border-secondary"
              value={formData.category}
              onChange={(e) =>
                setFormData({ ...formData, category: e.target.value })
              }
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          {/* Existing Stock Display */}
          {editingId && (
            <div className="mb-3">
              <h6 className="text-dim x-small fw-bold border-bottom border-secondary border-opacity-25 pb-1 mb-2">{t('inventory.currentStock')}</h6>
              <div
                className="bg-black bg-opacity-20 rounded p-2 custom-scrollbar"
                style={{ maxHeight: "100px", overflowY: "auto" }}
              >
                {existingStock.length === 0 ? (
                  <div className="text-center text-dim x-small">
                    Chưa có tồn kho.
                  </div>
                ) : (
                  existingStock.map((s, idx) => (
                    <div
                      key={idx}
                      className="d-flex justify-content-between align-items-center text-x-small text-white mb-2 border-bottom border-secondary border-opacity-10 pb-2 last-border-0"
                    >
                      {editStockId === s.stock_id ? (
                        <div className="d-flex gap-2 w-100 align-items-center">
                          <span className="text-dim shrink-0">
                            {s.warehouse_name}
                          </span>
                          <input
                            type="text"
                            className="form-control form-control-sm bg-dark text-white border-secondary py-0 px-1"
                            value={editStockData.binLocation}
                            onChange={(e) =>
                              setEditStockData({
                                ...editStockData,
                                binLocation: e.target.value,
                              })
                            }
                            placeholder="Vị trí"
                            style={{ width: "40%" }}
                          />
                          <input
                            type="number"
                            className="form-control form-control-sm bg-dark text-white border-secondary py-0 px-1"
                            value={editStockData.quantity}
                            onChange={(e) =>
                              setEditStockData({
                                ...editStockData,
                                quantity: e.target.value,
                              })
                            }
                            placeholder="SL"
                            style={{ width: "30%" }}
                          />
                          <button
                            type="button"
                            onClick={() => saveStock(s.stock_id)}
                            className="btn btn-sm text-success p-0 ms-1"
                          >
                            <Save size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={cancelEditStock}
                            className="btn btn-sm text-secondary p-0 ms-1"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ) : (
                        <>
                          <span>
                            {s.warehouse_name} (
                            <span className="text-info">{s.bin_location}</span>)
                          </span>
                          <div className="d-flex align-items-center gap-2">
                            <span className="fw-bold text-success me-2">
                              {s.quantity}
                            </span>
                            <button
                              type="button"
                              onClick={() => startEditStock(s)}
                              className="btn p-0 text-primary opacity-50 hover-opacity-100"
                            >
                              <Edit size={12} />
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteStock(s.stock_id)}
                              className="btn p-0 text-danger opacity-50 hover-opacity-100"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          <div className="p-3 border border-secondary border-dashed rounded bg-black bg-opacity-25">
            <h6 className="text-info x-small fw-bold mb-2">
              <MapPin size={14} />{" "}
              {editingId
                ? t('inventory.importMoreOption')
                : t('inventory.importNewOption')}
            </h6>
            <div className="mb-2">
              <select
                className="form-select bg-dark text-white text-x-small border-secondary"
                value={formData.warehouseId}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    warehouseId: e.target.value,
                    binLocation: "Shelf 1",
                  })
                }
              >
                <option value="">{t('inventory.chooseWarehouse')}</option>
                {warehouses.map((w) => (
                  <option key={w.warehouse_id} value={w.warehouse_id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </div>
            {formData.warehouseId && (
              <div>
                <label className="text-dim x-small">{t('inventory.chooseShelf')}</label>
                <select
                  className="form-select bg-dark text-white text-x-small border-secondary"
                  value={formData.binLocation}
                  onChange={(e) =>
                    setFormData({ ...formData, binLocation: e.target.value })
                  }
                >
                  {getShelvesList().map((shelf) => (
                    <option key={shelf} value={shelf}>
                      {shelf}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="mt-auto pt-2">
            <button
              type="submit"
              className="btn btn-gold w-100"
              disabled={loading}
            >
              {loading ? (
                <span className="spinner-border spinner-border-sm"></span>
              ) : (
                <>
                  <Save size={16} /> {t('inventory.saveImport')}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// --- SUB-COMPONENT: WAREHOUSE DETAIL ---
const WarehouseDetail = ({ warehouse, onBack }) => {
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchInv = async () => {
      setLoading(true);
      try {
        const res = await axios.get(
          `/api/warehouses/${warehouse.warehouse_id}/inventory`,
        );
        setInventory(res.data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchInv();
  }, [warehouse.warehouse_id]); // Depend on warehouse.warehouse_id to refetch if warehouse changes

  return (
    <div className="h-100 d-flex flex-column fade-in-up">
      <div className="d-flex align-items-center gap-3 mb-4">
        <button onClick={onBack} className="btn btn-outline-light border-0">
          <ArrowLeft size={24} />
        </button>
        <div>
          <h4 className="fw-bold text-gold mb-0">{warehouse.name}</h4>
          <div className="text-dim small d-flex gap-3">
            <span>
              <MapPin size={14} /> {warehouse.location}
            </span>
            <span>
              <Box size={14} /> {warehouse.type}
            </span>
          </div>
        </div>
      </div>

      {/* Grid hiển thị các kệ hàng (Bin Locations) */}
      <div className="flex-grow-1 glass p-4 overflow-auto custom-scrollbar">
        <h6 className="text-uppercase text-dim font-monospace mb-3">
          SƠ ĐỒ TỒN KHO
        </h6>
        {loading ? (
          <div className="text-center py-5">
            <div className="text-dim mt-2">Đang kiểm kê kho...</div>
          </div>
        ) : inventory.length === 0 ? (
          <div className="text-center py-5 text-dim">
            <div className="mt-2">Kho đang trống</div>
          </div>
        ) : (
          <div className="row g-3">
            {inventory.map((stock) => (
              <div key={stock.stock_id} className="col-md-3 col-sm-6">
                <div className="p-3 border border-secondary border-opacity-25 rounded bg-black bg-opacity-20 hover-scale transition-all h-100">
                  <div className="d-flex justify-content-between mb-2">
                    <span className="badge bg-gold text-black font-monospace">
                      {stock.bin_location}
                    </span>
                    <small className="text-success fw-bold">
                      ${parseFloat(stock.unit_cost).toLocaleString()}
                    </small>
                  </div>
                  <h6
                    className="fw-bold text-white mb-1 text-truncate"
                    title={stock.item_name}
                  >
                    {stock.item_name}
                  </h6>
                  <div className="text-dim x-small mb-2">{stock.category}</div>
                  <div className="d-flex align-items-center gap-2">
                    <Layers size={16} className="text-info" />
                    <span className="fw-bold fs-5 text-white">
                      {stock.quantity}
                    </span>
                    <span className="text-dim x-small">đơn vị</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// --- MAIN COMPONENT: INVENTORY DASHBOARD ---
const InventoryManagement = () => {
  const { t } = useLanguage();
  const [viewMode, setViewMode] = useState("DASHBOARD"); // DASHBOARD, MASTER_DATA
  const [warehouses, setWarehouses] = useState([]);
  const [selectedWarehouse, setSelectedWarehouse] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false); // Modal state

  // Create Warehouse Form
  const [newWh, setNewWh] = useState({
    name: "",
    location: "",
    type: "Distribution Center",
    total_shelves: 50,
  });

  useEffect(() => {
    fetchWarehouses();
  }, []);
  const fetchWarehouses = async () => {
    try {
      const res = await axios.get("/api/warehouses");
      setWarehouses(res.data);
    } catch (e) {
      console.error(e);
    }
  };

  const handleCreateWarehouse = async (e) => {
    e.preventDefault();
    try {
      await axios.post("/api/warehouses", newWh);
      setShowCreateModal(false);
      setNewWh({
        name: "",
        location: "",
        type: "Distribution Center",
        total_shelves: 50,
      });
      fetchWarehouses();
      alert("Tạo kho thành công!");
    } catch (err) {
      alert(err.response?.data?.error || "Lỗi tạo kho");
    }
  };

  const handleDeleteWarehouse = async (id, name, e) => {
    e.stopPropagation(); // Prevent opening details
    if (!window.confirm(`Bạn có chắc chắn muốn xóa kho "${name}"?`)) return;
    try {
      await axios.delete(`/api/warehouses/${id}`);
      fetchWarehouses();
      alert("Xóa kho thành công!");
    } catch (err) {
      alert(err.response?.data?.error || err.response?.data || err.message || "Lỗi xóa kho");
    }
  };

  if (selectedWarehouse) {
    return (
      <WarehouseDetail
        warehouse={selectedWarehouse}
        onBack={() => setSelectedWarehouse(null)}
      />
    );
  }

  return (
    <div className="h-100 d-flex flex-column fade-in-up position-relative">
      {/* Header Tabs */}
      <div className="d-flex gap-4 mb-4 border-bottom border-secondary border-opacity-25 pb-2">
        <button
          onClick={() => setViewMode("DASHBOARD")}
          className={`btn border-0 fw-bold px-0 pb-2 rounded-0 ${viewMode === "DASHBOARD" ? "text-gold border-bottom border-gold border-2" : "text-dim"}`}
        >{t('inventory.overview')}</button>
        <button
          onClick={() => setViewMode("MASTER_DATA")}
          className={`btn border-0 fw-bold px-0 pb-2 rounded-0 ${viewMode === "MASTER_DATA" ? "text-gold border-bottom border-gold border-2" : "text-dim"}`}
        >{t('inventory.masterData')}</button>
      </div>

      {/* Content Area */}
      <div className="flex-grow-1 overflow-hidden">
        {viewMode === "MASTER_DATA" ? (
          <MasterData />
        ) : (
          <div className="h-100 overflow-auto custom-scrollbar p-1">
            <div className="row g-4">
              {warehouses.map((wh) => (
                <div key={wh.warehouse_id} className="col-md-4 col-xl-3">
                  <div
                    className="card h-100 bg-transparent border-0 glass warehouse-card cursor-pointer group"
                    onClick={() => setSelectedWarehouse(wh)}
                  >
                    <div className="card-body d-flex flex-column align-items-center justify-content-center text-center py-5 position-relative overflow-hidden">
                      {/* Background decoration */}
                      <Box
                        size={130}
                        className="position-absolute text-white opacity-5 warehouse-bg-icon"
                        style={{ right: -25, bottom: -25 }}
                      />

                      {/* Main icon */}
                      <div className="warehouse-icon mb-3">
                        <Box size={38} className="text-gold" />
                      </div>

                      {/* Delete Button */}
                      <button
                        className="btn btn-sm btn-outline-danger position-absolute top-0 end-0 m-2 border-0 opacity-0 group-hover-opacity-100 transition-all"
                        onClick={(e) => handleDeleteWarehouse(wh.warehouse_id, wh.name, e)}
                        title="Xóa kho"
                      >
                        <Trash2 size={16} />
                      </button>

                      <h5 className="fw-bold text-white mb-1">{wh.name}</h5>

                      <p className="text-dim small mb-3">
                        <MapPin size={12} className="me-1" />
                        {wh.location}
                      </p>

                      <div className="badge warehouse-type mb-3">{wh.type}</div>

                      <div className="text-center">
                        <div className="text-gold fw-bold font-monospace fs-4">
                          {wh.total_shelves || 50}
                        </div>
                        <div className="text-dim x-small text-uppercase">
                          TOTAL SHELVES
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              {/* Add Warehouse Button */}
              <div className="col-md-4 col-xl-3">
                <div
                  onClick={() => setShowCreateModal(true)}
                  className="card h-100 bg-transparent border border-secondary border-dashed rounded-3 d-flex align-items-center justify-content-center cursor-pointer hover-bg-light opacity-50 hover-opacity-100 transition-all"
                  style={{ minHeight: "250px" }}
                >
                  <div className="text-center text-dim">
                    <Plus size={32} className="mb-2" />
                    <div>Add New Warehouse</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modal Create Warehouse */}
      {showCreateModal && (
        <div
          className="position-fixed top-0 start-0 w-100 h-100 bg-black bg-opacity-75 d-flex align-items-center justify-content-center"
          style={{ zIndex: 1050 }}
        >
          <div
            className="glass p-4 rounded shadow-lg"
            style={{ width: "400px" }}
          >
            <div className="d-flex justify-content-between mb-4">
              <h5 className="fw-bold text-gold mb-0">ADD NEW WAREHOUSE</h5>
              <button
                onClick={() => setShowCreateModal(false)}
                className="btn btn-sm btn-link text-white"
              >
                <X size={20} />
              </button>
            </div>
            <form
              onSubmit={handleCreateWarehouse}
              className="d-flex flex-column gap-3"
            >
              <input
                className="form-control bg-transparent text-white border-secondary"
                placeholder="Warehouse name (e.g., Can Tho Warehouse)"
                value={newWh.name}
                onChange={(e) => setNewWh({ ...newWh, name: e.target.value })}
                required
              />
              <input
                className="form-control bg-transparent text-white border-secondary"
                placeholder="Location (e.g., Can Tho)"
                value={newWh.location}
                onChange={(e) =>
                  setNewWh({ ...newWh, location: e.target.value })
                }
                required
              />
              <select
                className="form-select bg-dark text-white border-secondary"
                value={newWh.type}
                onChange={(e) => setNewWh({ ...newWh, type: e.target.value })}
              >
                <option>Distribution Center</option>
                <option>Cold Storage</option>
                <option>Port Warehouse</option>
                <option>Retail Store</option>
              </select>
              {/* Input Total Shelves */}
              <div>
                <label className="text-dim x-small fw-bold">TOTAL SHELVES</label>
                <input
                  type="number"
                  className="form-control bg-transparent text-white border-secondary"
                  placeholder="e.g., 50"
                  value={newWh.total_shelves}
                  onChange={(e) =>
                    setNewWh({ ...newWh, total_shelves: e.target.value })
                  }
                  required
                  min="1"
                />
              </div>
              <button className="btn btn-gold w-100 mt-2">CREATE WAREHOUSE</button>
            </form>
          </div>
        </div>
      )}
      {/* CSS Animations & Hover Effects */}
      <style>{`
        .warehouse-card:hover .group-hover-opacity-100 {
          opacity: 1 !important;
        }
        .warehouse-icon {
          transition: transform 0.3s ease;
        }
        .warehouse-card:hover .warehouse-icon {
          transform: translateY(-5px);
        }
        .warehouse-bg-icon {
          transition: all 0.5s ease;
        }
        .warehouse-card:hover .warehouse-bg-icon {
          transform: scale(1.2) rotate(-10deg);
          opacity: 0.1 !important;
        }
        .cursor-pointer { cursor: pointer; }
        .transition-all { transition: all 0.3s ease; }
      `}</style>
    </div>
  );
};

export default InventoryManagement;
