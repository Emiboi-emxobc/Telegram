const productService = require('./product.service');

exports.getProducts = async (req, res) => {
  try {
    const result = await productService.getProducts(
      req.query
    );

    res.status(200).json({
      success: true,
      ...result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

exports.getProduct = async (req, res) => {
  try {
    const product =
      await productService.getProductBySlug(
        req.params.slug
      );

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    res.status(200).json({
      success: true,
      data: product
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

exports.createProduct = async (req, res) => {
  try {
    const product =
      await productService.createProduct(req.body);

    res.status(201).json({
      success: true,
      data: product
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

exports.updateProduct = async (req, res) => {
  try {
    const product =
      await productService.updateProduct(
        req.params.id,
        req.body
      );

    res.status(200).json({
      success: true,
      data: product
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

exports.deleteProduct = async (req, res) => {
  try {
    await productService.deleteProduct(
      req.params.id
    );

    res.status(200).json({
      success: true,
      message: 'Product deleted'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};


exports.uploadProductImage = async (req, res) => {
  try {
    const streamifier = require('streamifier');
    const cloudinary = require('../../config/cloudinary');

    const stream = cloudinary.uploader.upload_stream(
      { folder: 'marsdove-products' },
      (error, result) => {
        if (error) {
          return res.status(500).json({
            success: false,
            message: error.message
          });
        }

        res.status(200).json({
          success: true,
          url: result.secure_url
        });
      }
    );

    streamifier.createReadStream(req.file.buffer).pipe(stream);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};