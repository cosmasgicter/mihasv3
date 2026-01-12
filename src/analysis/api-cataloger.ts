/**
 * API Endpoint Cataloger
 * 
 * Scans all serverless functions in the functions directory and categorizes them
 * by purpose, mapping API dependencies and data flow between endpoints.
 * 
 * Requirements: 4.1
 */

import { promises as fs } from 'fs';
import path from 'path';

export interface APIEndpoint {
  id: string;
  name: string;
  path: string;
  category: string;
  method: string[];
  description: string;
  dependencies: string[];
  middleware: string[];
  isProtected: boolean;
  parameters: string[];
  responseType: string;
  fileSize: number;
  lastModified: Date;
}

export interface APICatalog {
  endpoints: APIEndpoint[];
  categories: Record<string, number>;
  totalEndpoints: number;
  dependencyGraph: Record<string, string[]>;
  lastScanned: Date;
}

export class APIEndpointCataloguer {
  private functionsDir: string;
  private catalog: APICatalog;

  constructor(functionsDir: string = 'functions') {
    this.functionsDir = functionsDir;
    this.catalog = {
      endpoints: [],
      categories: {},
      totalEndpoints: 0,
      dependencyGraph: {},
      lastScanned: new Date()
    };
  }

  /**
   * Scan all serverless functions and build comprehensive catalog
   */
  async scanAllEndpoints(): Promise<APICatalog> {
    console.log('Starting API endpoint scan...');
    
    try {
      const endpoints = await this.discoverEndpoints();
      
      for (const endpoint of endpoints) {
        const analyzedEndpoint = await this.analyzeEndpoint(endpoint);
        this.catalog.endpoints.push(analyzedEndpoint);
      }

      this.buildCategoryStats();
      this.buildDependencyGraph();
      this.catalog.totalEndpoints = this.catalog.endpoints.length;
      this.catalog.lastScanned = new Date();

      console.log(`Scan complete. Found ${this.catalog.totalEndpoints} endpoints across ${Object.keys(this.catalog.categories).length} categories.`);
      
      return this.catalog;
    } catch (error) {
      console.error('Error during API scan:', error);
      throw error;
    }
  }

