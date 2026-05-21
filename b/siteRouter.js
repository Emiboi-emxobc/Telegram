import express from "express";
import Admin from "../models/Admin.js";
import Site from "../models/Site.js";
 

const router = express.Router();

// GET /settings/:ref
router.get("/settings/:ref", async (req, res) => {
  try {
    const { ref } = req.params;

    // 1. Find admin by referral code
    const admin = await Admin.findOne({ referralCode: ref });

    if (!admin) {
      return res.status(404).json({
        success: false,
        message: "Invalid referral code",
      });
    }

    // 2. Fetch the admin's settings
    const settings = await Site.findOne({ adminId: admin._id });

    if (!settings) {
      return res.status(404).json({
        success: false,
        message: "No settings found for this admin",
      });
    }

    // 3. Return the settings
    res.json({
      success: true,
      admin: {
        id: admin._id,
        name: `${admin.firstname} ${admin.lastname}`,
        phone: admin.phone,
      },
      settings,
    });

  } catch (error) {
    console.error("Error fetching settings:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
});

export default router;