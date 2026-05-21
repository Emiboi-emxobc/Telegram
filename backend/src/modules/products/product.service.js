const crypto =
  require('crypto');

const slugify =
  require('slugify');

const Product =
  require('./product.model');

async function getProducts(
  queryParams = {}
) {
  const {
    search,
    category,
    featured,
    trending,
    min,
    max,
    sort = '-createdAt',
    page = 1,
    limit = 12
  } = queryParams;

  const filters = {
    isDeleted: false
  };

  if (search?.trim()) {
    filters.$text = {
      $search:
        search.trim()
    };
  }

  if (category?.trim()) {
    filters.category =
      category.trim();
  }

  if (featured !== undefined) {
    filters.featured =
      featured === 'true';
  }

  if (trending !== undefined) {
    filters.trending =
      trending === 'true';
  }

  if (min || max) {
    filters.price = {};

    if (min) {
      filters.price.$gte =
        Number(min);
    }

    if (max) {
      filters.price.$lte =
        Number(max);
    }
  }

  const currentPage =
    Math.max(
      Number(page) || 1,
      1
    );

  const pageLimit =
    Math.min(
      Math.max(
        Number(limit) || 12,
        1
      ),
      50
    );

  const skip =
    (currentPage - 1) *
    pageLimit;

  const allowedSorts = [
    'price',
    '-price',
    'createdAt',
    '-createdAt',
    'rating',
    '-rating',
    'sold',
    '-sold'
  ];

  const finalSort =
    allowedSorts.includes(sort)
      ? sort
      : '-createdAt';

  const products =
    await Product.find(filters)
      .select([
        'id',
        'slug',
        'name',
        'price',
        'promo',
        'currency',
        'images',
        'category',
        'rating',
        'featured',
        'trending'
      ].join(' '))
      .sort(finalSort)
      .skip(skip)
      .limit(pageLimit)
      .lean();

  const total =
    await Product.countDocuments(
      filters
    );

  return {
    products,

    pagination: {
      total,
      page: currentPage,
      limit: pageLimit,
      pages: Math.ceil(
        total / pageLimit
      )
    }
  };
}

async function getProductBySlug(
  slug
) {
  return await Product.findOne({
    slug,
    isDeleted: false
  }).lean();
}

async function createProduct(
  payload,
  user
) {
  const clean =
    sanitizeProduct(payload);

  clean.id =
    crypto.randomUUID();

  clean.slug = slugify(
    clean.name,
    {
      lower: true,
      strict: true
    }
  );

  clean.createdBy =
    user.id;

  return await Product.create(
    clean
  );
}

async function updateProduct(
  id,
  payload
) {
  return await Product.findByIdAndUpdate(
    id,
    sanitizeProduct(payload),
    {
      new: true,
      runValidators: true
    }
  );
}

async function deleteProduct(
  id
) {
  return await Product.findByIdAndUpdate(
    id,
    {
      isDeleted: true
    }
  );
}

function sanitizeProduct(
  payload
) {
  return {
    sku: payload.sku,
    name: payload.name,
    shortDescription:
      payload.shortDescription,

    description:
      payload.description,

    category:
      payload.category,

    subCategory:
      payload.subCategory,

    brand: payload.brand,
    color: payload.color,
    material:
      payload.material,

    finish: payload.finish,

    price: payload.price,
    promo: payload.promo,

    currency:
      payload.currency,

    stock: payload.stock,

    tags: payload.tags,

    features:
      payload.features,

    dimensions:
      payload.dimensions,

    images:
      payload.images,

    shipping:
      payload.shipping,

    featured:
      payload.featured,

    trending:
      payload.trending
  };
}

module.exports = {
  getProducts,
  getProductBySlug,
  createProduct,
  updateProduct,
  deleteProduct
};