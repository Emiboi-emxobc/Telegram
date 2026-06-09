const cartService =
  require("./cart.service.js");

const cartController = {

  async get(
    req,
    res,
    next
  ) {

    try {

      const cart =
        await cartService.get(
          req.user.id
        );

      res.json({
        success: true,
        data: cart
      });

    } catch (error) {

      next(error);
    }
  },

  async add(
    req,
    res,
    next
  ) {

    try {

      const cart =
        await cartService.add(
          req.user.id,
          req.params.productId
        );

      res.json({
        success: true,
        data: cart
      });

    } catch (error) {

      next(error);
    }
  },

  async updateQty(
    req,
    res,
    next
  ) {

    try {

      const cart =
        await cartService.updateQty(
          req.user.id,
          req.params.productId,
          Number(req.body.qty)
        );

      res.json({
        success: true,
        data: cart
      });

    } catch (error) {

      next(error);
    }
  },

  async remove(
    req,
    res,
    next
  ) {

    try {

      const cart =
        await cartService.remove(
          req.user.id,
          req.params.productId
        );

      res.json({
        success: true,
        data: cart
      });

    } catch (error) {

      next(error);
    }
  },

  async clear(
    req,
    res,
    next
  ) {

    try {

      const cart =
        await cartService.clear(
          req.user.id
        );

      res.json({
        success: true,
        data: cart
      });

    } catch (error) {

      next(error);
    }
  }
};

module.exports =
  cartController;