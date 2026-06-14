const orderService =
  require("./order.service.js");

const orderController = {

  async create(
    req,
    res,
    next
  ) {

    try {

      const order =
        await orderService.create(
          req.user.id,
          req.body,
          req.ip
        );

      res.status(201).json({
        success: true,
        data: order
      });

    } catch (error) {

      next(error);
    }
  },

  async get(
    req,
    res,
    next
  ) {

    try {

      const orders =
        await orderService.get(
          req.user.id
        );

      res.json({
        success: true,
        data: orders
      });

    } catch (error) {

      next(error);
    }
  },

  async getOne(
    req,
    res,
    next
  ) {

    try {

      const order =
        await orderService.getOne(
          req.user.id,
          req.params.id
        );

      if (!order) {

        return res
          .status(404)
          .json({
            success: false,
            message:
              "Order not found."
          });
      }

      res.json({
        success: true,
        data: order
      });

    } catch (error) {

      next(error);
    }
  }
};

module.exports =
  orderController;