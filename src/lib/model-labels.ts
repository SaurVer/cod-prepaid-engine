// Plain-language names for the 8 models and their inputs.

export const MODEL_NAME: Record<string, string> = {
  conv_none: 'Pays online · no message',
  conv_nudge: 'Pays online · reminder',
  conv_discount: 'Pays online · ₹50 off offer',
  cancel_none: 'Cancels · no message',
  cancel_nudge: 'Cancels · reminder',
  cancel_discount: 'Cancels · ₹50 off offer',
  rto_cod: 'Returned if COD',
  rto_pre: 'Returned if prepaid',
};
export const MODEL_DATA: Record<string, string> = {
  conv_none: 'Orders that got no message',
  conv_nudge: 'Orders sent a reminder',
  conv_discount: 'Orders sent the offer',
  cancel_none: 'Orders that got no message',
  cancel_nudge: 'Orders sent a reminder',
  cancel_discount: 'Orders sent the offer',
  rto_cod: 'Orders that shipped as COD',
  rto_pre: 'Orders that shipped prepaid',
};
export const FEATURE_LABEL: Record<string, string> = {
  delivered_orders: 'Past delivered orders',
  rto_count: 'Past returns (RTO)',
  cod_share: 'Share of past orders on COD',
  past_offer_response_rate: 'Past offer response rate',
  past_delivery_issue: 'Had a delivery issue',
  days_since_last_order: 'Days since last order',
  order_value: 'Order value (₹)',
  city_tier: 'City tier',
  channel_whatsapp: 'Reachable on WhatsApp',
  via_discount: 'Paid online via the offer',
};
