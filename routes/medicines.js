const router = require("express").Router();
const pool = require("../config/db");
const auth = require("../middleware/auth");

router.get("/", auth, async (req, res) => {
  try {
    let { page = 1, limit = 10, search = "", lowStock } = req.query;

    page = parseInt(page);
    limit = parseInt(limit);
    const offset = (page - 1) * limit;

    let baseSql = `FROM medicines WHERE 1=1`;
    let params = [];

    // 🔍 search theo tên thuốc
    if (search) {
      baseSql += ` AND medicine_name LIKE ?`;
      params.push(`%${search}%`);
    }

    // ⚠️ lọc thuốc sắp hết
    if (lowStock === "true") {
      baseSql += ` AND stock < 10`;
    }

    // 📊 count
    const [countRows] = await pool.query(
      `SELECT COUNT(*) as total ${baseSql}`,
      params
    );

    const total = countRows[0].total;

    // 📄 data
    const [rows] = await pool.query(
      `SELECT * ${baseSql} ORDER BY id DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    res.json({
      success: true,
      data: rows,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});
router.post("/", auth, async (req, res) => {
  try {
    const { medicine_name, unit, price, stock } = req.body;

    // ❌ validate
    if (!medicine_name || !price) {
      return res.status(400).json({
        success: false,
        message: "medicine_name và price là bắt buộc",
      });
    }

    // ❌ check trùng tên thuốc
    const [exist] = await pool.query(
      "SELECT id FROM medicines WHERE medicine_name = ?",
      [medicine_name]
    );

    if (exist.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Thuốc đã tồn tại",
      });
    }

    await pool.query(
      `INSERT INTO medicines (medicine_name, unit, price, stock)
       VALUES (?, ?, ?, ?)`,
      [medicine_name, unit, price, stock || 0]
    );

    res.json({
      success: true,
      message: "Thêm thuốc thành công",
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}); 
router.put("/:id", auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { medicine_name, unit, price, stock } = req.body;

    // ❌ check tồn tại
    const [check] = await pool.query(
      "SELECT id FROM medicines WHERE id = ?",
      [id]
    );

    if (check.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy thuốc",
      });
    }

    await pool.query(
      `UPDATE medicines 
       SET medicine_name=?, unit=?, price=?, stock=? 
       WHERE id=?`,
      [medicine_name, unit, price, stock, id]
    );

    res.json({
      success: true,
      message: "Cập nhật thuốc thành công",
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});
router.delete("/:id", auth, async (req, res) => {
  try {
    const { id } = req.params;

    // ❌ check tồn tại
    const [check] = await pool.query(
      "SELECT id FROM medicines WHERE id = ?",
      [id]
    );

    if (check.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Không tồn tại thuốc",
      });
    }

    // ❌ check nếu thuốc đã dùng trong đơn → không xoá
    const [used] = await pool.query(
      "SELECT id FROM prescriptions WHERE medicine_id = ?",
      [id]
    );

    if (used.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Thuốc đã được sử dụng, không thể xoá",
      });
    }

    await pool.query("DELETE FROM medicines WHERE id = ?", [id]);

    res.json({
      success: true,
      message: "Xoá thuốc thành công",
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});
router.patch("/:id/stock", auth, async (req, res) => {
  try {
    const { quantity } = req.body;

    const [rows] = await pool.query(
      "SELECT stock FROM medicines WHERE id = ?",
      [req.params.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy thuốc",
      });
    }

    const currentStock = rows[0].stock;

    if (currentStock < quantity) {
      return res.status(400).json({
        success: false,
        message: "Không đủ tồn kho",
      });
    }

    await pool.query(
      "UPDATE medicines SET stock = stock - ? WHERE id = ?",
      [quantity, req.params.id]
    );

    res.json({
      success: true,
      message: "Trừ kho thành công",
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});
module.exports = router;