import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')

// 从环境变量读取基础路径，默认为 /
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '/';

/** @type {import('next').NextConfig} */
const nextConfig: NextConfig = {
  /* config options here */
  basePath: basePath.endsWith('/') ? basePath.slice(0, -1) : basePath,
  assetPrefix: basePath,
  compiler: {
    // 生产环境移除 console.log，但保留 warn 和 error
    removeConsole:
      process.env.NODE_ENV === 'production'
        ? { exclude: ['warn', 'error'] }
        : false,
  },
  turbopack: {
    root: __dirname,
  },
  output: 'standalone',
  async rewrites() {
    return [
      {
        source: '/socket.io',
        destination: 'http://127.0.0.1:4000/socket.io/',
      },
      {
        source: '/socket.io/:path*',
        destination: 'http://127.0.0.1:4000/socket.io/:path*',
      },
    ]
  },
}

export default withNextIntl(nextConfig)
