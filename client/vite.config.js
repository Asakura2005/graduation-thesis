import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
    plugins: [react()],
    server: {
        port: 3000,
        proxy: {
            '/api': {
                target: 'http://localhost:5001',
                changeOrigin: true,
                configure: (proxy) => {
                    proxy.on('proxyReq', (proxyReq, req) => {
                        // Forward the real client IP to the backend
                        const clientIp = req.socket.remoteAddress;
                        if (clientIp) {
                            proxyReq.setHeader('X-Forwarded-For', clientIp);
                            proxyReq.setHeader('X-Real-IP', clientIp);
                        }
                    });
                }
            }
        }
    },
    build: {
        outDir: 'dist',
        sourcemap: false,
    },
    // Expose env variables with VITE_ prefix to the client
    define: {
        __BACKEND_URL__: JSON.stringify(process.env.VITE_BACKEND_URL || 'http://localhost:5001')
    }
})
