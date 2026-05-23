const inquiryService =
  require('./inquiry.service');

const asyncHandler =
  require('../../helpers/asyncHandler');

const sendResponse =
  require('../../helpers/sendResponse');

/* ======================
   CREATE INQUIRY
====================== */

exports.createInquiry =
  asyncHandler(
    async (req, res) => {

      const inquiry =
        await inquiryService.createInquiry(
          req.body
        );

      return sendResponse(res, {
        statusCode: 201,

        message:
          'Inquiry submitted',

        data: inquiry
      });

    }
  );

/* ======================
   GET INQUIRIES
====================== */

exports.getInquiries =
  asyncHandler(
    async (req, res) => {

      const result =
        await inquiryService.getAllInquiries(
          req.query
        );

      return sendResponse(res, {
        message:
          'Inquiries fetched',

        data:
          result.inquiries,

        meta:
          result.pagination
      });

    }
  );