const router = require("express").Router();
const pool = require("../config/db");
const auth = require("../middleware/auth");
router.get("/overview", auth, async (req, res) => {
  try {
    // 👨‍⚕️ tổng bệnh nhân
    const [patients] = await pool.query(
      "SELECT COUNT(*) as total FROM patients"
    );

    // 🏥 tổng phiếu khám
    const [appointments] = await pool.query(
      "SELECT COUNT(*) as total FROM appointments"
    );

    // 💊 tổng đơn thuốc
    const [prescriptions] = await pool.query(
      "SELECT COUNT(*) as total FROM prescriptions"
    );

    // 💰 tổng doanh thu
    const [revenue] = await pool.query(
      "SELECT SUM(total_amount) as total FROM invoices"
    );

    // 📦 thuốc sắp hết
    const [lowStock] = await pool.query(
      "SELECT COUNT(*) as total FROM medicines WHERE stock < 10"
    );

    res.json({
      success: true,
      data: {
        totalPatients: patients[0].total,
        totalAppointments: appointments[0].total,
        totalPrescriptions: prescriptions[0].total,
        totalRevenue: revenue[0].total || 0,
        lowStockMedicines: lowStock[0].total,
      },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
});
router.get("/revenue-by-day", auth, async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        DATE(created_at) as date,
        SUM(total_amount) as revenue
      FROM invoices
      GROUP BY DATE(created_at)
      ORDER BY date DESC
      LIMIT 7
    `);

    res.json({
      success: true,
      data: rows,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});
router.get("/patients-by-day", auth, async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as total
      FROM patients
      GROUP BY DATE(created_at)
      ORDER BY date DESC
      LIMIT 7
    `);

    res.json({
      success: true,
      data: rows,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});
router.get("/low-stock-medicines", auth, async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT * 
      FROM medicines
      WHERE stock < 10
      ORDER BY stock ASC
    `);

    res.json({
      success: true,
      data: rows,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});
router.get("/top-medicines", auth, async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        m.medicine_name,
        SUM(p.quantity) as total_used
      FROM prescriptions p
      JOIN medicines m ON p.medicine_id = m.id
      GROUP BY p.medicine_id
      ORDER BY total_used DESC
      LIMIT 5
    `);

    res.json({
      success: true,
      data: rows,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});
router.get("/revenue-by-range", auth, async (req, res) => {
  try {
    const { month, year } = req.query;

    let sql = `
      SELECT 
        DATE(created_at) as date,
        SUM(total_amount) as revenue
      FROM invoices
      WHERE 1=1
    `;

    const params = [];

    if (month) {
      sql += " AND MONTH(created_at) = ?";
      params.push(month);
    }

    if (year) {
      sql += " AND YEAR(created_at) = ?";
      params.push(year);
    }

    sql += " GROUP BY DATE(created_at) ORDER BY date ASC";

    const [rows] = await pool.query(sql, params);

    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});
module.exports = router;