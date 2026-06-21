const bcrypt = require("bcryptjs");
const User = require("./modules/auth/auth.model");

async function seedAdmin() {
  try {
    const email = process.env.ADMIN_EMAIL||"marsdove1@gmail.com";

    const existing = await User.findOne({ email });

    if (existing) {
      console.log("⚡ Admin already exists");
      return;
    }

    const hashedPassword = await bcrypt.hash(
      process.env.ADMIN_PASSWORD,
      12
    );

    await User.create({
      name: "Mecus Ventures",
      email: email,
      phone: "09122154145",
      password: hashedPassword,
      role: "admin"
    });

    console.log("🔥 Admin seeded successfully");
  } catch (err) {
    console.error("❌ Admin seed failed:", err.message);
  }
}

module.exports = seedAdmin;