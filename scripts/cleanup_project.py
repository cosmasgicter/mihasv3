#!/usr/bin/env python3
"""Clean up project by organizing files into proper folders"""

import os
from pathlib import Path
import shutil

BASE_DIR = Path("/home/cosmas/Documents/Visual Code/mihasv3")

def create_folders():
    """Create organization folders"""
    folders = [
        "docs",
        "scripts", 
        "temp",
        "archive"
    ]
    
    for folder in folders:
        (BASE_DIR / folder).mkdir(exist_ok=True)
    
    print("✓ Created organization folders")

def organize_files():
    """Move files to appropriate folders"""
    
    # Documentation files
    doc_files = [
        "README.md",
        "DEPLOYMENT_GUIDE.md", 
        "PROJECT_SNAPSHOT.txt",
        "COMPLETE_SOURCE_CODE.md",
        "COMPLETE_SOURCE_INDEX.md",
        "EXTRACTION_SUMMARY.md",
        "COMPLETE_SOURCE_PHASE1_DATABASE.md",
        "START_HERE.md",
        "QUICK_REFERENCE.md", 
        "EXTRACTION_COMPLETE.md",
        "READ_ME_FIRST.md"
    ]
    
    # Script files
    script_files = [
        "extract_complete_source.sh",
        "extract_all_code.py",
        "extract_database.py", 
        "extract_api.py",
        "combine_and_cleanup.py",
        "cleanup_project.py",
        "deploy.sh",
        "local-server.js",
        "security-audit.js",
        "setup-storage.js",
        "setup-session-management.js",
        "setup-microservices.js",
        "test-storage.js",
        "test-session-management.js",
        "test-production-services.js",
        "test-services-curl.sh",
        "test-notification-system.js",
        "verify-notification-setup.js",
        "verify-api-layout.js"
    ]
    
    moved_docs = 0
    moved_scripts = 0
    
    # Move documentation files
    for filename in doc_files:
        filepath = BASE_DIR / filename
        if filepath.exists():
            shutil.move(str(filepath), str(BASE_DIR / "docs" / filename))
            print(f"✓ Moved {filename} to docs/")
            moved_docs += 1
    
    # Move script files  
    for filename in script_files:
        filepath = BASE_DIR / filename
        if filepath.exists():
            shutil.move(str(filepath), str(BASE_DIR / "scripts" / filename))
            print(f"✓ Moved {filename} to scripts/")
            moved_scripts += 1
    
    return moved_docs, moved_scripts

def move_folders():
    """Move folders to archive"""
    
    folders_to_archive = [
        "EXTRACTED_SOURCE",
        "COMPLETE_SOURCE_CODE"
    ]
    
    moved_folders = 0
    
    for foldername in folders_to_archive:
        folderpath = BASE_DIR / foldername
        if folderpath.exists():
            shutil.move(str(folderpath), str(BASE_DIR / "archive" / foldername))
            print(f"✓ Moved {foldername}/ to archive/")
            moved_folders += 1
    
    return moved_folders

def combine_extracted_files():
    """Combine all extracted files into final output"""
    
    extracted_dir = BASE_DIR / "archive" / "EXTRACTED_SOURCE"
    if not extracted_dir.exists():
        extracted_dir = BASE_DIR / "EXTRACTED_SOURCE"
    
    if not extracted_dir.exists():
        print("✗ No EXTRACTED_SOURCE folder found")
        return False
    
    output_md = BASE_DIR / "COMPLETE_SOURCE_CODE_FINAL.md"
    output_txt = BASE_DIR / "COMPLETE_SOURCE_CODE_FINAL.txt"
    
    files_to_combine = [
        "README.md", "INDEX.md", "DATABASE_COMPLETE.md", "LIB.md",
        "HOOKS_GENERAL.md", "HOOKS_ADMIN.md", "HOOKS_AUTH.md",
        "COMPONENTS_APPLICATION.md", "COMPONENTS_ADMIN.md", "COMPONENTS_UI.md",
        "COMPONENTS_STUDENT.md", "COMPONENTS_OTHER.md", "PAGES_STUDENT.md",
        "PAGES_ADMIN.md", "PAGES_AUTH.md", "PAGES_OTHER.md", "API_FUNCTIONS.md",
        "SERVICES.md", "UTILS.md", "DATA.md", "TYPES.md", "FORMS.md",
        "CONFIG.md", "ROUTES.md", "CONTEXTS.md", "STORES.md", "STYLES.md", "ROOT.md"
    ]
    
    total_size = 0
    files_combined = 0
    
    with open(output_md, 'w', encoding='utf-8') as md_out:
        md_out.write("# MIHAS V3 - COMPLETE SOURCE CODE\n")
        md_out.write("# ALL FILES COMBINED\n\n")
        md_out.write(f"Total files: {len(files_to_combine)}\n")
        md_out.write(f"Generated: 2025-01-23\n\n")
        md_out.write("=" * 80 + "\n\n")
        
        for filename in files_to_combine:
            filepath = extracted_dir / filename
            
            if filepath.exists():
                md_out.write(f"\n\n{'=' * 80}\n")
                md_out.write(f"# SOURCE FILE: {filename}\n")
                md_out.write(f"{'=' * 80}\n\n")
                
                with open(filepath, 'r', encoding='utf-8') as f:
                    content = f.read()
                    md_out.write(content)
                    total_size += len(content)
                
                files_combined += 1
    
    # Create TXT copy
    shutil.copy(output_md, output_txt)
    
    print(f"✓ Combined {files_combined} files into final output")
    print(f"✓ Total size: {total_size / 1024 / 1024:.2f} MB")
    
    return True

def main():
    """Main cleanup execution"""
    
    print("=" * 60)
    print("CLEANING UP PROJECT STRUCTURE")
    print("=" * 60)
    print()
    
    # Step 1: Create folders
    create_folders()
    
    # Step 2: Combine extracted files first
    combine_extracted_files()
    
    # Step 3: Move files
    moved_docs, moved_scripts = organize_files()
    
    # Step 4: Move folders to archive
    moved_folders = move_folders()
    
    # Final summary
    print()
    print("=" * 60)
    print("CLEANUP COMPLETE!")
    print("=" * 60)
    print()
    print(f"✓ Moved {moved_docs} documentation files to docs/")
    print(f"✓ Moved {moved_scripts} script files to scripts/")
    print(f"✓ Moved {moved_folders} folders to archive/")
    print()
    print("Project structure:")
    print("├── src/ (source code)")
    print("├── docs/ (documentation)")
    print("├── scripts/ (utility scripts)")
    print("├── archive/ (old extraction files)")
    print("├── COMPLETE_SOURCE_CODE_FINAL.md (combined source)")
    print("├── COMPLETE_SOURCE_CODE_FINAL.txt (combined source)")
    print("└── package.json, netlify.toml, etc. (config files)")
    print()
    print("🎉 PROJECT IS NOW CLEAN AND ORGANIZED!")

if __name__ == "__main__":
    main()