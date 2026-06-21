const Wishlist =
  require("./wishlist.model.js");

const wishlistService = {

  async get(userId) {

    let wishlist =
      await Wishlist
        .findOne({
          user: userId
        })
        .populate("items");

    if (!wishlist) {

      wishlist =
        await Wishlist.create({
          user: userId,
          items: []
        });

      wishlist =
        await Wishlist
          .findById(
            wishlist._id
          )
          .populate("items");
    }

    return wishlist;
  },

  async toggle(
    userId,
    productId
  ) {

    let wishlist =
      await Wishlist.findOne({
        user: userId
      });

    if (!wishlist) {

      wishlist =
        await Wishlist.create({
          user: userId,
          items: []
        });
    }

    const exists =
      wishlist.items.some(
        item =>
          item.toString() ===
          productId
      );

    if (exists) {

      wishlist.items =
        wishlist.items.filter(
          item =>
            item.toString() !==
            productId
        );

    } else {

      wishlist.items.push(
        productId
      );
    }

    await wishlist.save();

    return this.get(userId);
  },

  async clear(userId) {

    await Wishlist.findOneAndUpdate(
      {
        user: userId
      },
      {
        items: []
      }
    );

    return this.get(userId);
  }
};

module.exports =
  wishlistService;