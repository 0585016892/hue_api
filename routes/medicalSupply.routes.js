const express = require("express");
const router = express.Router();
const db = require("../config/db");


// ================= GET LIST + PAGINATION =================
router.get("/", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    const search = req.query.search || "";

    const [rows] = await db.query(
      `SELECT * FROM medical_supplies
       WHERE name LIKE ?
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [`%${search}%`, limit, offset]
    );

    const [count] = await db.query(
      `SELECT COUNT(*) as total FROM medical_supplies
       WHERE name LIKE ?`,
      [`%${search}%`]
    );

    res.json({
      data: rows,
      total: count[0].total,
    });

  } catch (err) {
    res.status(500).json({ message: "Lỗi server" });
  }
});


// ================= CREATE =================
router.post("/", async (req, res) => {
  try {
    const {
      name,
      category,
      quantity,
      unit,
      price,
      supplier,
      expire_date,
    } = req.body;

    await db.query(
      `INSERT INTO medical_supplies 
       (name, category, quantity, unit, price, supplier, expire_date)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [name, category, quantity, unit, price, supplier, expire_date]
    );

    res.json({ message: "Thêm vật tư thành công" });

  } catch (err) {
    res.status(500).json({ message: "Lỗi server" });
  }
});


// ================= UPDATE =================
router.put("/:id", async (req, res) => {
  try {
    const {
      name,
      category,
      quantity,
      unit,
      price,
      supplier,
      expire_date,
    } = req.body;

    await db.query(
      `UPDATE medical_supplies
       SET name=?, category=?, quantity=?, unit=?, price=?, supplier=?, expire_date=?
       WHERE id=?`,
      [name, category, quantity, unit, price, supplier, expire_date, req.params.id]
    );

    res.json({ message: "Cập nhật thành công" });

  } catch (err) {
    res.status(500).json({ message: "Lỗi server" });
  }
});


// ================= DELETE =================
router.delete("/:id", async (req, res) => {
  try {
    await db.query(
      "DELETE FROM medical_supplies WHERE id=?",
      [req.params.id]
    );

    res.json({ message: "Xoá thành công" });

  } catch (err) {
    res.status(500).json({ message: "Lỗi server" });
  }
});

module.exports = router;