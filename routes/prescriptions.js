const router = require("express").Router();
const pool = require("../config/db");
const auth = require("../middleware/auth");

router.post("/", auth, async (req, res) => {
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    const { appointment_id, doctor_id, items } = req.body;

    if (!appointment_id || !doctor_id || !items?.length) {
      return res.status(400).json({
        success: false,
        message: "Thiếu dữ liệu",
      });
    }

    // 📌 check appointment
    const [app] = await conn.query(
      "SELECT * FROM appointments WHERE id = ?",
      [appointment_id]
    );

    if (!app.length) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy phiếu khám",
      });
    }

    // 📌 tạo prescription header
    const [pres] = await conn.query(
      `INSERT INTO prescriptions (appointment_id, doctor_id)
       VALUES (?, ?)`,
      [appointment_id, doctor_id]
    );

    const prescription_id = pres.insertId;

    let totalBill = 0;

    // 🔁 items
    for (const item of items) {
      const { medicine_id, quantity } = item;

      const [med] = await conn.query(
        "SELECT * FROM medicines WHERE id = ?",
        [medicine_id]
      );

      if (!med.length) {
        throw new Error("Thuốc không tồn tại");
      }

      const medicine = med[0];

      if (medicine.stock < quantity) {
        throw new Error(`Không đủ tồn kho: ${medicine.medicine_name}`);
      }

      const price = medicine.price * quantity;

      // 📌 insert detail
      await conn.query(
        `INSERT INTO prescription_items 
        (prescription_id, medicine_id, quantity, price)
        VALUES (?, ?, ?, ?)`,
        [prescription_id, medicine_id, quantity, price]
      );

      // 📉 trừ kho
      await conn.query(
        `UPDATE medicines SET stock = stock - ? WHERE id = ?`,
        [quantity, medicine_id]
      );

      totalBill += price;
    }

    // 📌 update appointment
    await conn.query(
      `UPDATE appointments SET status = 'completed' WHERE id = ?`,
      [appointment_id]
    );

    await conn.commit();

    res.json({
      success: true,
      message: "Kê đơn thành công",
      prescription_id,
      totalBill,
    });
  } catch (err) {
    await conn.rollback();

    res.status(500).json({
      success: false,
      message: err.message,
    });
  } finally {
    conn.release();
  }
});
router.get("/:appointment_id", auth, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `
      SELECT 
        p.id as prescription_id,
        p.appointment_id,
        pi.quantity,
        pi.price,
        m.medicine_name,
        m.price as unit_price
      FROM prescriptions p
      JOIN prescription_items pi ON p.id = pi.prescription_id
      JOIN medicines m ON pi.medicine_id = m.id
      WHERE p.appointment_id = ?
      `,
      [req.params.appointment_id]
    );

    res.json({
      success: true,
      data: rows,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});
router.delete("/:id", auth, async (req, res) => {
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    const [items] = await conn.query(
      "SELECT * FROM prescription_items WHERE prescription_id = ?",
      [req.params.id]
    );

    for (let item of items) {
      await conn.query(
        `UPDATE medicines SET stock = stock + ? WHERE id = ?`,
        [item.quantity, item.medicine_id]
      );
    }

    await conn.query(
      "DELETE FROM prescription_items WHERE prescription_id = ?",
      [req.params.id]
    );

    await conn.query(
      "DELETE FROM prescriptions WHERE id = ?",
      [req.params.id]
    );

    await conn.commit();

    res.json({
      success: true,
      message: "Xoá + hoàn kho thành công",
    });
  } catch (err) {
    await conn.rollback();

    res.status(500).json({
      success: false,
      message: err.message,
    });
  } finally {
    conn.release();
  }
});
router.get("/", auth, async (req, res) => {
  const conn = await pool.getConnection();

  console.log("📌 PRESCRIPTION API CALLED");
  console.log("query:", req.query);

  try {
    let { page = 1, limit = 10, search = "" } = req.query;

    page = Number(page);
    limit = Number(limit);
    const offset = (page - 1) * limit;

    let baseSql = `
      FROM prescriptions p
      JOIN appointments a ON p.appointment_id = a.id
      JOIN users u ON p.doctor_id = u.id
      JOIN patients pa ON a.patient_id = pa.id
      WHERE 1=1
    `;

    let params = [];

    if (search) {
      baseSql += `
        AND (
          pa.full_name LIKE ? 
          OR u.full_name LIKE ?
        )
      `;
      params.push(`%${search}%`, `%${search}%`);
    }

    // =========================
    // 📊 COUNT QUERY DEBUG
    // =========================
    const countQuery = `SELECT COUNT(*) as total ${baseSql}`;

    console.log("🧠 COUNT QUERY:");
    console.log(countQuery);
    console.log("📦 COUNT PARAMS:", params);

    const [countRows] = await conn.query(countQuery, params);

    console.log("📊 COUNT RESULT:", countRows);

    const total = countRows?.[0]?.total || 0;

    // =========================
    // 📄 DATA QUERY DEBUG
    // =========================
    const dataQuery = `
      SELECT 
        p.status,
        p.id as prescription_id,
        a.id as appointment_id,
        pa.full_name as patient_name,
        u.full_name as doctor_name
      ${baseSql}
      ORDER BY p.id DESC
      LIMIT ? OFFSET ?
    `;

    console.log("🧠 DATA QUERY:");
    console.log(dataQuery);
    console.log("📦 DATA PARAMS:", [
      ...params,
      limit,
      offset,
    ]);

    const [rows] = await conn.query(dataQuery, [
      ...params,
      limit,
      offset,
    ]);

    console.log("📦 RESULT ROWS:", rows.length);

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
    // =========================
    // ❌ FULL ERROR LOG
    // =========================
    console.error("❌ PRESCRIPTION API ERROR:");
    console.error("message:", err.message);
    console.error("code:", err.code);
    console.error("sqlState:", err.sqlState);
    console.error("errno:", err.errno);
    console.error("stack:", err.stack);

    res.status(500).json({
      success: false,
      message: err.message,
      code: err.code,
    });
  } finally {
    conn.release();
  }
});
router.get("/detail/:id", auth, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `
      SELECT 
        p.id as prescription_id,
        pa.full_name as patient_name,
        u.full_name as doctor_name
      FROM prescriptions p
      JOIN appointments a ON p.appointment_id = a.id
      JOIN patients pa ON a.patient_id = pa.id
      JOIN users u ON p.doctor_id = u.id
      WHERE p.id = ?
      `,
      [req.params.id]
    );

    const [items] = await pool.query(
      `
      SELECT 
        pi.*,
        m.medicine_name,
        m.price
      FROM prescription_items pi
      JOIN medicines m ON pi.medicine_id = m.id
      WHERE pi.prescription_id = ?
      `,
      [req.params.id]
    );

    res.json({
      success: true,
      data: {
        info: rows[0],
        items,
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;