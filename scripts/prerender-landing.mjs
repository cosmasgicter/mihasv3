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
<div class="min-h-screen bg-background">
  <header class="fixed top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-sm border-b border-border">
    <div class="container mx-auto px-4 py-4 flex items-center justify-between">
      <div class="flex items-center gap-3">
        <img src="/images/logos/mihas-logo.png" alt="MIHAS Logo" class="h-12 w-12" width="48" height="48">
        <div>
          <h1 class="text-xl font-bold text-foreground">MIHAS</h1>
          <p class="text-xs text-muted-foreground">Application System</p>
        </div>
      </div>
      <nav class="hidden md:flex gap-6">
        <a href="#programs" class="text-sm font-medium text-foreground hover:text-primary">Programs</a>
        <a href="#accreditation" class="text-sm font-medium text-foreground hover:text-primary">Accreditation</a>
        <a href="/auth/signin" class="text-sm font-medium text-primary">Sign In</a>
      </nav>
    </div>
  </header>
  
  <main class="pt-20">
    <section class="py-20 px-4 text-center bg-gradient-to-br from-blue-50 to-purple-50">
      <div class="container mx-auto max-w-4xl">
        <h2 class="text-4xl md:text-5xl font-bold text-foreground mb-6">
          Apply to MIHAS Today
        </h2>
        <p class="text-xl text-muted-foreground mb-8">
          Start your healthcare career with quality education
        </p>
        <div class="flex gap-4 justify-center">
          <a href="/auth/signup" class="inline-block bg-gradient-to-r from-blue-600 to-purple-600 text-white px-8 py-3 rounded-lg font-semibold hover:shadow-lg transition-shadow">
            Apply Now
          </a>
          <a href="/track-application" class="inline-block bg-white text-foreground px-8 py-3 rounded-lg font-semibold border border-border hover:shadow-lg transition-shadow">
            Track Application
          </a>
        </div>
      </div>
    </section>
    
    <section class="py-16 px-4">
      <div class="container mx-auto max-w-6xl">
        <h3 class="text-3xl font-bold text-center mb-12">Our Accreditations</h3>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <div class="bg-white rounded-lg shadow p-6 text-center border border-border">
            <div class="h-16 w-16 mx-auto mb-4 flex items-center justify-center bg-muted rounded-lg">
              <img src="/images/accreditation/GNCLogo.webp" alt="NMCZ" loading="lazy" width="64" height="64" class="max-h-full max-w-full object-contain">
            </div>
            <h4 class="font-bold text-lg mb-2">NMCZ Accredited</h4>
            <p class="text-sm text-muted-foreground">Nursing and Midwifery Council</p>
          </div>
          <div class="bg-white rounded-lg shadow p-6 text-center border border-border">
            <div class="h-16 w-16 mx-auto mb-4 flex items-center justify-center bg-muted rounded-lg">
              <img src="/images/accreditation/hpc_logobig.webp" alt="HPCZ" loading="lazy" width="64" height="64" class="max-h-full max-w-full object-contain">
            </div>
            <h4 class="font-bold text-lg mb-2">HPCZ Accredited</h4>
            <p class="text-sm text-muted-foreground">Health Professions Council</p>
          </div>
          <div class="bg-white rounded-lg shadow p-6 text-center border border-border">
            <div class="h-16 w-16 mx-auto mb-4 flex items-center justify-center bg-muted rounded-lg">
              <img src="/images/accreditation/eczlogo.webp" alt="ECZ" loading="lazy" width="64" height="64" class="max-h-full max-w-full object-contain">
            </div>
            <h4 class="font-bold text-lg mb-2">ECZ Recognized</h4>
            <p class="text-sm text-muted-foreground">Examinations Council</p>
          </div>
          <div class="bg-white rounded-lg shadow p-6 text-center border border-border">
            <div class="h-16 w-16 mx-auto mb-4 flex items-center justify-center bg-muted rounded-lg">
              <img src="/images/accreditation/unza.webp" alt="UNZA" loading="lazy" width="64" height="64" class="max-h-full max-w-full object-contain">
            </div>
            <h4 class="font-bold text-lg mb-2">UNZA Affiliated</h4>
            <p class="text-sm text-muted-foreground">University of Zambia</p>
          </div>
        </div>
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
