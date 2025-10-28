#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distPath = path.join(__dirname, '../dist');
const indexPath = path.join(distPath, 'index.html');

console.log('🎨 Pre-rendering static HTML shell...');

// Static HTML shell for instant first paint
const staticShell = `
<style>
  .skeleton { animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite; }
  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: .5; } }
</style>
<div class="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
  <header class="fixed top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-sm border-b shadow-sm">
    <div class="container mx-auto px-4 sm:px-6 py-4">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <img src="/images/logos/mihas-logo.png" alt="MIHAS Logo" class="h-10 w-10 sm:h-12 sm:w-12" width="48" height="48">
          <div>
            <h1 class="text-lg sm:text-xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">MIHAS</h1>
            <p class="text-xs text-gray-600">Application Portal</p>
          </div>
        </div>
        <nav class="hidden md:flex gap-6">
          <a href="#programs" class="text-sm font-medium text-gray-700 hover:text-blue-600 transition-colors">Programs</a>
          <a href="#accreditation" class="text-sm font-medium text-gray-700 hover:text-blue-600 transition-colors">Accreditation</a>
          <a href="/auth/signin" class="text-sm font-semibold text-blue-600 hover:text-blue-700 transition-colors">Sign In</a>
        </nav>
      </div>
    </div>
  </header>
  
  <main class="pt-24 pb-16">
    <section class="py-12 sm:py-20 px-4">
      <div class="container mx-auto max-w-5xl text-center">
        <div class="inline-block mb-4 px-4 py-2 bg-blue-100 text-blue-700 rounded-full text-sm font-semibold">
          🎓 Now Accepting Applications
        </div>
        <h2 class="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold text-gray-900 mb-6 leading-tight">
          Start Your Healthcare Career at <span class="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">MIHAS</span>
        </h2>
        <p class="text-lg sm:text-xl text-gray-600 mb-10 max-w-3xl mx-auto">
          Join Zambia's premier health sciences institution. Quality education, professional training, and career success.
        </p>
        <div class="flex flex-col sm:flex-row gap-4 justify-center items-center">
          <a href="/auth/signup" class="w-full sm:w-auto inline-flex items-center justify-center bg-gradient-to-r from-blue-600 to-purple-600 text-white px-8 py-4 rounded-xl font-semibold text-lg shadow-lg hover:shadow-xl transition-all hover:scale-105">
            Apply Now →
          </a>
          <a href="/track-application" class="w-full sm:w-auto inline-flex items-center justify-center bg-white text-gray-900 px-8 py-4 rounded-xl font-semibold text-lg border-2 border-gray-200 hover:border-blue-600 hover:text-blue-600 transition-all">
            Track Application
          </a>
        </div>
      </div>
    </section>
    
    <section class="py-16 px-4 bg-white">
      <div class="container mx-auto max-w-6xl">
        <div class="text-center mb-12">
          <h3 class="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">Accredited & Recognized</h3>
          <p class="text-gray-600 max-w-2xl mx-auto">Our programs are approved by leading regulatory bodies in Zambia</p>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <div class="bg-gradient-to-br from-white to-gray-50 rounded-2xl shadow-md hover:shadow-xl p-6 text-center border border-gray-100 transition-all hover:scale-105">
            <div class="h-16 w-16 mx-auto mb-4 flex items-center justify-center bg-blue-50 rounded-xl p-2">
              <img src="/images/accreditation/GNCLogo.webp" alt="NMCZ" loading="lazy" width="64" height="64" class="max-h-full max-w-full object-contain">
            </div>
            <h4 class="font-bold text-lg mb-2 text-gray-900">NMCZ Accredited</h4>
            <p class="text-sm text-gray-600">Nursing & Midwifery Council</p>
          </div>
          <div class="bg-gradient-to-br from-white to-gray-50 rounded-2xl shadow-md hover:shadow-xl p-6 text-center border border-gray-100 transition-all hover:scale-105">
            <div class="h-16 w-16 mx-auto mb-4 flex items-center justify-center bg-green-50 rounded-xl p-2">
              <img src="/images/accreditation/hpc_logobig.webp" alt="HPCZ" loading="lazy" width="64" height="64" class="max-h-full max-w-full object-contain">
            </div>
            <h4 class="font-bold text-lg mb-2 text-gray-900">HPCZ Accredited</h4>
            <p class="text-sm text-gray-600">Health Professions Council</p>
          </div>
          <div class="bg-gradient-to-br from-white to-gray-50 rounded-2xl shadow-md hover:shadow-xl p-6 text-center border border-gray-100 transition-all hover:scale-105">
            <div class="h-16 w-16 mx-auto mb-4 flex items-center justify-center bg-purple-50 rounded-xl p-2">
              <img src="/images/accreditation/eczlogo.webp" alt="ECZ" loading="lazy" width="64" height="64" class="max-h-full max-w-full object-contain">
            </div>
            <h4 class="font-bold text-lg mb-2 text-gray-900">ECZ Recognized</h4>
            <p class="text-sm text-gray-600">Examinations Council</p>
          </div>
          <div class="bg-gradient-to-br from-white to-gray-50 rounded-2xl shadow-md hover:shadow-xl p-6 text-center border border-gray-100 transition-all hover:scale-105">
            <div class="h-16 w-16 mx-auto mb-4 flex items-center justify-center bg-orange-50 rounded-xl p-2">
              <img src="/images/accreditation/unza.webp" alt="UNZA" loading="lazy" width="64" height="64" class="max-h-full max-w-full object-contain">
            </div>
            <h4 class="font-bold text-lg mb-2 text-gray-900">UNZA Affiliated</h4>
            <p class="text-sm text-gray-600">University of Zambia</p>
          </div>
        </div>
      </div>
    </section>
    
    <section class="py-12 px-4 bg-gradient-to-br from-blue-600 to-purple-600 text-white">
      <div class="container mx-auto max-w-4xl text-center">
        <h3 class="text-2xl sm:text-3xl font-bold mb-4">Visit Our Campus</h3>
        <p class="text-lg opacity-90 mb-2">Mukuba Institute of Health and Applied Sciences</p>
        <p class="text-base opacity-80">President Avenue, 2nd Shaft, Near Kalulushi General Hospital, Kalulushi, Zambia</p>
      </div>
    </section>
  </main>
</div>
`;

let html = fs.readFileSync(indexPath, 'utf8');

// Inject static shell into root div
html = html.replace(
  '<div id="root"></div>',
  `<div id="root">${staticShell}</div>`
);

fs.writeFileSync(indexPath, html);
console.log('✅ Static HTML shell injected');
console.log('   First paint will be instant!');
