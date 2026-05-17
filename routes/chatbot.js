const express = require("express");
const multer = require("multer");
const axios = require("axios");

const router = express.Router();
const upload = multer({ limits: { fileSize: 5 * 1024 * 1024 } }); // 5MB

router.post("/", upload.single("image"), async (req, res) => {
  console.log("\n===== HEALTHCARE AI REQUEST =====");

  try {
    const { message } = req.body;
    const imageFile = req.file;

    console.log("📩 Message:", message);
    console.log("🖼 Image:", !!imageFile);

    // =========================
    // SYSTEM PROMPT (CHUẨN BỆNH VIỆN)
    // =========================
    const systemPrompt = `
Bạn là AI Chatbot của BỆNH VIỆN HEALTHCARE.

🎯 NHIỆM VỤ:
- Tư vấn thông tin y khoa tổng quát (nội, ngoại, tim mạch, hô hấp, tiêu hóa, thần kinh, da liễu bệnh lý, nhi khoa, sản khoa).
- Phân tích triệu chứng theo hướng tham khảo.
- Hướng dẫn xử lý ban đầu an toàn.
- Gợi ý chuyên khoa phù hợp tại bệnh viện HEALTHCARE.
- Hỗ trợ thông tin dịch vụ bệnh viện.

🚫 TUYỆT ĐỐI KHÔNG:
- Không kê đơn thuốc.
- Không chẩn đoán chắc chắn.
- Không tư vấn spa, skincare, thẩm mỹ, làm đẹp.
- Không đề xuất mỹ phẩm hoặc dịch vụ làm đẹp.

⚠️ NGOÀI PHẠM VI:
- Lịch sự từ chối và hướng về y tế.

🧠 PHONG CÁCH:
- 4–10 dòng.
- Dễ hiểu, chuyên nghiệp như nhân viên y tế.
- Không dùng tiếng Anh (trừ thuật ngữ y khoa bắt buộc).

📌 LUÔN KẾT:
"Thông tin chỉ mang tính tham khảo, không thay thế tư vấn y tế trực tiếp từ bác sĩ."
`;

    // =========================
    // USER CONTENT
    // =========================
    let userContent = message || "";

    if (imageFile) {
      userContent += "\n[Người dùng có gửi hình ảnh - cần phân tích triệu chứng nếu liên quan y khoa]";
    }

    // =========================
    // CALL OPENROUTER
    // =========================
    const response = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "meta-llama/llama-3-8b-instruct",
        messages: [
          {
            role: "system",
            content: systemPrompt,
          },
          {
            role: "user",
            content: userContent,
          },
        ],
        temperature: 0.4,
        max_tokens: 600,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    const reply = response.data.choices?.[0]?.message?.content;

    console.log("✅ AI RESPONSE:");
    console.log(reply);

    return res.json({
      success: true,
      reply,
    });

  } catch (error) {
    console.error("❌ HEALTHCARE AI ERROR:");
    console.error(error.response?.data || error.message);

    return res.status(500).json({
      success: false,
      reply: "Hệ thống AI tạm thời gián đoạn, vui lòng thử lại sau.",
    });
  }
});

module.exports = router;