const inquiryService = require('./inquiry.service');

exports.createInquiry = async (req, res) => {
  try {
    const inquiry = await inquiryService.createInquiry(req.body);

    res.status(201).json({
      success: true,
      data: inquiry
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

exports.getInquiries = async (req, res) => {
  try {
    const inquiries = await inquiryService.getAllInquiries();

    res.status(200).json({
      success: true,
      data: inquiries
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};