/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // src/instrumentation.ts starts the reminder-sweep scheduler at server boot
  experimental: { instrumentationHook: true },
};
export default nextConfig;
