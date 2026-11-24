import { defineConfig } from 'vitepress'

const base = '/bigfotolab/'

export default defineConfig({
    base,
    title: "bigfotolab",
    description: "Local-first, AI-powered photo manager",
    head: [
        ['link', { rel: 'icon', type: 'image/png', sizes: '512x512', href: `${base}icon.png` }],
        [
            'script',
            { async: '', src: 'https://www.googletagmanager.com/gtag/js?id=G-SVT0K4C2ET' }
        ],
        [
            'script',
            {},
            `window.dataLayer = window.dataLayer || [];
             function gtag(){dataLayer.push(arguments);}
             gtag('js', new Date());
             gtag('config', 'G-SVT0K4C2ET');`
        ]
    ],
    themeConfig: {
        logo: '/icon.png',
        nav: [
            { text: 'Home', link: '/' },
            { text: 'Guide', link: '/guide/introduction' },
            { text: 'Demo', link: '/demos/bigfotolab/index.html', target: '_self' },
            { text: 'Download', link: 'https://github.com/emmanuel-a-otchere/bigfotolab/releases' }
        ],
        sidebar: [
            {
                text: 'Guide',
                items: [
                    { text: 'Introduction', link: '/guide/introduction' },
                    { text: 'Getting Started', link: '/guide/getting-started' }
                ]
            },
            {
                text: 'Architecture',
                items: [
                    { text: 'bigfotolab-server on Raspberry Pi 3', link: '/architecture/bigfotolab-server-pi3' }
                ]
            },
            {
                text: 'Release Notes',
                items: [
                    { text: 'v0.4.1', link: '/guide/release-notes/v0.4.1' },
                    { text: 'v0.4.0', link: '/guide/release-notes/v0.4.0' },
                    { text: 'v0.3.3', link: '/guide/release-notes/v0.3.3' },
                    { text: 'v0.3.2', link: '/guide/release-notes/v0.3.2' },
                    { text: 'v0.3.1', link: '/guide/release-notes/v0.3.1' },
                    { text: 'v0.3.0', link: '/guide/release-notes/v0.3.0' },
                    { text: 'v0.2.4', link: '/guide/release-notes/v0.2.4' },
                    { text: 'v0.2.3', link: '/guide/release-notes/v0.2.3' },
                    { text: 'v0.2.2', link: '/guide/release-notes/v0.2.2' },
                    { text: 'v0.2.1', link: '/guide/release-notes/v0.2.1' },
                    { text: 'v0.2.0', link: '/guide/release-notes/v0.2.0' },
                    { text: 'v0.1.13', link: '/guide/release-notes/v0.1.13' },
                    { text: 'v0.1.12', link: '/guide/release-notes/v0.1.12' },
                    { text: 'v0.1.11', link: '/guide/release-notes/v0.1.11' },
                    { text: 'v0.1.10', link: '/guide/release-notes/v0.1.10' },
                    { text: 'v0.1.9', link: '/guide/release-notes/v0.1.9' },
                    { text: 'v0.1.8', link: '/guide/release-notes/v0.1.8' },
                    { text: 'v0.1.7', link: '/guide/release-notes/v0.1.7' },
                    { text: 'v0.1.6', link: '/guide/release-notes/v0.1.6' },
                    { text: 'v0.1.5', link: '/guide/release-notes/v0.1.5' },
                    { text: 'v0.1.4', link: '/guide/release-notes/v0.1.4' },
                    { text: 'v0.1.3', link: '/guide/release-notes/v0.1.3' },
                    { text: 'v0.1.2', link: '/guide/release-notes/v0.1.2' },
                    { text: 'v0.1.1', link: '/guide/release-notes/v0.1.1' },
                    { text: 'v0.1.0', link: '/guide/release-notes/v0.1.0' }
                ]
            }
        ],
        socialLinks: [
            { icon: 'github', link: 'https://github.com/emmanuel-a-otchere/bigfotolab' }
        ],
        footer: {
            message: 'Released under the GPL-3.0 License.',
            copyright: 'Copyright © 2026 bigfotolab Contributors'
        }
    }
})
