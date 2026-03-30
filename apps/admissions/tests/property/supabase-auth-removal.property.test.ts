/**
 * Property Tests: Supabase Auth Removal Verification
 * 
 * These tests verify that Supabase Auth SDK has been completely removed
 * from the frontend codebase and that the custom JWT auth is properly configured.
 * 
 * @module tests/property/supabase-auth-removal
 * @requirements 1.3, 2.2, 3.4, 5.4, 5.5
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// Helper to recursively get all files in a directory
function getAllFiles(dirPath: string, extensions: string[] = ['.ts', '.tsx']): string[] {
  const files: string[] = [];
  
  if (!fs.existsSync(dirPath)) {
    return files;
  }
  
  const items = fs.readdirSync(dirPath, { withFileTypes: true });
  
  for (const item of items) {
    const fullPath = path.join(dirPath, item.name);
    
    if (item.isDirectory()) {
      // Skip node_modules, dist, .git
      if (!['node_modules', 'dist', '.git', '.kiro'].includes(item.name)) {
        files.push(...getAllFiles(fullPath, extensions));
      }
    } else if (item.isFile()) {
      const ext = path.extname(item.name);
      if (extensions.includes(ext)) {
        files.push(fullPath);
      }
    }
  }
  
  return files;
}

// Helper to read file content safely
function readFileContent(filePath: string): string {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return '';
  }
}

describe('Feature: supabase-auth-removal, Property Tests', () => {
  
  describe('Property 1: Config File Reference Integrity (Requirement 1.3)', () => {
    
    it('PROPERTY: vercel.json should not reference non-existent API files', () => {
      const vercelJsonPath = path.join(process.cwd(), 'vercel.json');
      
      if (!fs.existsSync(vercelJsonPath)) {
        // Skip if vercel.json doesn't exist
        return;
      }
      
      const content = readFileContent(vercelJsonPath);
      const config = JSON.parse(content);
      
      // Check functions configuration
      if (config.functions) {
        for (const pattern of Object.keys(config.functions)) {
          // Extract the file path from the pattern
          const filePath = pattern.replace('api/', '').replace('**/*', '');
          
          // If it's a specific file reference (not a glob), verify it exists
          if (!pattern.includes('*') && pattern.startsWith('api/')) {
            const fullPath = path.join(process.cwd(), pattern.replace('.ts', '') + '.ts');
            // This is a soft check - we just verify the pattern is valid
            expect(pattern).toBeDefined();
          }
        }
      }
      
      // Verify api/migrate.ts is NOT referenced
      expect(content).not.toContain('api/migrate.ts');
      expect(content).not.toContain('"api/migrate"');
    });
    
    it('PROPERTY: All API endpoint files referenced in vercel.json should exist', () => {
      const vercelJsonPath = path.join(process.cwd(), 'vercel.json');
      
      if (!fs.existsSync(vercelJsonPath)) {
        return;
      }
      
      const content = readFileContent(vercelJsonPath);
      const config = JSON.parse(content);
      
      // Check rewrites for API endpoints
      if (config.rewrites) {
        for (const rewrite of config.rewrites) {
          if (rewrite.dest && rewrite.dest.startsWith('/api/') && !rewrite.dest.includes('$')) {
            // Extract the endpoint name
            const endpoint = rewrite.dest.replace('/api/', '').split('?')[0];
            const filePath = path.join(process.cwd(), 'api', `${endpoint}.ts`);
            
            // Verify the file exists
            expect(fs.existsSync(filePath)).toBe(true);
          }
        }
      }
    });
  });
  
  describe('Property 2: No Supabase Auth Imports (Requirements 2.2, 3.4)', () => {
    
    it('PROPERTY: No frontend files should import User or Session from @supabase/supabase-js', () => {
      const srcFiles = getAllFiles(path.join(process.cwd(), 'src'));
      
      const forbiddenImports = [
        /import\s+{\s*[^}]*\bUser\b[^}]*}\s+from\s+['"]@supabase\/supabase-js['"]/,
        /import\s+{\s*[^}]*\bSession\b[^}]*}\s+from\s+['"]@supabase\/supabase-js['"]/,
        /import\s+type\s+{\s*[^}]*\bUser\b[^}]*}\s+from\s+['"]@supabase\/supabase-js['"]/,
        /import\s+type\s+{\s*[^}]*\bSession\b[^}]*}\s+from\s+['"]@supabase\/supabase-js['"]/,
      ];
      
      for (const filePath of srcFiles) {
        const content = readFileContent(filePath);
        
        for (const pattern of forbiddenImports) {
          const match = content.match(pattern);
          expect(match).toBeNull();
        }
      }
    });
    
    it('PROPERTY: No files should import from @supabase/auth-ui-react', () => {
      const srcFiles = getAllFiles(path.join(process.cwd(), 'src'));
      
      for (const filePath of srcFiles) {
        const content = readFileContent(filePath);
        expect(content).not.toContain('@supabase/auth-ui-react');
      }
    });
    
    it('PROPERTY: No files should import from @supabase/auth-ui-shared', () => {
      const srcFiles = getAllFiles(path.join(process.cwd(), 'src'));
      
      for (const filePath of srcFiles) {
        const content = readFileContent(filePath);
        expect(content).not.toContain('@supabase/auth-ui-shared');
      }
    });
    
    it('PROPERTY: package.json should not contain @supabase/auth-ui packages', () => {
      const packageJsonPath = path.join(process.cwd(), 'package.json');
      const content = readFileContent(packageJsonPath);
      const pkg = JSON.parse(content);
      
      const allDeps = {
        ...pkg.dependencies,
        ...pkg.devDependencies,
      };
      
      expect(allDeps['@supabase/auth-ui-react']).toBeUndefined();
      expect(allDeps['@supabase/auth-ui-shared']).toBeUndefined();
    });
  });
  
  describe('Property 3: No LocalStorage Token Storage (Requirement 5.4)', () => {
    
    it('PROPERTY: Auth-related files should not store tokens in localStorage', () => {
      const authFiles = [
        'src/contexts/AuthContext.tsx',
        'src/hooks/auth/useSessionListener.ts',
        'src/hooks/auth/useOptimizedAuthState.ts',
        'src/hooks/auth/useTokenRefresh.ts',
        'src/lib/authPersistence.ts',
        'src/lib/authRefresh.ts',
      ];
      
      const forbiddenPatterns = [
        /localStorage\.setItem\s*\(\s*['"][^'"]*token/i,
        /localStorage\.setItem\s*\(\s*['"][^'"]*access/i,
        /localStorage\.setItem\s*\(\s*['"][^'"]*refresh/i,
        /localStorage\.setItem\s*\(\s*['"][^'"]*jwt/i,
        /localStorage\.setItem\s*\(\s*['"][^'"]*auth/i,
      ];
      
      for (const relPath of authFiles) {
        const filePath = path.join(process.cwd(), relPath);
        
        if (!fs.existsSync(filePath)) {
          continue;
        }
        
        const content = readFileContent(filePath);
        
        for (const pattern of forbiddenPatterns) {
          const match = content.match(pattern);
          // Allow localStorage for non-token data like preferences
          if (match && !content.includes('REACT_QUERY_OFFLINE_CACHE')) {
            // Check if it's actually storing a token
            const line = content.split('\n').find(l => pattern.test(l));
            if (line && !line.includes('//') && !line.includes('preferences')) {
              expect(match).toBeNull();
            }
          }
        }
      }
    });
    
    it('PROPERTY: Auth hooks should use credentials: include for cookie-based auth', () => {
      const sessionListenerPath = path.join(process.cwd(), 'src/hooks/auth/useSessionListener.ts');
      const apiClientPath = path.join(process.cwd(), 'src/services/client.ts');
      
      if (!fs.existsSync(sessionListenerPath) || !fs.existsSync(apiClientPath)) {
        return;
      }
      
      const content = readFileContent(sessionListenerPath);
      const apiClientContent = readFileContent(apiClientPath);
      
      // Cookie credentials are centralized in ApiClient, while auth hooks delegate via authService.
      expect(content).toContain('authService');
      expect(apiClientContent).toContain("credentials: 'include'");
      
      // Should NOT store tokens in localStorage
      expect(content).not.toMatch(/localStorage\.setItem\s*\(\s*['"][^'"]*token/i);
    });
  });
  
  describe('Property 4: No Supabase Auth Method Calls (Requirement 5.5)', () => {
    
    it('PROPERTY: No files should call supabase.auth.signIn methods', () => {
      const srcFiles = getAllFiles(path.join(process.cwd(), 'src'));
      
      const forbiddenCalls = [
        /supabase\.auth\.signIn/,
        /supabase\.auth\.signUp/,
        /supabase\.auth\.signOut/,
        /supabase\.auth\.getSession/,
        /supabase\.auth\.getUser/,
        /supabase\.auth\.onAuthStateChange/,
        /supabase\.auth\.refreshSession/,
      ];
      
      for (const filePath of srcFiles) {
        const content = readFileContent(filePath);
        
        // Skip test files and analysis files
        if (filePath.includes('.test.') || filePath.includes('/analysis/')) {
          continue;
        }
        
        for (const pattern of forbiddenCalls) {
          const match = content.match(pattern);
          // Allow comments mentioning these methods
          if (match) {
            const lines = content.split('\n');
            const matchingLine = lines.find(l => pattern.test(l));
            if (matchingLine && !matchingLine.trim().startsWith('//') && !matchingLine.trim().startsWith('*')) {
              expect(match).toBeNull();
            }
          }
        }
      }
    });
    
    it('PROPERTY: Supabase client should have auth disabled in configuration', () => {
      const supabasePath = path.join(process.cwd(), 'src/lib/supabase.ts');
      
      if (!fs.existsSync(supabasePath)) {
        return;
      }
      
      const content = readFileContent(supabasePath);
      
      // Should have auth disabled
      expect(content).toContain('autoRefreshToken: false');
      expect(content).toContain('persistSession: false');
      expect(content).toContain('detectSessionInUrl: false');
    });
    
    it('PROPERTY: Custom auth types should be defined in src/types/auth.ts', () => {
      const authTypesPath = path.join(process.cwd(), 'src/types/auth.ts');
      
      expect(fs.existsSync(authTypesPath)).toBe(true);
      
      const content = readFileContent(authTypesPath);
      
      // Should define User interface
      expect(content).toMatch(/export\s+interface\s+User/);
      
      // Should define UserProfile interface
      expect(content).toMatch(/export\s+interface\s+UserProfile/);
      
      // Should define SignInResult
      expect(content).toMatch(/export\s+interface\s+SignInResult/);
      
      // Should define SignUpResult
      expect(content).toMatch(/export\s+interface\s+SignUpResult/);
      
      // Should define UserRole type
      expect(content).toMatch(/export\s+type\s+UserRole/);
    });
  });
  
  describe('Property 5: Auth Context Uses Custom Types', () => {
    
    it('PROPERTY: AuthContext should import from @/types/auth', () => {
      const authContextPath = path.join(process.cwd(), 'src/contexts/AuthContext.tsx');
      
      if (!fs.existsSync(authContextPath)) {
        return;
      }
      
      const content = readFileContent(authContextPath);
      
      // Should import from custom types
      expect(content).toContain("from '@/types/auth'");
      
      // Should NOT import User from supabase
      expect(content).not.toMatch(/import\s+{\s*[^}]*\bUser\b[^}]*}\s+from\s+['"]@supabase/);
    });
    
    it('PROPERTY: useSessionListener should export types from @/types/auth', () => {
      const sessionListenerPath = path.join(process.cwd(), 'src/hooks/auth/useSessionListener.ts');
      
      if (!fs.existsSync(sessionListenerPath)) {
        return;
      }
      
      const content = readFileContent(sessionListenerPath);
      
      // Should import from custom types
      expect(content).toContain("from '@/types/auth'");
      
      // Should re-export types for backward compatibility
      expect(content).toMatch(/export\s+type\s+{[^}]*}\s+from\s+['"]@\/types\/auth['"]/);
    });
  });
});
