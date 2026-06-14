const Order =
  require("./order.model.js");

const Cart =
  require("../cart/cart.model.js");

const getLocation =
  require("../../utils/getLocation.js");

const orderService = {

  async create(
    userId,
    payload,
    ip
  ) {

    const cart =
      await Cart
        .findOne({
          user: userId
        })
        .populate(
          "items.product"
        );

    if (
      !cart ||
      cart.items.length === 0
    ) {

      throw new Error(
        "Cart is empty."
      );
    }

    const items =
      cart.items.map(
        item => ({
          product:
            item.product._id,

          quantity:
            item.quantity,

          price:
            item.product.price
        })
      );

    const subtotal =
      items.reduce(
        (
          total,
          item
        ) =>
          total +
          (
            item.price *
            item.quantity
          ),
        0
      );

    const requestLocation =
      await getLocation(ip);

    const order =
      await Order.create({
        user: userId,

        items,

        subtotal,

        total: subtotal,

        paymentMethod:
          payload.paymentMethod,

        customer:
          payload.customer,

        notes:
          payload.notes,

        location:
          payload.location,

        requestLocation
      });

    cart.items = [];

    await cart.save();

    return Order
      .findById(
        order._id
      )
      .populate(
        "items.product"
      );
  },

  async get(userId) {

    return Order
      .find({
        user: userId
      })
      .populate(
        "items.product"
      )
      .sort({
        createdAt: -1
      });
  },

  async getOne(
    userId,
    orderId
  ) {

    return Order
      .findOne({
        _id: orderId,
        user: userId
      })
      .populate(
        "items.product"
      );
  },
  
  async confirm(id) {
  return this.changeStatus(
    id,
    "pending",
    "confirmed"
  );
},

async process(id) {
  return this.changeStatus(
    id,
    "confirmed",
    "processing"
  );
},

async ship(id) {
  return this.changeStatus(
    id,
    "processing",
    "shipped"
  );
},

async deliver(id) {
  return this.changeStatus(
    id,
    "shipped",
    "delivered"
  );
},

async cancel(id) {

  const order =
    await Order.findById(id);

  if (!order) {
    throw new Error(
      "Order not found."
    );
  }

  if (
    [
      "delivered",
      "cancelled"
    ].includes(order.status)
  ) {

    throw new Error(
      `Cannot cancel ${order.status} order`
    );
  }

  order.status =
    "cancelled";

  await order.save();

  return Order.findById(id)
    .populate("user", "name email")
    .populate("items.product");
},



};

module.exports =
  orderService;