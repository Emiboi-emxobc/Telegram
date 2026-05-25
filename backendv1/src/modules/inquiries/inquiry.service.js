const Inquiry =
  require('./inquiry.model');

/* ======================
   CREATE INQUIRY
====================== */

async function createInquiry(
  payload
) {

  return await Inquiry.create(
    payload
  );

}

/* ======================
   GET ALL INQUIRIES
====================== */

async function getAllInquiries(
  queryParams = {}
) {

  const {
    status,
    page = 1,
    limit = 20
  } = queryParams;

  const filters = {};

  /* status filter */

  if (status) {

    filters.status = status;

  }

  /* pagination */

  const currentPage =
    Math.max(
      Number(page) || 1,
      1
    );

  const pageLimit =
    Math.min(
      Math.max(
        Number(limit) || 20,
        1
      ),
      100
    );

  const skip =
    (currentPage - 1)
    * pageLimit;

  const inquiries =
    await Inquiry.find(filters)

      .populate(
        'product',
        'name slug images'
      )

      .sort({
        createdAt: -1
      })

      .skip(skip)

      .limit(pageLimit)

      .lean();

  const total =
    await Inquiry.countDocuments(
      filters
    );

  return {
    inquiries,

    pagination: {
      total,
      page:
        currentPage,
      limit:
        pageLimit,

      pages:
        Math.ceil(
          total /
          pageLimit
        )
    }
  };

}

module.exports = {
  createInquiry,
  getAllInquiries
};