  /**
   * Discover all function files in the functions directory
   */
  private async discoverEndpoints(): Promise<string[]> {
    const endpoints: string[] = [];
    
    const scanDirectory = async (dir: string): Promise<void> => {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        if (entry.isDirectory()) {
          // Skip node_modules and other non-function directories
          if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
            await scanDirectory(fullPath);
          }
        } else if (entry.isFile()) {
          // Include JavaScript and TypeScript function files
          if (entry.name.match(/\.(js|ts)$/) && !entry.name.startsWith('.')) {
            endpoints.push(fullPath);
          }
        }
      }
    };

    await scanDirectory(this.functionsDir);
    return endpoints;
  }

  /**
   * Analyze individual endpoint file for metadata and dependencies
   */
  private async analyzeEndpoint(filePath: string): Promise<APIEndpoint> {
    const content = await fs.readFile(filePath, 'utf-8');
    const stats = await fs.stat(filePath);
    
    const relativePath = path.relative(this.functionsDir, filePath);
    const name = path.basename(filePath, path.extname(filePath));
    const category = this.categorizeEndpoint(relativePath);
    
    return {
      id: this.generateEndpointId(relativePath),
      name,
      path: relativePath,
      category,
      method: this.extractHTTPMethods(content),
      description: this.extractDescription(content),
      dependencies: this.extractDependencies(content),
      middleware: this.extractMiddleware(content),
      isProtected: this.checkIfProtected(content),
      parameters: this.extractParameters(content),
      responseType: this.extractResponseType(content),
      fileSize: stats.size,
      lastModified: stats.mtime
    };
  }

  /**
   * Categorize endpoint based on directory structure and naming patterns
   */
  private categorizeEndpoint(relativePath: string): string {
    const pathParts = relativePath.split('/');
    
    // Primary categorization by directory
    if (pathParts.includes('admin')) return 'admin';
    if (pathParts.includes('auth')) return 'authentication';
    if (pathParts.includes('applications')) return 'applications';
    if (pathParts.includes('notifications')) return 'notifications';
    if (pathParts.includes('payments')) return 'payments';
    if (pathParts.includes('ai')) return 'ai-services';
    if (pathParts.includes('analytics')) return 'analytics';
    if (pathParts.includes('documents')) return 'documents';
    if (pathParts.includes('interview')) return 'interview';
    if (pathParts.includes('catalog')) return 'catalog';
    if (pathParts.includes('cron')) return 'scheduled-tasks';
    if (pathParts.includes('debug')) return 'debugging';
    if (pathParts.includes('mcp')) return 'mcp-integration';
    if (pathParts.includes('push')) return 'push-notifications';
    if (pathParts.includes('send')) return 'messaging';
    if (pathParts.includes('_lib')) return 'utilities';
    
    // Secondary categorization by filename patterns
    const filename = path.basename(relativePath, path.extname(relativePath));
    if (filename.includes('test')) return 'testing';
    if (filename.includes('health')) return 'monitoring';
    if (filename === '_middleware') return 'middleware';
    
    return 'general';
  }

  /**
   * Extract HTTP methods from function content
   */
  private extractHTTPMethods(content: string): string[] {
    const methods: string[] = [];
    const methodPatterns = [
      /request\.method\s*===\s*['"`](\w+)['"`]/gi,
      /method\s*:\s*['"`](\w+)['"`]/gi,
      /\.(\w+)\s*\(/gi // Express-style method calls
    ];

    for (const pattern of methodPatterns) {
      const matches = content.matchAll(pattern);
      for (const match of matches) {
        const method = match[1]?.toUpperCase();
        if (method && ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'].includes(method)) {
          if (!methods.includes(method)) {
            methods.push(method);
          }
        }
      }
    }

    // Default to GET if no methods found
    return methods.length > 0 ? methods : ['GET'];
  }

  /**
   * Extract description from comments or JSDoc
   */
  private extractDescription(content: string): string {
    // Look for JSDoc description
    const jsdocMatch = content.match(/\/\*\*\s*\n\s*\*\s*(.+?)\s*\n/);
    if (jsdocMatch) {
      return jsdocMatch[1].trim();
    }

    // Look for single-line comment at top
    const commentMatch = content.match(/^\/\/\s*(.+?)$/m);
    if (commentMatch) {
      return commentMatch[1].trim();
    }

    // Look for export description
    const exportMatch = content.match(/export\s+(?:default\s+)?(?:async\s+)?function\s+\w+[^{]*{\s*\/\/\s*(.+?)$/m);
    if (exportMatch) {
      return exportMatch[1].trim();
    }

    return 'No description available';
  }

  /**
   * Extract dependencies from import statements and require calls
   */
  private extractDependencies(content: string): string[] {
    const dependencies: string[] = [];
    
    // ES6 imports
    const importMatches = content.matchAll(/import\s+.*?\s+from\s+['"`]([^'"`]+)['"`]/g);
    for (const match of importMatches) {
      dependencies.push(match[1]);
    }

    // CommonJS requires
    const requireMatches = content.matchAll(/require\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g);
    for (const match of requireMatches) {
      dependencies.push(match[1]);
    }

    // Dynamic imports
    const dynamicImportMatches = content.matchAll(/import\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g);
    for (const match of dynamicImportMatches) {
      dependencies.push(match[1]);
    }

    return [...new Set(dependencies)]; // Remove duplicates
  }

  /**
   * Extract middleware usage
   */
  private extractMiddleware(content: string): string[] {
    const middleware: string[] = [];
    
    // Look for middleware imports and usage
    const middlewarePatterns = [
      /middleware/gi,
      /cors/gi,
      /auth/gi,
      /rateLimiter/gi,
      /validation/gi
    ];

    for (const pattern of middlewarePatterns) {
      if (pattern.test(content)) {
        middleware.push(pattern.source.toLowerCase());
      }
    }

    return [...new Set(middleware)];
  }

  /**
   * Check if endpoint requires authentication
   */
  private checkIfProtected(content: string): boolean {
    const protectionPatterns = [
      /auth/i,
      /token/i,
      /bearer/i,
      /authorization/i,
      /protected/i,
      /authenticate/i,
      /requireAuth/i
    ];

    return protectionPatterns.some(pattern => pattern.test(content));
  }

  /**
   * Extract parameters from function signature and request handling
   */
  private extractParameters(content: string): string[] {
    const parameters: string[] = [];
    
    // Look for request parameter extraction
    const paramPatterns = [
      /request\.query\.(\w+)/g,
      /request\.body\.(\w+)/g,
      /request\.params\.(\w+)/g,
      /url\.searchParams\.get\(['"`](\w+)['"`]\)/g
    ];

    for (const pattern of paramPatterns) {
      const matches = content.matchAll(pattern);
      for (const match of matches) {
        if (match[1] && !parameters.includes(match[1])) {
          parameters.push(match[1]);
        }
      }
    }

    return parameters;
  }

  /**
   * Extract response type from return statements
   */
  private extractResponseType(content: string): string {
    if (content.includes('Response.json') || content.includes('json()')) {
      return 'application/json';
    }
    if (content.includes('text/html') || content.includes('html')) {
      return 'text/html';
    }
    if (content.includes('text/plain') || content.includes('text()')) {
      return 'text/plain';
    }
    if (content.includes('redirect')) {
      return 'redirect';
    }
    
    return 'application/json'; // Default
  }

  /**
   * Generate unique endpoint ID
   */
  private generateEndpointId(relativePath: string): string {
    return relativePath.replace(/[\/\\]/g, '_').replace(/\.(js|ts)$/, '');
  }

  /**
   * Build category statistics
   */
  private buildCategoryStats(): void {
    this.catalog.categories = {};
    
    for (const endpoint of this.catalog.endpoints) {
      this.catalog.categories[endpoint.category] = 
        (this.catalog.categories[endpoint.category] || 0) + 1;
    }
  }

  /**
   * Build dependency graph showing relationships between endpoints
   */
  private buildDependencyGraph(): void {
    this.catalog.dependencyGraph = {};
    
    for (const endpoint of this.catalog.endpoints) {
      this.catalog.dependencyGraph[endpoint.id] = endpoint.dependencies
        .filter(dep => dep.startsWith('./') || dep.startsWith('../'))
        .map(dep => this.normalizeDependencyPath(dep, endpoint.path));
    }
  }

  /**
   * Normalize dependency paths for graph building
   */
  private normalizeDependencyPath(dependency: string, fromPath: string): string {
    const fromDir = path.dirname(fromPath);
    const resolvedPath = path.resolve(fromDir, dependency);
    return path.relative(this.functionsDir, resolvedPath);
  }

  /**
   * Get catalog summary
   */
  getCatalogSummary(): object {
    return {
      totalEndpoints: this.catalog.totalEndpoints,
      categories: this.catalog.categories,
      lastScanned: this.catalog.lastScanned,
      topCategories: Object.entries(this.catalog.categories)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 5)
    };
  }

  /**
   * Export catalog to JSON
   */
  async exportCatalog(outputPath: string): Promise<void> {
    await fs.writeFile(outputPath, JSON.stringify(this.catalog, null, 2));
    console.log(`API catalog exported to ${outputPath}`);
  }

  /**
   * Get endpoints by category
   */
  getEndpointsByCategory(category: string): APIEndpoint[] {
    return this.catalog.endpoints.filter(endpoint => endpoint.category === category);
  }

  /**
   * Search endpoints by name or description
   */
  searchEndpoints(query: string): APIEndpoint[] {
    const lowerQuery = query.toLowerCase();
    return this.catalog.endpoints.filter(endpoint => 
      endpoint.name.toLowerCase().includes(lowerQuery) ||
      endpoint.description.toLowerCase().includes(lowerQuery) ||
      endpoint.path.toLowerCase().includes(lowerQuery)
    );
  }
}