const Cart =
  require("./cart.model.js");

const cartService = {

  async get(userId) {

    let cart =
      await Cart
        .findOne({
          user: userId
        })
        .populate(
          "items.product"
        );

    if (!cart) {

      cart =
        await Cart.create({
          user: userId,
          items: []
        });

      cart =
        await Cart
          .findById(cart._id)
          .populate(
            "items.product"
          );
    }

    return cart;
  },

  async add(
    userId,
    productId
  ) {

    let cart =
      await Cart.findOne({
        user: userId
      });

    if (!cart) {

      cart =
        await Cart.create({
          user: userId,
          items: []
        });
    }

    const existing =
      cart.items.find(
        item =>
          item.product.toString() ===
          productId
      );

    if (existing) {

      existing.qty += 1;

    } else {

      cart.items.push({
        product: productId,
        qty: 1
      });
    }

    await cart.save();

    return this.get(userId);
  },

  async updateQty(
    userId,
    productId,
    qty
  ) {

    const cart =
      await Cart.findOne({
        user: userId
      });

    if (!cart) {
      return null;
    }

    const item =
      cart.items.find(
        item =>
          item.product.toString() ===
          productId
      );

    if (!item) {
      return cart;
    }

    if (qty <= 0) {

      cart.items =
        cart.items.filter(
          item =>
            item.product.toString() !==
            productId
        );

    } else {

      item.qty = qty;
    }

    await cart.save();

    return this.get(userId);
  },

  async remove(
    userId,
    productId
  ) {

    const cart =
      await Cart.findOne({
        user: userId
      });

    if (!cart) {
      return null;
    }

    cart.items =
      cart.items.filter(
        item =>
          item.product.toString() !==
          productId
      );

    await cart.save();

    return this.get(userId);
  },

  async clear(userId) {

    const cart =
      await Cart.findOne({
        user: userId
      });

    if (!cart) {
      return null;
    }

    cart.items = [];

    await cart.save();

    return this.get(userId);
  }
};

module.exports =
  cartService;