const wishlistService =
  require("./wishlist.service.js");

const wishlistController = {

  async get(
    req,
    res,
    next
  ) {

    try {

      const wishlist =
        await wishlistService.get(
          req.user.id
        );

      res.json({
        success: true,
        data: wishlist
      });

    } catch (error) {

      next(error);
    }
  },

  async toggle(
    req,
    res,
    next
  ) {

    try {

      const wishlist =
        await wishlistService.toggle(
          req.user.id,
          req.params.productId
        );

      res.json({
        success: true,
        data: wishlist
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

      const wishlist =
        await wishlistService.clear(
          req.user.id
        );

      res.json({
        success: true,
        data: wishlist
      });

    } catch (error) {

      next(error);
    }
  }
};

module.exports =
  wishlistController;