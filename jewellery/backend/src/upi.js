// Standard UPI deep link (NPCI "upi://pay"). Opens GPay / PhonePe / Paytm / any UPI app.
// Returning from the app proves nothing: the order stays "pending" until staff verify it.
export function upiLink({ upiId, payeeName, orderNumber, amountPaise, shopName, description }) {
  const params = {
    pa: upiId,
    pn: payeeName || shopName,
    tr: orderNumber,
    tn: `${(description || `${shopName} order`).slice(0, 49 - orderNumber.length)} ${orderNumber}`,
    am: (amountPaise / 100).toFixed(2),
    cu: 'INR',
  };
  // encodeURIComponent, not URLSearchParams: several UPI apps reject '+' for spaces
  return 'upi://pay?' + Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
}
