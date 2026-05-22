const Joi =
  require('joi');

/* ======================
   CREATE PRODUCT
====================== */

exports.createProductSchema =
  Joi.object({

    id:
      Joi.string()
      .required(),

    sku:
      Joi.string()
      .required(),

    slug:
      Joi.string()
      .required(),

    name:
      Joi.string()
      .min(2)
      .max(200)
      .required(),

    shortDescription:
      Joi.string()
      .allow(''),

    description:
      Joi.string()
      .allow(''),

    category:
      Joi.string()
      .required(),

    subCategory:
      Joi.string()
      .allow(''),

    brand:
      Joi.string()
      .allow(''),

    color:
      Joi.string()
      .allow(''),

    material:
      Joi.string()
      .allow(''),

    finish:
      Joi.string()
      .allow(''),

    price:
      Joi.number()
      .min(0)
      .required(),

    promo:
      Joi.number()
      .min(0)
      .allow(null),

    currency:
      Joi.string()
      .default('NGN'),

    stock:
      Joi.number()
      .min(0)
      .default(0),

    tags:
      Joi.array()
      .items(
        Joi.string()
      ),

    features:
      Joi.array()
      .items(
        Joi.string()
      ),

    images:
      Joi.array()
      .items(
        Joi.string()
      ),

    featured:
      Joi.boolean(),

    trending:
      Joi.boolean()

  });

/* ======================
   UPDATE PRODUCT
====================== */

exports.updateProductSchema =
  Joi.object({

    name:
      Joi.string()
      .min(2)
      .max(200),

    shortDescription:
      Joi.string()
      .allow(''),

    description:
      Joi.string()
      .allow(''),

    category:
      Joi.string(),

    subCategory:
      Joi.string()
      .allow(''),

    brand:
      Joi.string()
      .allow(''),

    color:
      Joi.string()
      .allow(''),

    material:
      Joi.string()
      .allow(''),

    finish:
      Joi.string()
      .allow(''),

    price:
      Joi.number()
      .min(0),

    promo:
      Joi.number()
      .min(0)
      .allow(null),

    stock:
      Joi.number()
      .min(0),

    tags:
      Joi.array()
      .items(
        Joi.string()
      ),

    features:
      Joi.array()
      .items(
        Joi.string()
      ),

    images:
      Joi.array()
      .items(
        Joi.string()
      ),

    featured:
      Joi.boolean(),

    trending:
      Joi.boolean()

  });