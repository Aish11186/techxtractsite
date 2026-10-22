import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    '192.168.1.16',
    '192.168.1.16:3000',
    '192.168.1.16:3443',
    '192.168.1.3',
    '192.168.1.3:3000',
    '192.168.1.3:3443',
    'localhost',
    'localhost:3000',
    'localhost:3443',
    '127.0.0.1',
    '127.0.0.1:3000',
    '127.0.0.1:3443',
  ],
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://127.0.0.1:8000/api/:path*',
      },
    ];
  },
};

export default nextConfig;
