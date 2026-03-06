// Update Shipment Status
app.put('/api/shipments/:id/status', authenticateToken, authorizeRole(['Admin', 'Staff']), async (req, res) => {
    const { status } = req.body;
    try {
        const pool = await connectDB();
        await pool.request()
            .input('status', sql.NVarChar, status)
            .input('id', sql.Int, req.params.id)
            .query("UPDATE shipments SET status = @status WHERE shipment_id = @id");

        await logAudit(req.user.id, 'UPDATE_SHIPMENT_STATUS', { shipmentId: req.params.id, status });
        res.json({ message: 'Status updated' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});
