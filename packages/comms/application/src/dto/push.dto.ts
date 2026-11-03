/** One device's push subscription, as the browser gives it. */
export interface PushSubscriptionDto {
  readonly endpoint: string;
  readonly keys: { readonly p256dh: string; readonly auth: string };
}

/** What a device needs to subscribe: the server's VAPID public key, base64url. */
export interface PushKeyDto {
  readonly publicKey: string;
}
