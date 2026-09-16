/** @type {import('next').NextConfig} */
const nextConfig = {
  // PDF.js loads its Node canvas polyfills and worker relative to import.meta.url.
  // Keep the package intact instead of bundling it into a Next.js server chunk.
  serverExternalPackages: ['@napi-rs/canvas'],
  webpack(config, { isServer }) {
    if (isServer) {
      config.externals.push(({ request }, callback) => {
        if (request === 'pdfjs-dist/legacy/build/pdf.mjs') {
          return callback(null, `import ${request}`);
        }
        callback();
      });
    }
    return config;
  },
  outputFileTracingIncludes: {
    '/api/admin/rag/index-reference-pdfs': [
      './node_modules/pdfjs-dist/package.json',
      './node_modules/pdfjs-dist/legacy/build/pdf.mjs',
      './node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs',
      './node_modules/pdfjs-dist/standard_fonts/**/*',
      './node_modules/@napi-rs/canvas/**/*',
      './node_modules/@napi-rs/canvas-linux-*/**/*',
    ],
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  images: {
    unoptimized: true,
  },
}

export default nextConfig
