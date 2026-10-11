import { existsSync } from 'node:fs';

/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['pg'],
  eslint: { ignoreDuringBuilds: true },
  env: {
    // Shows the official Razorpay logo only if the file has been added to /public.
    NEXT_PUBLIC_RZP_LOGO: existsSync('public/razorpay-logo.svg') ? '/razorpay-logo.svg' : existsSync('public/razorpay-logo.png') ? '/razorpay-logo.png' : '',
  },
};
export default nextConfig;
