// button.js — centralized inline button factory
import { PLANS } from "./sub.js";

/**
 * Dev / Developer buttons
 */
export function devMainButtons() {
  return [
    [{ text: "👤 Manage Users", callback_data: "dev_manage_users" }],
    [{ text: "📊 View Stats", callback_data: "dev_stats" }],
    [{ text: "💬 Broadcast", callback_data: "dev_broadcast" }],
    [{ text: "🛠️ Dev Commands", callback_data: "dev_commands" }],
  ];
}

/**
 * Regular user buttons
 */
export function userMainButtons() {
  return [
    [{ text: "🔁 Renew Subscription", callback_data: "user_renew" }],
    [{ text: "📊 Check Account Status", callback_data: "user_status" }],
    [{ text: "📝 Signup / Instructions", callback_data: "user_signup" }],
    [{ text: "❓ Help / Reset Password", callback_data: "user_help" }],
  ];
}

/**
 * Admin buttons (for users with isAdmin true)
 * Includes all regular user buttons + admin-specific actions
 */
export function adminMainButtons(isAdmin = false) {
  if (!isAdmin) return [];

  const adminExtra = [
    [{ text: "📝 Pending Requests", callback_data: "admin_pending" }],
    [{ text: "💳 Verify Payments", callback_data: "admin_verify" }],
    [{ text: "📦 Broadcast Messages", callback_data: "admin_broadcast" }],
    [{ text: "⚙️ Manage Users", callback_data: "admin_manage" }],
    [{ text: "🎉 Start Trial", callback_data: "user_trial" }],
  ];

  // merge regular user buttons with admin extras
  return [...userMainButtons(), ...adminExtra];
}

/**
 * Renewal plan selection buttons
 */
export function renewalPlanButtons() {
  return Object.keys(PLANS).map((plan) => [
    {
      text: `${plan.charAt(0).toUpperCase() + plan.slice(1)} - ₦${PLANS[plan].price}`,
      callback_data: `plan_${plan}`,
    },
  ]);
}

/**
 * Pending renewal action buttons for admin/dev
 * @param {string} reqId - RenewalRequest _id
 */
export function approveRejectButtons(reqId) {
  return [
    [
      { text: "✅ Approve", callback_data: `approve_${reqId}` },
      { text: "❌ Reject", callback_data: `reject_${reqId}` },
    ],
  ];
}

/**
 * Pending renewal action buttons for dev only (dev_approve_/dev_reject_)
 * @param {string} reqId - RenewalRequest _id
 */
export function devApproveRejectButtons(reqId) {
  return [
    [
      { text: "✅ Approve", callback_data: `dev_approve_${reqId}` },
      { text: "❌ Reject", callback_data: `dev_reject_${reqId}` },
    ],
  ];
}

/**
 * User subscription action buttons (e.g., for each subscription listed)
 * @param {string} subId
 */
export function subscriptionActionButtons(subId) {
  return [
    [
      { text: "❌ Cancel Subscription", callback_data: `cancel_${subId}` },
      { text: "📌 View Details", callback_data: `viewsub_${subId}` },
    ],
  ];
}

/**
 * Manage user buttons (delete/view subscriptions)
 * @param {string} userId
 */
export function manageUserButtons(userId) {
  return [
    [
      { text: "❌ Delete User", callback_data: `delete_${userId}` },
      { text: "📌 View Sub", callback_data: `viewsub_${userId}` },
    ],
  ];
}

/**
 * Broadcast confirm buttons (optional if you want inline confirmation)
 * @param {string} msgId
 */
export function broadcastConfirmButtons(msgId) {
  return [
    [
      { text: "✅ Confirm", callback_data: `broadcast_confirm_${msgId}` },
      { text: "❌ Cancel", callback_data: `broadcast_cancel_${msgId}` },
    ],
  ];
}


